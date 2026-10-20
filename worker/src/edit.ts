// POST /api/edit: turns a reader's edit into a pull request (docs/architecture/open-editing.md, "Edit request").
// Checks run cheapest and safest first: Turnstile, then the request's own fields, then the daily cap, and only then
// anything that reads or writes the repo. Nothing is written until every check has passed.
import type { Env } from './env.ts';
import { readFrontmatter, rewriteFile, splitFile } from './frontmatter.ts';
import { GitHubError, getFile } from './github.ts';
import { error, isAllowedOrigin, json, validationErrors } from './http.ts';
import { authorFor, identify } from './identity.ts';
import { branchFor, dhakaDayStart, pageUrl, sourceCacheKey } from './pages.ts';
import {
	addComment,
	addLabels,
	branchSha,
	commitFile,
	createBranch,
	createPull,
	openPullFrom,
	publicEditsSince,
	resetBranch,
} from './repo.ts';
import { verifyTurnstile } from './turnstile.ts';
import { cleanSummary, validateBody, validatePath, type BodyFlags, type ValidationError } from './validate.ts';

/** Edit requests are JSON with a body of at most 50 KB, so anything much bigger isn't a real edit. */
const MAX_REQUEST_BYTES = 200_000;
const SITE = 'https://visitdhaka.org';

/** The daily cap from DAILY_EDIT_CAP. A missing or unreadable value counts as 0, so a mistake closes editing. */
const dailyCap = (env: Env) => {
	const cap = Number(env.DAILY_EDIT_CAP);
	return Number.isSafeInteger(cap) && cap > 0 ? cap : 0;
};

