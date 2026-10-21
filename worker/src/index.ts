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
import { branchFor, sourceCacheKey } from './pages.ts';
import { branchSha, openPullFrom } from './repo.ts';
import { validatePath } from './validate.ts';

type Handler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/** How long GET /api/source responses are cached at the edge, so page views don't spend GitHub API calls. */
const SOURCE_CACHE_SECONDS = 60;

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

const routes: Record<string, Partial<Record<string, Handler>>> = {
	'/api/health': { GET: health },
	'/api/source': { GET: source },
	'/api/edit': { POST: edit },
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
