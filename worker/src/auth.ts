// Optional Google sign-in (decision 0006, #57), under /api/auth/. Signing in is a redirect to Google and back, with the
// flow's state in a short-lived signed cookie, and ends in a signed session cookie (session.ts). A new Google account
// stores nothing until it has chosen a display name. Every route answers `sign_in_disabled` while SIGN_IN_ENABLED isn't
// `true`, and `not_configured` while something it needs is missing (#55).
import { randomToken } from './base64.ts';
import { isDevelopment, type Env } from './env.ts';
import { GoogleError, authorizeUrl, exchangeCode, subjectOf } from './google.ts';
import { allowedOrigins, error, isAllowedOrigin, json, validationErrors } from './http.ts';
import { sessionUser, signInConfigured, signInEnabled } from './identity.ts';
import { usersCacheKey } from './pages.ts';
import {
	FLOW_SECONDS,
	SESSION_COOKIE,
	SESSION_SECONDS,
	SIGN_IN_COOKIE,
	SIGN_UP_COOKIE,
	clearCookie,
	cookie,
	readCookie,
	seal,
	unseal,
} from './session.ts';
import { createUser, findUserBySub, renameUser, type User } from './users.ts';
import { cleanAccountName } from './validate.ts';

type Handler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/** A route that answers only while sign-in is on and set up. */
const guarded =
	(handler: Handler): Handler =>
	async (request, env, ctx) => {
		if (!signInEnabled(env)) return error(403, 'sign_in_disabled');
		if (!signInConfigured(env)) return error(503, 'not_configured');
		return handler(request, env, ctx);
	};

/** A same-site path to go back to after signing in. Anything else, such as a full URL or `//host`, becomes `/`. */
export function returnPath(raw: unknown) {
	if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 2000 || /[\\\u0000-\u001f\u007f]/.test(raw)) return '/';
	const url = new URL(raw, 'https://site.invalid');
	return url.origin === 'https://site.invalid' ? url.pathname + url.search + url.hash : '/';
}

/** A page on the site: visitdhaka.org in production, or the Astro dev server locally (the first ALLOWED_ORIGIN). */
const siteUrl = (env: Env, path: string) => new URL(path, allowedOrigins(env)[0]).toString();

/** Where Google sends the browser back to: this Worker's own callback, or in development the WORKER_URL override. */
const callbackUrl = (request: Request, env: Env) =>
	new URL('/api/auth/callback', isDevelopment(env) && env.WORKER_URL ? env.WORKER_URL : request.url).toString();

function withCookies(response: Response, cookies: string[]) {
	for (const value of cookies) response.headers.append('Set-Cookie', value);
	return response;
}

const redirect = (location: string, cookies: string[]) =>
	withCookies(new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } }), cookies);

const sessionCookie = async (env: Env, user: User) =>
	cookie(SESSION_COOKIE, await seal(env, SESSION_COOKIE, { uid: user.id }, SESSION_SECONDS), SESSION_SECONDS);

const publicUser = (user: User) => ({ id: user.id, name: user.name });

/** Drops this data centre's cached /api/users, so the next site build sees a rename or deletion (#62). */
const forgetUsers = (ctx: ExecutionContext) => {
	if (typeof caches !== 'undefined') ctx.waitUntil(caches.default.delete(usersCacheKey()));
};

/** Compares two strings in time that depends only on their length. */
function sameText(a: string, b: string) {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return difference === 0;
}

