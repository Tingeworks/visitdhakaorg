import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { clearTokenCache } from '../src/github.ts';
import { FakeGitHub, blobSha } from './fake-github.ts';
import { dhakaDayStart } from '../src/pages.ts';
import { pem, testEnv } from './helpers.ts';
import type { Env } from '../src/env.ts';

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
const env = testEnv({
	GITHUB_APP_ID: '12345',
	GITHUB_INSTALLATION_ID: '678',
	GITHUB_APP_PRIVATE_KEY: pem,
	TURNSTILE_SECRET_KEY: 'secret',
});

const path = 'src/content/docs/attractions/lalbagh-fort.md';
const original = [
	'---',
	'title: Lalbagh Fort',
	'tags: [mughal, fort]',
	'verified: true',
	'---',
	'',
	'Lalbagh Fort is a Mughal fort in Old Dhaka.',
	'',
].join('\n');
const bnPath = 'src/content/docs/bn/attractions/lalbagh-fort.md';
const bnOriginal = '---\ntitle: লালবাগ কেল্লা\nverified: false\n---\n\nলালবাগ কেল্লা একটি মুঘল দুর্গ।\n';

let gh: FakeGitHub;
const realFetch = globalThis.fetch;
beforeEach(() => {
	gh = new FakeGitHub({ [path]: original, [bnPath]: bnOriginal, 'src/content/docs/privacy.md': '---\ntitle: P\n---\n' });
	gh.install();
});
afterEach(() => {
	globalThis.fetch = realFetch;
	clearTokenCache();
});

const post = (input: unknown, headers: Record<string, string> = {}, configuration: Env = env) =>
	worker.fetch(
		new Request('https://visitdhaka.org/api/edit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: typeof input === 'string' ? input : JSON.stringify(input),
		}),
		configuration,
		ctx,
	);

const source = async (page = path) =>
	(await worker.fetch(new Request(`https://visitdhaka.org/api/source?path=${page}`), env, ctx)).json();

/** A valid edit of `page`, based on its current version on main. */
const anEdit = async (overrides: Record<string, unknown> = {}, page = path, text = original) => ({
	path: page,
	body: '\nLalbagh Fort is an unfinished Mughal fort in Old Dhaka.\n',
	baseSha: await blobSha(text),
	name: 'Rahim',
	summary: 'Mention that it was never finished',
	turnstile: 'pass',
	licence: true,
	...overrides,
});

