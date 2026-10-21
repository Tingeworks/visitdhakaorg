import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { returnPath } from '../src/auth.ts';
import { pkceChallenge } from '../src/google.ts';
import { SESSION_COOKIE, seal } from '../src/session.ts';
import { banUser, createUser, deleteUser, findUser } from '../src/users.ts';
import { FakeD1 } from './fake-d1.ts';
import { idToken, signInEnv, testEnv } from './helpers.ts';
import type { Env } from '../src/env.ts';

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const SUB = '110248495921238986420';

let d1: FakeD1;
let env: Env;
/** Requests to Google's token endpoint, and what the fake answers. */
let tokenRequests: URLSearchParams[];
let claims: (nonce: string) => Record<string, unknown>;
let tokenStatus: number;
/** The nonce of the latest sign-in, which the fake token endpoint puts in the ID token. */
let lastNonce = '';

const realFetch = globalThis.fetch;
beforeEach(() => {
	d1 = new FakeD1();
	env = signInEnv(d1.binding);
	tokenRequests = [];
	tokenStatus = 200;
	const now = Math.floor(Date.now() / 1000);
	claims = (nonce) => ({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: SUB, iat: now, exp: now + 3600, nonce });
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		assert.equal(request.url, 'https://oauth2.googleapis.com/token', 'the only outside call is to the token endpoint');
		const form = new URLSearchParams(await request.text());
		tokenRequests.push(form);
		if (tokenStatus !== 200) return Response.json({ error: 'invalid_grant' }, { status: tokenStatus });
		return Response.json({ id_token: idToken(claims(lastNonce)), access_token: 'ya29.x', token_type: 'Bearer' });
	};
});
afterEach(() => {
	globalThis.fetch = realFetch;
});

const call = (path: string, init: RequestInit = {}, configuration = env) =>
	worker.fetch(new Request(`https://visitdhaka.org${path}`, init), configuration, ctx);

/** The cookies a response sets, as name to `{ value, attributes }`. */
function setCookies(response: Response) {
	const cookies: Record<string, { value: string; attributes: string }> = {};
	for (const header of response.headers.getSetCookie()) {
		const [pair, ...attributes] = header.split('; ');
		const [name, ...value] = pair.split('=');
		cookies[name] = { value: value.join('='), attributes: attributes.join('; ') };
	}
	return cookies;
}

const cookieHeader = (cookies: Record<string, string>) =>
	Object.entries(cookies)
		.map(([name, value]) => `${name}=${value}`)
		.join('; ');

/** Starts signing in, returning the sign-in cookie and Google's state and nonce. */
async function startLogin(back = '/edit/?path=src/content/docs/areas/gulshan.md') {
	const response = await call(`/api/auth/login?return=${encodeURIComponent(back)}`);
	const location = new URL(response.headers.get('Location')!);
	lastNonce = location.searchParams.get('nonce')!;
	return { response, location, flow: setCookies(response)['__Host-signin'].value };
}

/** A whole sign-in through Google's callback, returning the callback's response. */
async function signInWithGoogle(back?: string) {
	const { location, flow } = await startLogin(back);
	return call(`/api/auth/callback?code=4%2Fcode&state=${location.searchParams.get('state')}`, {
		headers: { Cookie: `__Host-signin=${flow}` },
	});
}

const session = async (id: number, configuration = env) => seal(configuration, SESSION_COOKIE, { uid: id }, 3600);