/** A small JSON object from the request body, or undefined. */
async function readSmallJson(request: Request) {
	const text = await request.text();
	if (text.length > 10_000) return undefined;
	try {
		const data = JSON.parse(text);
		return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

/** GET /api/auth/login?return=<path>: starts signing in, and sends the browser to Google. */
const login: Handler = async (request, env) => {
	const state = randomToken();
	const nonce = randomToken();
	const verifier = randomToken();
	const back = returnPath(new URL(request.url).searchParams.get('return'));
	const flow = await seal(env, SIGN_IN_COOKIE, { state, nonce, verifier, return: back }, FLOW_SECONDS);
	const location = await authorizeUrl(env, { redirectUri: callbackUrl(request, env), state, nonce, verifier });
	return redirect(location, [cookie(SIGN_IN_COOKIE, flow, FLOW_SECONDS)]);
};

/** GET /api/auth/callback: Google sends the browser back here with a code, which becomes a session. */
const callback: Handler = async (request, env) => {
	const params = new URL(request.url).searchParams;
	const flow = await unseal(env, SIGN_IN_COOKIE, readCookie(request, SIGN_IN_COOKIE));
	if (!flow) return error(400, 'sign_in_expired');
	const done = clearCookie(SIGN_IN_COOKIE);
	const fail = (status: number, code: string) => withCookies(error(status, code), [done]);
	const back = siteUrl(env, returnPath(flow.return));

	if (!sameText(params.get('state') ?? '', String(flow.state))) return fail(400, 'state_invalid');
	// Cancelled at Google: back to where they were, still signed out.
	if (params.get('error')) return redirect(back, [done]);
	const code = params.get('code');
	if (!code) return fail(400, 'code_invalid');

	let idToken: string;
	try {
		idToken = await exchangeCode(env, { code, verifier: String(flow.verifier), redirectUri: callbackUrl(request, env) });
	} catch (cause) {
		if (cause instanceof GoogleError && cause.status === 400) return fail(400, 'code_invalid');
		throw cause;
	}
	const sub = subjectOf(env, idToken, String(flow.nonce));
	if (!sub) return fail(400, 'token_invalid');

	const user = await findUserBySub(env.DB!, sub);
	if (user) return redirect(back, [done, clearCookie(SIGN_UP_COOKIE), await sessionCookie(env, user)]);
	// A new account. Nothing is stored until it chooses a display name (POST /api/auth/name, #59).
	const signUp = await seal(env, SIGN_UP_COOKIE, { sub }, FLOW_SECONDS);
	return redirect(back, [done, clearCookie(SESSION_COOKIE), cookie(SIGN_UP_COOKIE, signUp, FLOW_SECONDS)]);
};

/** POST /api/auth/logout. */
const logout: Handler = async (request, env) => {
	if (!isAllowedOrigin(request, env)) return error(403, 'origin_not_allowed');
	return withCookies(json({ ok: true }), [clearCookie(SESSION_COOKIE), clearCookie(SIGN_UP_COOKIE)]);
};

/**
 * GET /api/auth/me: `{ ok, user: { id, name } | null }`, plus `pendingName: true` when a new account has signed in with
 * Google but hasn't chosen its display name yet. Never cached.
 */
const me: Handler = async (request, env) => {
	const user = await sessionUser(request, env);
	if (user) return json({ ok: true, user: publicUser(user) });
	const signUp = await unseal(env, SIGN_UP_COOKIE, readCookie(request, SIGN_UP_COOKIE));
	return json({ ok: true, user: null, ...(signUp ? { pendingName: true } : {}) });
};

/**
 * POST /api/auth/name `{ name }`: a new account's display name, which creates the account and signs it in, or a new
 * name for the signed-in account. The name is public, and permanent in git once an edit is merged.
 */
const name: Handler = async (request, env, ctx) => {
	if (!isAllowedOrigin(request, env)) return error(403, 'origin_not_allowed');
	const input = await readSmallJson(request);
	if (!input) return error(400, 'invalid_json');
	const cleaned = cleanAccountName(input.name);
	if (!cleaned.ok) return validationErrors(cleaned.errors, 422);

	const user = await sessionUser(request, env);
	if (user) {
		if (user.bannedAt) return error(403, 'banned');
		await renameUser(env.DB!, user.id, cleaned.value);
		forgetUsers(ctx);
		return json({ ok: true, user: { id: user.id, name: cleaned.value } });
	}
	const signUp = await unseal(env, SIGN_UP_COOKIE, readCookie(request, SIGN_UP_COOKIE));
	if (typeof signUp?.sub !== 'string') return error(401, 'signed_out');
	const created = await createUser(env.DB!, { sub: signUp.sub, name: cleaned.value });
	return withCookies(json({ ok: true, user: publicUser(created) }, 201), [
		clearCookie(SIGN_UP_COOKIE),
		await sessionCookie(env, created),
	]);
};

export const authRoutes: Record<string, Partial<Record<string, Handler>>> = {
	'/api/auth/login': { GET: guarded(login) },
	'/api/auth/callback': { GET: guarded(callback) },
	'/api/auth/logout': { POST: guarded(logout) },
	'/api/auth/me': { GET: guarded(me) },
	'/api/auth/name': { POST: guarded(name) },
};