describe('POST /api/edit: first edit to a page', () => {
	test('opens a pull request from the page branch, with server-owned frontmatter', async () => {
		const response = await post(await anEdit());
		assert.equal(response.status, 201);
		assert.deepEqual(await response.json(), {
			ok: true,
			prUrl: 'https://github.com/Tingeworks/visitdhakaorg/pull/1',
			prNumber: 1,
			updated: false,
		});

		const file = gh.filesOn('edit/attractions/lalbagh-fort').get(path)!;
		assert.equal(
			file,
			'---\ntitle: Lalbagh Fort\ntags: [mughal, fort]\nverified: false\ncontributors:\n  - Rahim\n---\n\nLalbagh Fort is an unfinished Mughal fort in Old Dhaka.\n',
		);
		assert.equal(gh.filesOn('main').get(path), original, 'main is untouched');

		const commit = gh.commits.get(gh.branches.get('edit/attractions/lalbagh-fort')!)!;
		assert.deepEqual(commit.author, { name: 'Rahim', email: 'anonymous@visitdhaka.org' });
		assert.equal(commit.message, 'Edit: Lalbagh Fort\n\nMention that it was never finished\n\nEdited-by: Rahim (unverified)');

		const [pull] = gh.pulls;
		assert.equal(pull.title, 'Edit: Lalbagh Fort');
		assert.equal(pull.head, 'edit/attractions/lalbagh-fort');
		assert.deepEqual(pull.labels, ['public-edit']);
		assert.match(pull.body, /\| Contributor \| `Rahim` \(unverified\) \|/);
		assert.match(pull.body, /\| Page \| https:\/\/visitdhaka\.org\/attractions\/lalbagh-fort\/ \|/);
		assert.match(pull.body, /never squash/);
	});

	test('makes at most 8 GitHub calls', async () => {
		await post(await anEdit());
		assert.ok(gh.calls.length <= 8, gh.calls.join('\n'));
		console.log(`GitHub calls for a first edit: ${gh.calls.length}`);
	});

	test('credits an edit without a name to Anonymous', async () => {
		await post(await anEdit({ name: '' }));
		assert.match(gh.filesOn('edit/attractions/lalbagh-fort').get(path)!, /contributors:\n {2}- Anonymous\n/);
	});

	test('puts names and summaries in code spans, so they cannot @-mention or link', async () => {
		await post(await anEdit({ name: '@octocat', summary: 'see @someone' }));
		assert.match(gh.pulls[0].body, /`@octocat`/);
		assert.match(gh.pulls[0].body, /`see @someone`/);
	});

	test('ignores an email in the request', async () => {
		await post(await anEdit({ email: 'someone@example.org' }));
		const commit = gh.commits.get(gh.branches.get('edit/attractions/lalbagh-fort')!)!;
		assert.equal(commit.author!.email, 'anonymous@visitdhaka.org');
	});

	test('labels and lists external links added', async () => {
		await post(await anEdit({ body: '\nLalbagh Fort. Tickets at <https://tickets.example/lalbagh>.\n' }));
		assert.deepEqual(gh.pulls[0].labels, ['public-edit', 'links-added']);
		assert.match(gh.pulls[0].body, /- `https:\/\/tickets\.example\/lalbagh`/);
	});

	test('edits a Bangla page on its own branch, keeping Unicode intact', async () => {
		const response = await post(await anEdit({ body: '\nলালবাগ কেল্লা একটি অসমাপ্ত মুঘল দুর্গ।\n', name: 'রহিম' }, bnPath, bnOriginal));
		assert.equal(response.status, 201);
		assert.equal(
			gh.filesOn('edit/bn/attractions/lalbagh-fort').get(bnPath),
			'---\ntitle: লালবাগ কেল্লা\nverified: false\ncontributors:\n  - রহিম\n---\n\nলালবাগ কেল্লা একটি অসমাপ্ত মুঘল দুর্গ।\n',
		);
		assert.match(gh.pulls[0].body, /https:\/\/visitdhaka\.org\/bn\/attractions\/lalbagh-fort\//);
	});

	test('starts a fresh pull request from a branch left over from a closed one', async () => {
		await post(await anEdit());
		gh.pulls[0].state = 'closed';
		const response = await post(await anEdit({ name: 'Karim' }));
		assert.equal(response.status, 201);
		assert.equal(gh.pulls.length, 2);
		assert.match(gh.filesOn('edit/attractions/lalbagh-fort').get(path)!, /contributors:\n {2}- Karim\n---/);
	});
});

describe('POST /api/edit: second edit to the same page', () => {
	test('shows the pending version in /api/source and adds a commit to the same pull request', async () => {
		await post(await anEdit());
		const pending = await source();
		assert.deepEqual(pending.pending, { prUrl: 'https://github.com/Tingeworks/visitdhakaorg/pull/1' });
		assert.equal(pending.body, '\nLalbagh Fort is an unfinished Mughal fort in Old Dhaka.\n');

		gh.calls = [];
		const response = await post(
			await anEdit({ baseSha: pending.sha, body: `${pending.body}\nIt has a mosque and a tomb.\n`, name: 'Karim', summary: '' }),
		);
		console.log(`GitHub calls for a second edit: ${gh.calls.length}`);
		assert.ok(gh.calls.length <= 8, gh.calls.join('\n'));
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			ok: true,
			prUrl: 'https://github.com/Tingeworks/visitdhakaorg/pull/1',
			prNumber: 1,
			updated: true,
		});
		assert.equal(gh.pulls.length, 1);
		const file = gh.filesOn('edit/attractions/lalbagh-fort').get(path)!;
		assert.match(file, /contributors:\n {2}- Rahim\n {2}- Karim\n/);
		assert.match(file, /It has a mosque and a tomb\./);
		assert.match(gh.comments[0].body, /by `Karim` \(unverified\)/);
		const commit = gh.commits.get(gh.branches.get('edit/attractions/lalbagh-fort')!)!;
		assert.deepEqual(commit.author, { name: 'Karim', email: 'anonymous@visitdhaka.org' });
	});

	test('refuses an edit based on main while a pending edit exists', async () => {
		await post(await anEdit());
		const response = await post(await anEdit({ name: 'Karim' }));
		assert.equal(response.status, 409);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'stale', field: 'baseSha' }] });
	});
});