/** Bound reads even when a chunked request has no trustworthy Content-Length. */
async function readRequest(request: Request) {
	const reader = request.body?.getReader();
	if (!reader) return '';
	const decoder = new TextDecoder();
	let size = 0;
	let text = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return text + decoder.decode();
			size += value.byteLength;
			if (size > MAX_REQUEST_BYTES) {
				await reader.cancel();
				return undefined;
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
}

/** Plain text in a Markdown code span, so it can't format, link or @-mention anyone in a pull request. */
const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;

function pullBody(options: { title: string; path: string; name: string; summary: string; flags: BodyFlags }) {
	const { title, path, name, summary, flags } = options;
	const lines = [
		`A public edit to **${title}**, made with the site's editor.`,
		'',
		'| | |',
		'| :--- | :--- |',
		`| Contributor | ${code(name)} (unverified) |`,
		`| Summary | ${summary ? code(summary) : '_none_'} |`,
		`| File | ${code(path)} |`,
		`| Page | ${SITE}${pageUrl(path)} |`,
		`| Size of change | about ${flags.diffBytes.toLocaleString('en')} bytes |`,
		`| External links added | ${flags.linksAdded.length} |`,
	];
	if (flags.linksAdded.length > 0) {
		lines.push('', '**External links added.** Open each one before merging:', '', ...flags.linksAdded.map((url) => `- ${code(url)}`));
	}
	lines.push(
		'',
		'### Review (see `docs/architecture/moderation.md`)',
		'',
		'- [ ] New or changed facts checked against a source (hours, fees, prices, visa, health and safety)',
		'- [ ] Every added link checked',
		'- [ ] No spam, promotion, copied text or personal data',
		'- [ ] The contributor name is acceptable',
		'- [ ] Tone and format fit the page',
		'',
		'`verified` has been set to `false`. Merge with **Create a merge commit** or **Rebase and merge**, never squash.',
	);
	return lines.join('\n');
}

const commentBody = (options: { name: string; summary: string; flags: BodyFlags }) =>
	[
		`Another edit was added to this pull request by ${code(options.name)} (unverified).`,
		'',
		`- Summary: ${options.summary ? code(options.summary) : '_none_'}`,
		`- Size of change: about ${options.flags.diffBytes.toLocaleString('en')} bytes`,
		...(options.flags.linksAdded.length > 0
			? ['- External links added:', ...options.flags.linksAdded.map((url) => `  - ${code(url)}`)]
			: []),
	].join('\n');

const commitMessage = (title: string, summary: string, name: string) =>
	[`Edit: ${title}`, ...(summary ? ['', summary] : []), '', `Edited-by: ${name} (unverified)`].join('\n');

export async function edit(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	if (!isAllowedOrigin(request, env)) return error(403, 'origin_not_allowed');
	if (Number(request.headers.get('Content-Length') ?? 0) > MAX_REQUEST_BYTES) return error(413, 'request_too_large');
	const raw = await readRequest(request);
	if (raw === undefined) return error(413, 'request_too_large');
	let input: Record<string, unknown>;
	try {
		input = JSON.parse(raw);
		if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
	} catch {
		return error(400, 'invalid_json');
	}

	// 1. Turnstile, before anything else touches GitHub.
	if (!(await verifyTurnstile(env, input.turnstile, request.headers.get('CF-Connecting-IP')))) {
		return error(403, 'turnstile_failed', 'turnstile');
	}

	// 2. The request's own fields.
	const errors: ValidationError[] = [];
	if (input.licence !== true) errors.push({ field: 'licence', code: 'licence_required' });
	const path = validatePath(input.path);
	if (!path.ok) errors.push(...path.errors);
	const who = identify(request, input);
	if (!who.ok) errors.push(...who.errors);
	const summary = cleanSummary(input.summary);
	if (!summary.ok) errors.push(...summary.errors);
	if (typeof input.baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(input.baseSha)) {
		errors.push({ field: 'baseSha', code: 'base_sha_invalid' });
	}
	if (typeof input.body !== 'string') errors.push({ field: 'body', code: 'body_invalid' });
	if (errors.length > 0 || !path.ok || !who.ok || !summary.ok) return validationErrors(errors, 422);

	// 3. The daily cap. 0 turns editing off without a single GitHub call.
	const cap = dailyCap(env);
	if (cap === 0 || (await publicEditsSince(env, dhakaDayStart())) >= cap) return error(429, 'daily_cap_reached');

	// 4. Where this edit goes: the page's open pull request if there is one, otherwise a new one from the base branch.
	const branch = branchFor(path.value);
	const existingBranch = await branchSha(env, branch);
	const pull = existingBranch ? await openPullFrom(env, branch) : undefined;
	const file = await getFile(env, path.value, pull ? branch : env.GITHUB_BASE_BRANCH);
	if (!file) return error(404, 'not_found', 'path');

	// 5. Never overwrite newer content: the edit must be based on the version it would replace.
	if (file.sha !== input.baseSha) return error(409, 'stale', 'baseSha');

	const current = splitFile(file.text);
	const body = validateBody(input.body, current.body);
	if (!body.ok) return validationErrors(body.errors, 422);
	if (body.value.body === current.body) return error(422, 'no_change', 'body');

	const { title: rawTitle } = readFrontmatter(file.text);
	const title = typeof rawTitle === 'string' && rawTitle ? rawTitle : pageUrl(path.value);
	const identity = who.value;
	const { flags } = body.value;

	// 6. Write: a branch if needed, one commit, then the pull request or a note on the existing one.
	if (!pull) {
		const baseSha = await branchSha(env, env.GITHUB_BASE_BRANCH);
		if (!baseSha) throw new Error(`The base branch ${env.GITHUB_BASE_BRANCH} doesn't exist.`);
		// A branch left over from a closed edit is reset, so the new pull request holds only this edit.
		try {
			if (existingBranch) await resetBranch(env, branch, baseSha);
			else await createBranch(env, branch, baseSha);
		} catch (cause) {
			// Another edit to the same page created the branch a moment ago.
			if (cause instanceof GitHubError && cause.status === 422) return error(409, 'conflict');
			throw cause;
		}
	}
	try {
		await commitFile(env, {
			path: path.value,
			branch,
			sha: file.sha,
			text: rewriteFile(file.text, body.value.body, identity.name),
			message: commitMessage(title, summary.value, identity.name),
			author: authorFor(identity),
		});
	} catch (cause) {
		// The file changed between reading and writing it.
		if (cause instanceof GitHubError && (cause.status === 409 || cause.status === 422)) return error(409, 'stale', 'baseSha');
		throw cause;
	}

	let pr = pull;
	if (pr) {
		await addComment(env, pr.number, commentBody({ name: identity.name, summary: summary.value, flags }));
		if (flags.linksAdded.length > 0) await addLabels(env, pr.number, ['links-added']);
	} else {
		pr = await createPull(env, {
			title: `Edit: ${title}`,
			head: branch,
			body: pullBody({ title, path: path.value, name: identity.name, summary: summary.value, flags }),
		});
		await addLabels(env, pr.number, ['public-edit', ...(flags.linksAdded.length > 0 ? ['links-added'] : [])]);
	}

	// The next editor in this data centre should see this version straight away rather than a cached one.
	if (typeof caches !== 'undefined') ctx.waitUntil(caches.default.delete(sourceCacheKey(path.value)));
	return json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, updated: Boolean(pull) }, pull ? 200 : 201);
}