describe('GET /api/auth/login', () => {
	test('sends the browser to Google with PKCE, and keeps the flow in a short-lived signed cookie', async () => {
		const { response, location } = await startLogin();
		assert.equal(response.status, 302);
		assert.equal(location.origin + location.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
		const params = Object.fromEntries(location.searchParams);
		assert.equal(params.client_id, CLIENT_ID);
		assert.equal(params.redirect_uri, 'https://visitdhaka.org/api/auth/callback');
		assert.equal(params.response_type, 'code');
		assert.equal(params.scope, 'openid profile');
		assert.equal(params.code_challenge_method, 'S256');
		assert.match(params.state, /^[\w-]{43}$/);
		assert.match(params.nonce, /^[\w-]{43}$/);
		assert.notEqual(params.state, params.nonce);
		const flow = setCookies(response)['__Host-signin'];
		assert.equal(flow.attributes, 'Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax');
		assert.ok(!flow.value.includes(params.state), 'the cookie is encoded and signed, not plain');
	});

	test('accepts only a same-site path to return to', () => {
		assert.equal(returnPath('/edit/?path=src/content/docs/areas/gulshan.md#x'), '/edit/?path=src/content/docs/areas/gulshan.md#x');
		assert.equal(returnPath('/bn/edit/?path=a'), '/bn/edit/?path=a');
		for (const raw of ['https://evil.example/', '//evil.example/', '/\\evil.example', 'edit/', '', null, '/\u0000x']) {
			assert.equal(returnPath(raw), '/', String(raw));
		}
	});
});

describe('GET /api/auth/callback', () => {
	test('a new Google account chooses a name before an account is made', async () => {
		const response = await signInWithGoogle();
		assert.equal(response.status, 302);
		assert.equal(response.headers.get('Location'), 'https://visitdhaka.org/edit/?path=src/content/docs/areas/gulshan.md');
		const cookies = setCookies(response);
		assert.equal(cookies['__Host-signin'].attributes.split('; ')[0], 'Max-Age=0');
		assert.equal(cookies['__Host-session'].value, '');
		assert.ok(cookies['__Host-signup'].value);
		assert.equal(d1.sqlite.prepare('SELECT count(*) AS n FROM users').get()!.n, 0, 'nothing is stored yet');

		// The code was exchanged with the PKCE verifier that matches the challenge sent to Google.
		const [form] = tokenRequests;
		assert.equal(form.get('grant_type'), 'authorization_code');
		assert.equal(form.get('code'), '4/code');
		assert.equal(form.get('client_secret'), 'google-secret');
		assert.equal(form.get('redirect_uri'), 'https://visitdhaka.org/api/auth/callback');
		assert.ok(form.get('code_verifier'));

		const signUp = { '__Host-signup': cookies['__Host-signup'].value };
		assert.deepEqual(await (await call('/api/auth/me', { headers: { Cookie: cookieHeader(signUp) } })).json(), {
			ok: true,
			user: null,
			pendingName: true,
		});

		const named = await call('/api/auth/name', {
			method: 'POST',
			headers: { Cookie: cookieHeader(signUp), Origin: 'https://visitdhaka.org', 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: '  Rahim ' }),
		});
		assert.equal(named.status, 201);
		assert.deepEqual(await named.json(), { ok: true, user: { id: 1, name: 'Rahim' } });
		const after = setCookies(named);
		assert.equal(after['__Host-signup'].value, '');
		assert.equal(after['__Host-session'].attributes, 'Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax');

		const me = await call('/api/auth/me', { headers: { Cookie: `__Host-session=${after['__Host-session'].value}` } });
		assert.equal(me.headers.get('Cache-Control'), 'no-store');
		assert.deepEqual(await me.json(), { ok: true, user: { id: 1, name: 'Rahim' } });
	});

	test('the PKCE verifier matches the challenge', async () => {
		const { location, flow } = await startLogin();
		await call(`/api/auth/callback?code=c&state=${location.searchParams.get('state')}`, { headers: { Cookie: `__Host-signin=${flow}` } });
		assert.equal(await pkceChallenge(tokenRequests[0].get('code_verifier')!), location.searchParams.get('code_challenge'));
	});

	test('an existing account is signed straight in', async () => {
		await createUser(d1.binding, { sub: SUB, name: 'Rahim' });
		const response = await signInWithGoogle('/bn/edit/?path=src/content/docs/bn/areas/gulshan.md');
		assert.equal(response.headers.get('Location'), 'https://visitdhaka.org/bn/edit/?path=src/content/docs/bn/areas/gulshan.md');
		const cookies = setCookies(response);
		assert.equal(cookies['__Host-signup'].value, '');
		const me = await call('/api/auth/me', { headers: { Cookie: `__Host-session=${cookies['__Host-session'].value}` } });
		assert.deepEqual(await me.json(), { ok: true, user: { id: 1, name: 'Rahim' } });
	});

	test('returns to the site, not the Worker, when the Worker is on another port in development', async () => {
		const local = signInEnv(d1.binding, { ALLOWED_ORIGIN: 'http://localhost:4321' });
		const login = await worker.fetch(new Request('http://localhost:8787/api/auth/login?return=/edit/'), local, ctx);
		const location = new URL(login.headers.get('Location')!);
		assert.equal(location.searchParams.get('redirect_uri'), 'http://localhost:8787/api/auth/callback');
		lastNonce = location.searchParams.get('nonce')!;
		const callback = await worker.fetch(
			new Request(`http://localhost:8787/api/auth/callback?code=c&state=${location.searchParams.get('state')}`, {
				headers: { Cookie: `__Host-signin=${setCookies(login)['__Host-signin'].value}` },
			}),
			local,
			ctx,
		);
		assert.equal(callback.headers.get('Location'), 'http://localhost:4321/edit/');
	});

	test('uses WORKER_URL for the callback in development, where wrangler dev rewrites the request URL', async () => {
		const local = signInEnv(d1.binding, { ENVIRONMENT: 'development', WORKER_URL: 'http://localhost:8787' });
		const login = await worker.fetch(new Request('http://visitdhaka.org/api/auth/login'), local, ctx);
		const redirectUri = new URL(login.headers.get('Location')!).searchParams.get('redirect_uri');
		assert.equal(redirectUri, 'http://localhost:8787/api/auth/callback');
		// Ignored outside development.
		const production = await worker.fetch(new Request('https://visitdhaka.org/api/auth/login'), signInEnv(d1.binding, { WORKER_URL: 'http://evil.example' }), ctx);
		assert.equal(new URL(production.headers.get('Location')!).searchParams.get('redirect_uri'), 'https://visitdhaka.org/api/auth/callback');
	});

	test('goes back signed out when the person cancels at Google', async () => {
		const { location, flow } = await startLogin('/edit/');
		const response = await call(`/api/auth/callback?error=access_denied&state=${location.searchParams.get('state')}`, {
			headers: { Cookie: `__Host-signin=${flow}` },
		});
		assert.equal(response.status, 302);
		assert.equal(response.headers.get('Location'), 'https://visitdhaka.org/edit/');
		assert.equal(setCookies(response)['__Host-session'], undefined);
		assert.equal(tokenRequests.length, 0);
	});

	test('refuses a missing, tampered or mismatched sign-in', async () => {
		const { location, flow } = await startLogin();
		const state = location.searchParams.get('state');
		const attempt = async (query: string, cookie?: string) => {
			const response = await call(`/api/auth/callback?${query}`, cookie ? { headers: { Cookie: `__Host-signin=${cookie}` } } : {});
			return [response.status, (await response.json()).errors[0].code];
		};
		assert.deepEqual(await attempt(`code=c&state=${state}`), [400, 'sign_in_expired']);
		assert.deepEqual(await attempt(`code=c&state=${state}`, flow.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), [400, 'sign_in_expired']);
		assert.deepEqual(await attempt('code=c&state=someone-elses-state', flow), [400, 'state_invalid']);
		assert.deepEqual(await attempt(`state=${state}`, flow), [400, 'code_invalid']);
		assert.equal(tokenRequests.length, 0, 'Google is never asked about a bad state');
	});

	test('refuses an expired sign-in cookie', async () => {
		const flow = await seal(env, '__Host-signin', { state: 's', nonce: 'n', verifier: 'v', return: '/' }, -1);
		const response = await call('/api/auth/callback?code=c&state=s', { headers: { Cookie: `__Host-signin=${flow}` } });
		assert.deepEqual((await response.json()).errors, [{ code: 'sign_in_expired' }]);
	});

	for (const [label, change] of [
		['wrong nonce', { nonce: 'another-nonce' }],
		['wrong audience', { aud: 'someone-elses-client' }],
		['wrong issuer', { iss: 'https://evil.example' }],
		['expired token', { exp: Math.floor(Date.now() / 1000) - 10 }],
		['no subject', { sub: undefined }],
	] as const) {
		test(`refuses an ID token with a ${label}`, async () => {
			const base = claims;
			claims = (nonce) => ({ ...base(nonce), ...change });
			const response = await signInWithGoogle();
			assert.equal(response.status, 400);
			assert.deepEqual((await response.json()).errors, [{ code: 'token_invalid' }]);
			assert.equal(setCookies(response)['__Host-session'], undefined);
			assert.equal(setCookies(response)['__Host-signup'], undefined);
		});
	}

	test('reports a code Google refuses', async () => {
		tokenStatus = 400;
		assert.deepEqual((await (await signInWithGoogle()).json()).errors, [{ code: 'code_invalid' }]);
		tokenStatus = 500;
		const response = await signInWithGoogle();
		assert.equal(response.status, 502);
		assert.deepEqual((await response.json()).errors, [{ code: 'google_error' }]);
	});
});

