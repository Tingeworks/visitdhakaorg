// The edit Worker (decision 0002, docs/architecture/open-editing.md). It answers only under /api/. Routes are matched
// on the exact path. Only optional Google sign-in (/api/auth/*, decision 0006, #57) sets cookies, and only once someone
// clicks "Sign in". The other routes set none.
import { authRoutes } from './auth.ts';
import { edit } from './edit.ts';
import type { Env } from './env.ts';
import { splitFile, readFrontmatter } from './frontmatter.ts';
import { GitHubError, NotConfiguredError, getFile, installationToken } from './github.ts';
import { GoogleError } from './google.ts';
import { error, json, preflight, validationErrors, withCors } from './http.ts';
import { branchFor, sourceCacheKey, usersCacheKey } from './pages.ts';
import { branchSha, openPullFrom } from './repo.ts';
import { listUsers } from './users.ts';
import { validatePath } from './validate.ts';

type Handler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/** How long GET /api/source responses are cached at the edge, so page views don't spend GitHub API calls. */
const SOURCE_CACHE_SECONDS = 60;
/** How long GET /api/users responses are cached at the edge. Only site builds read it. */
const USERS_CACHE_SECONDS = 300;

/** Whether the Worker is up and can authenticate to GitHub. Never includes a secret. */
const health: Handler = async (_request, env) => {
	let github: 'ok' | 'unauthenticated' | 'not_configured' | 'error';
	let detail: string | undefined;
	try {
		github = (await installationToken(env)) ? 'ok' : 'unauthenticated';
	} catch (cause) {
		github = cause instanceof NotConfiguredError ? 'not_configured' : 'error';
		// Only our own configuration messages, which name what's missing but never contain a value.
		if (cause instanceof NotConfiguredError) detail = cause.message;
	}
	return json({ ok: true, canMintToken: github === 'ok', github, ...(detail ? { detail } : {}) });
};

/**
 * A page's current body, blob SHA and title, for the editor (#16). When the page already has a public edit waiting
 * for review, this is the version on that edit's branch, marked `pending`, so the next edit builds on it and joins the
 * same pull request (#15), like Wikipedia's pending changes.
 */
const source: Handler = async (request, env, ctx) => {
	const path = new URL(request.url).searchParams.get('path');
	const valid = validatePath(path);
	if (!valid.ok) return validationErrors(valid.errors);

	const cache = typeof caches === 'undefined' ? undefined : caches.default;
	const cacheKey = sourceCacheKey(valid.value);
	const cached = await cache?.match(cacheKey);
	if (cached) return cached;

	const branch = branchFor(valid.value);
	const pull = (await branchSha(env, branch)) ? await openPullFrom(env, branch) : undefined;
	const file = await getFile(env, valid.value, pull ? branch : env.GITHUB_BASE_BRANCH);
	if (!file) return error(404, 'not_found', 'path');
	const { title } = readFrontmatter(file.text);
	const response = json(
		{
			ok: true,
			path: valid.value,
			sha: file.sha,
			title: typeof title === 'string' ? title : '',
			body: splitFile(file.text).body,
			pending: pull ? { prUrl: pull.html_url } : null,
		},
		200,
		{ 'Cache-Control': `public, max-age=${SOURCE_CACHE_SECONDS}` },
	);
	if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
	return response;
};

/**
 * Every account that hasn't been deleted, with its current display name, for building contributor profile pages (#62):
 * `{ ok, users: [{ id, name }] }`. Banned accounts are included, because a ban stops new edits but doesn't hide past
 * ones. Nothing else about an account is returned: no join date, Google ID or ban status. It doesn't depend on
 * SIGN_IN_ENABLED, so switching sign-in off doesn't remove anyone's profile.
 */
const users: Handler = async (_request, env, ctx) => {
	if (!env.DB) return error(503, 'not_configured');
	const cache = typeof caches === 'undefined' ? undefined : caches.default;
	const cached = await cache?.match(usersCacheKey());
	if (cached) return cached;
	const response = json({ ok: true, users: await listUsers(env.DB) }, 200, {
		'Cache-Control': `public, max-age=${USERS_CACHE_SECONDS}`,
	});
	if (cache) ctx.waitUntil(cache.put(usersCacheKey(), response.clone()));
	return response;
};

const routes: Record<string, Partial<Record<string, Handler>>> = {
	'/api/health': { GET: health },
	'/api/source': { GET: source },
	'/api/edit': { POST: edit },
	'/api/users': { GET: users },
	...authRoutes,
};

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (!pathname.startsWith('/api/')) return error(404, 'not_found');
		if (request.method === 'OPTIONS') return preflight(request, env);

		const route = routes[pathname];
		if (!route) return withCors(error(404, 'not_found'), request, env);
		const handler = route[request.method];
		if (!handler) {
			const response = error(405, 'method_not_allowed');
			response.headers.set('Allow', Object.keys(route).join(', '));
			return withCors(response, request, env);
		}

		let response: Response;
		try {
			response = await handler(request, env, ctx);
		} catch (cause) {
			console.error(cause);
			response =
				cause instanceof NotConfiguredError
					? error(503, 'not_configured')
					: cause instanceof GitHubError
						? error(502, 'github_error')
						: cause instanceof GoogleError
							? error(502, 'google_error')
							: error(500, 'internal_error');
		}
		return withCors(response, request, env);
	},
} satisfies ExportedHandler<Env>;
