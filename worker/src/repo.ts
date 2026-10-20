// The repo operations behind public edits: branches, commits, pull requests, labels and comments, as REST calls made
// as the GitHub App (github.ts). Each function is one API call, so an edit's cost in calls is easy to read off.
import type { Env } from './env.ts';
import { GitHubError, github } from './github.ts';

const repoPath = (env: Env) => `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

async function call<T>(env: Env, path: string, init: RequestInit = {}, okStatuses = [200, 201]): Promise<T> {
	const response = await github(env, path, {
		...init,
		headers: init.body ? { 'Content-Type': 'application/json' } : {},
	});
	if (!okStatuses.includes(response.status)) {
		throw new GitHubError(`${init.method ?? 'GET'} ${path} failed (${response.status}).`, response.status);
	}
	return (response.status === 204 ? undefined : await response.json()) as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

/** UTF-8 text as base64, in chunks so a large page doesn't exceed the engine's argument limit. */
function base64Utf8(text: string) {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** The commit SHA a branch points at, or undefined if the branch doesn't exist. */
export async function branchSha(env: Env, branch: string) {
	const response = await github(env, `${repoPath(env)}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`);
	if (response.status === 404) return undefined;
	if (!response.ok) throw new GitHubError(`Could not read branch ${branch} (${response.status}).`, response.status);
	return ((await response.json()) as { object: { sha: string } }).object.sha;
}

export const createBranch = (env: Env, branch: string, sha: string) =>
	call(env, `${repoPath(env)}/git/refs`, json('POST', { ref: `refs/heads/${branch}`, sha }));

/** Points an existing branch at `sha`, discarding what was on it. Used for a branch left over from a closed edit. */
export const resetBranch = (env: Env, branch: string, sha: string) =>
	call(env, `${repoPath(env)}/git/refs/heads/${branch}`, json('PATCH', { sha, force: true }));

export type PullRequest = { number: number; html_url: string };

/** The open pull request from `branch`, if there is one. */
export async function openPullFrom(env: Env, branch: string) {
	const head = encodeURIComponent(`${env.GITHUB_OWNER}:${branch}`);
	const pulls = await call<PullRequest[]>(env, `${repoPath(env)}/pulls?state=open&head=${head}&per_page=1`);
	return pulls[0];
}

/** Writes a file on `branch` as one commit. `sha` is the blob being replaced: GitHub refuses the write if it changed. */
export function commitFile(
	env: Env,
	options: { path: string; branch: string; sha: string; text: string; message: string; author: { name: string; email: string } },
) {
	const content = base64Utf8(options.text);
	return call<{ commit: { sha: string } }>(
		env,
		`${repoPath(env)}/contents/${options.path.split('/').map(encodeURIComponent).join('/')}`,
		json('PUT', {
			message: options.message,
			content,
			sha: options.sha,
			branch: options.branch,
			// The committer is the app itself, which GitHub fills in from the token.
			author: options.author,
		}),
	);
}

export const createPull = (env: Env, options: { title: string; head: string; body: string }) =>
	call<PullRequest>(
		env,
		`${repoPath(env)}/pulls`,
		json('POST', { title: options.title, head: options.head, base: env.GITHUB_BASE_BRANCH, body: options.body }),
	);

export const addLabels = (env: Env, number: number, labels: string[]) =>
	call(env, `${repoPath(env)}/issues/${number}/labels`, json('POST', { labels }));

export const addComment = (env: Env, number: number, body: string) =>
	call(env, `${repoPath(env)}/issues/${number}/comments`, json('POST', { body }));

/** How many public-edit pull requests were opened since `since` (an ISO 8601 time with offset). */
export async function publicEditsSince(env: Env, since: string) {
	const q = `repo:${env.GITHUB_OWNER}/${env.GITHUB_REPO} is:pr label:public-edit created:>=${since}`;
	const result = await call<{ total_count: number }>(env, `/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
	return result.total_count;
}