describe('sessions', () => {
	test('a tampered, expired or misplaced session is signed out', async () => {
		const { id } = await createUser(d1.binding, { sub: SUB, name: 'Rahim' });
		const valid = await session(id);
		const me = async (cookie: string) =>
			(await (await call('/api/auth/me', { headers: { Cookie: cookie } })).json()).user;
		assert.deepEqual(await me(`__Host-session=${valid}`), { id, name: 'Rahim' });

		const [payload, signature] = valid.split('.');
		const otherUser = Buffer.from(JSON.stringify({ uid: 2, exp: 9999999999 })).toString('base64url');
		assert.equal(await me(`__Host-session=${otherUser}.${signature}`), null);
		assert.equal(await me(`__Host-session=${payload}.${signature.slice(0, -2)}`), null);
		assert.equal(await me(`__Host-session=${await seal(env, SESSION_COOKIE, { uid: id }, -1)}`), null);
		// A sign-up cookie's value can't be used as a session.
		assert.equal(await me(`__Host-session=${await seal(env, '__Host-signup', { uid: id }, 3600)}`), null);
		// Signed with another secret.
		const other = signInEnv(d1.binding, { SESSION_SECRET: 'another-session-secret-of-32-bytes-or-more' });
		assert.equal(await me(`__Host-session=${await session(id, other)}`), null);
	});

	test('a deleted account is signed out on its next request', async () => {
		const { id } = await createUser(d1.binding, { sub: SUB, name: 'Rahim' });
		const cookie = `__Host-session=${await session(id)}`;
		await deleteUser(d1.binding, id);
		assert.equal((await (await call('/api/auth/me', { headers: { Cookie: cookie } })).json()).user, null);
	});

	test('POST /api/auth/name renames the signed-in account, but not a banned one', async () => {
		const { id } = await createUser(d1.binding, { sub: SUB, name: 'Rahim' });
		const rename = (name: unknown) =>
			call('/api/auth/name', {
				method: 'POST',
				headers: { Cookie: `__Host-session=${cookieValue}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ name }),
			});
		const cookieValue = await session(id);
		const renamed = await rename('রহিম');
		assert.deepEqual(await renamed.json(), { ok: true, user: { id, name: 'রহিম' } });
		assert.equal((await findUser(d1.binding, id))!.name, 'রহিম');

		const invalid = await rename('rahim@example.com');
		assert.equal(invalid.status, 422);
		assert.deepEqual((await invalid.json()).errors, [{ field: 'name', code: 'name_has_email' }]);

		await banUser(d1.binding, id, 'spam');
		assert.deepEqual([(await rename('Karim')).status, (await findUser(d1.binding, id))!.name], [403, 'রহিম']);
	});

	test('POST /api/auth/name needs a sign-in', async () => {
		const response = await call('/api/auth/name', { method: 'POST', body: JSON.stringify({ name: 'Rahim' }) });
		assert.equal(response.status, 401);
		assert.deepEqual((await response.json()).errors, [{ code: 'signed_out' }]);
	});

	test('POST /api/auth/logout clears the session, only from an allowed origin', async () => {
		const response = await call('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://visitdhaka.org' } });
		assert.deepEqual(await response.json(), { ok: true });
		const cookies = setCookies(response);
		assert.equal(cookies['__Host-session'].attributes.split('; ')[0], 'Max-Age=0');
		assert.equal(cookies['__Host-signup'].value, '');
		const blocked = await call('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example' } });
		assert.equal(blocked.status, 403);
		assert.equal(blocked.headers.get('Set-Cookie'), null);
	});
});

describe('switching sign-in off', () => {
	const routes: [string, string][] = [
		['GET', '/api/auth/login'],
		['GET', '/api/auth/callback'],
		['POST', '/api/auth/logout'],
		['GET', '/api/auth/me'],
		['POST', '/api/auth/name'],
	];

	test('every route says sign-in is off unless SIGN_IN_ENABLED is true', async () => {
		for (const value of [undefined, 'false', 'TRUE', '1']) {
			for (const [method, path] of routes) {
				const response = await call(path, { method }, signInEnv(d1.binding, { SIGN_IN_ENABLED: value }));
				assert.equal(response.status, 403, `${method} ${path} with ${value}`);
				assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'sign_in_disabled' }] });
			}
		}
	});

	test('every route says not_configured while something is missing', async () => {
		for (const missing of [
			{ GOOGLE_CLIENT_ID: undefined },
			{ GOOGLE_CLIENT_SECRET: undefined },
			{ SESSION_SECRET: undefined },
			{ SESSION_SECRET: 'too-short' },
			{ DB: undefined },
		]) {
			for (const [method, path] of routes) {
				const response = await call(path, { method }, signInEnv(d1.binding, missing));
				assert.equal(response.status, 503, `${method} ${path} without ${Object.keys(missing)[0]}`);
				assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'not_configured' }] });
			}
		}
	});

	test('an existing session is ignored, so edits are anonymous', async () => {
		const { id } = await createUser(d1.binding, { sub: SUB, name: 'Rahim' });
		const cookie = `__Host-session=${await session(id)}`;
		const { identify } = await import('../src/identity.ts');
		const request = new Request('https://visitdhaka.org/api/edit', { method: 'POST', headers: { Cookie: cookie } });
		assert.equal((await identify(request, env, {})).ok && (await identify(request, env, {})).value.kind, 'user');
		const off = signInEnv(d1.binding, { SIGN_IN_ENABLED: 'false' });
		assert.deepEqual(await identify(request, off, { name: 'Karim' }), { ok: true, value: { kind: 'anonymous', name: 'Karim' } });
		assert.deepEqual(await identify(request, testEnv(), {}), { ok: true, value: { kind: 'anonymous', name: 'Anonymous' } });
	});
});