describe('POST /api/edit: errors', () => {
	const nothingWritten = () => {
		assert.equal(gh.pulls.length, 0);
		assert.deepEqual([...gh.branches.keys()], ['main']);
	};

	test('fails Turnstile before touching GitHub', async () => {
		const response = await post(await anEdit({ turnstile: 'fail' }));
		assert.equal(response.status, 403);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'turnstile_failed', field: 'turnstile' }] });
		assert.deepEqual(gh.calls, []);
		assert.equal((await post(await anEdit({ turnstile: undefined }))).status, 403);
	});

	test('reports every invalid field at once with 422', async () => {
		const response = await post(await anEdit({ licence: false, name: 'x'.repeat(41), baseSha: 'nope', path: 'src/content/docs/privacy.md' }));
		assert.equal(response.status, 422);
		assert.deepEqual(await response.json(), {
			ok: false,
			errors: [
				{ field: 'licence', code: 'licence_required' },
				{ field: 'path', code: 'path_not_editable' },
				{ field: 'name', code: 'name_too_long' },
				{ field: 'baseSha', code: 'base_sha_invalid' },
			],
		});
		assert.deepEqual(gh.calls, []);
	});

	test('rejects an unsafe body with 422 and writes nothing', async () => {
		const response = await post(await anEdit({ body: '\n<script>alert(1)</script>\n' }));
		assert.equal(response.status, 422);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ field: 'body', code: 'body_has_html' }] });
		nothingWritten();
	});

	test('rejects an edit that changes nothing', async () => {
		const response = await post(await anEdit({ body: '\nLalbagh Fort is a Mughal fort in Old Dhaka.\n' }));
		assert.equal(response.status, 422);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'no_change', field: 'body' }] });
		nothingWritten();
	});

	test('refuses an edit based on an old version, with 409', async () => {
		const response = await post(await anEdit({ baseSha: await blobSha('an older version') }));
		assert.equal(response.status, 409);
		nothingWritten();
	});

	test('reports a write race as stale', async () => {
		gh.failNextCommit = true;
		const response = await post(await anEdit());
		assert.equal(response.status, 409);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'stale', field: 'baseSha' }] });
		assert.equal(gh.pulls.length, 0);
	});

	test('stops at the daily cap, and a cap of 0 makes no GitHub calls', async () => {
		gh.searchCount = 50;
		const capped = await post(await anEdit());
		assert.equal(capped.status, 429);
		assert.deepEqual(await capped.json(), { ok: false, errors: [{ code: 'daily_cap_reached' }] });
		nothingWritten();

		gh.calls = [];
		const off = await post(await anEdit(), {}, { ...env, DAILY_EDIT_CAP: '0' });
		assert.equal(off.status, 429);
		assert.deepEqual(gh.calls, []);
		assert.equal((await post(await anEdit(), {}, { ...env, DAILY_EDIT_CAP: 'oops' })).status, 429);
		for (const cap of ['50oops', '1.5', 'Infinity', '-1']) {
			assert.equal((await post(await anEdit(), {}, { ...env, DAILY_EDIT_CAP: cap })).status, 429);
		}
		assert.deepEqual(gh.calls, []);
	});

	test('keeps editing closed when the dashboard cap is missing', async () => {
		const response = await post(await anEdit(), {}, { ...env, DAILY_EDIT_CAP: undefined });
		assert.equal(response.status, 429);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'daily_cap_reached' }] });
		assert.deepEqual(gh.calls, []);
		nothingWritten();
	});

	test('cancels an oversized chunked request before consuming its remaining body', async () => {
		let reads = 0;
		let cancelled = false;
		const stream = new ReadableStream({
			pull(controller) {
				reads++;
				controller.enqueue(new Uint8Array(100_001));
			},
			cancel() { cancelled = true; },
		}, { highWaterMark: 0 });
		const request = new Request('https://visitdhaka.org/api/edit', {
			method: 'POST', body: stream, duplex: 'half',
		} as RequestInit);
		assert.equal((await worker.fetch(request, env, ctx)).status, 413);
		assert.equal(reads, 2);
		assert.equal(cancelled, true);
		assert.deepEqual(gh.calls, []);
	});

	test('counts the day from midnight in Dhaka, not UTC', () => {
		// 19:30 UTC on 20 October is 01:30 on 21 October in Dhaka (UTC+6).
		assert.equal(dhakaDayStart(new Date('2026-10-20T19:30:00Z')), '2026-10-21T00:00:00+06:00');
		assert.equal(dhakaDayStart(new Date('2026-10-20T17:59:59Z')), '2026-10-20T00:00:00+06:00');
	});

	test('returns 404 for a page that does not exist', async () => {
		const response = await post(await anEdit({ path: 'src/content/docs/areas/atlantis.md' }));
		assert.equal(response.status, 404);
		nothingWritten();
	});

	test('rejects other origins, bad JSON and oversized requests', async () => {
		assert.equal((await post(await anEdit(), { Origin: 'https://evil.example' })).status, 403);
		assert.equal((await post('{not json')).status, 400);
		assert.equal((await post('[1, 2]')).status, 400);
		assert.equal((await post('x'.repeat(200_001))).status, 413);
		assert.deepEqual(gh.calls, []);
	});

	test('needs the Turnstile secret', async () => {
		const response = await post(await anEdit(), {}, { ...env, TURNSTILE_SECRET_KEY: undefined });
		assert.equal(response.status, 503);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'not_configured' }] });
	});
});
