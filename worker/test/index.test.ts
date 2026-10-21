import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { identify } from '../src/identity.ts';
import { clearTokenCache } from '../src/github.ts';
import { pem, testEnv } from './helpers.ts';
import type { Env } from '../src/env.ts';

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
const dev = testEnv({ ENVIRONMENT: 'development', ALLOWED_ORIGIN: 'http://localhost:4321' });

const page = [
	'---',
	'title: লালবাগ কেল্লা',
	'tags: [mughal, fort]',
	'verified: false',
	'---',
	'',
	'লালবাগ কেল্লা পুরান ঢাকার একটি মুঘল দুর্গ।',
	'',
].join('\n');

const call = (path: string, init: RequestInit = {}, env: Env = dev) =>
	worker.fetch(new Request(`http://localhost:8787${path}`, init), env, ctx);

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
	clearTokenCache();
});

/** Stubs GitHub's contents API with one file, recording the requests the Worker makes. */
function stubGitHub(files: Record<string, string>, status?: number) {
	const calls: Request[] = [];
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		calls.push(request);
		if (status) return new Response('{}', { status });
		const path = decodeURIComponent(new URL(request.url).pathname.replace('/repos/Tingeworks/visitdhakaorg/contents/', ''));
		const text = files[path];
		if (text === undefined) return Response.json({ message: 'Not Found' }, { status: 404 });
		return Response.json({ type: 'file', encoding: 'base64', sha: 'abc123', content: Buffer.from(text).toString('base64') });
	};
	return calls;
}

describe('routing', () => {
	test('answers only under /api/', async () => {
		assert.equal((await call('/')).status, 404);
		assert.equal((await call('/attractions/lalbagh-fort/')).status, 404);
		const unknown = await call('/api/unknown');
		assert.equal(unknown.status, 404);
		assert.deepEqual(await unknown.json(), { ok: false, errors: [{ code: 'not_found' }] });
	});

	test('rejects the wrong method', async () => {
		const response = await call('/api/source?path=x', { method: 'POST' });
		assert.equal(response.status, 405);
		assert.equal(response.headers.get('Allow'), 'GET');
	});

	test('sets no cookie outside sign-in', async () => {
		stubGitHub({ 'src/content/docs/bn/attractions/lalbagh-fort.md': page });
		for (const path of ['/api/health', '/api/source?path=src/content/docs/bn/attractions/lalbagh-fort.md', '/api/nope']) {
			assert.equal((await call(path)).headers.get('Set-Cookie'), null, path);
		}
	});
});

describe('GET /api/source', () => {
	test('returns the body, blob SHA and title of a page, with Bangla intact', async () => {
		const calls = stubGitHub({ 'src/content/docs/bn/attractions/lalbagh-fort.md': page });
		const response = await call('/api/source?path=src/content/docs/bn/attractions/lalbagh-fort.md');
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
		assert.deepEqual(await response.json(), {
			ok: true,
			path: 'src/content/docs/bn/attractions/lalbagh-fort.md',
			sha: 'abc123',
			title: 'লালবাগ কেল্লা',
			body: '\nলালবাগ কেল্লা পুরান ঢাকার একটি মুঘল দুর্গ।\n',
			pending: null,
		});
		// First it checks for a pending edit branch, then reads the page from main.
		assert.match(calls[0].url, /\/git\/ref\/heads\/edit\/bn\/attractions\/lalbagh-fort$/);
		assert.equal(
			calls[1].url,
			'https://api.github.com/repos/Tingeworks/visitdhakaorg/contents/src/content/docs/bn/attractions/lalbagh-fort.md?ref=main',
		);
		assert.equal(calls[1].headers.get('User-Agent'), 'visitdhaka-edit-worker');
		// Development without app credentials reads the public repo without signing in.
		assert.equal(calls[1].headers.get('Authorization'), null);
	});

	test('reads as the app when it has credentials', async () => {
		const contents = stubGitHub({ 'src/content/docs/areas/gulshan.md': page });
		const stubbed = globalThis.fetch;
		globalThis.fetch = async (input, init) => {
			const request = new Request(input, init);
			if (request.url.endsWith('/access_tokens')) {
				return Response.json({ token: 'ghs_app', expires_at: new Date(Date.now() + 3600_000).toISOString() });
			}
			return stubbed(request);
		};
		const env = testEnv({ GITHUB_APP_ID: '12345', GITHUB_INSTALLATION_ID: '678', GITHUB_APP_PRIVATE_KEY: pem });
		const response = await call('/api/source?path=src/content/docs/areas/gulshan.md', {}, env);
		assert.equal(response.status, 200);
		assert.equal(contents.at(-1)!.headers.get('Authorization'), 'Bearer ghs_app');
		assert.deepEqual(await (await call('/api/health', {}, env)).json(), { ok: true, canMintToken: true, github: 'ok' });
	});

	test('rejects invalid paths with 400 and the rule that failed', async () => {
		const calls = stubGitHub({});
		for (const [path, code] of [
			['src/content/docs/privacy.md', 'path_not_editable'],
			['src/content/docs/index.mdx', 'path_not_markdown'],
			['src/content/docs/areas/../../../package.json', 'path_invalid'],
			['', 'path_invalid'],
		]) {
			const response = await call(`/api/source?path=${encodeURIComponent(path)}`);
			assert.equal(response.status, 400, path);
			assert.deepEqual(await response.json(), { ok: false, errors: [{ field: 'path', code }] }, path);
		}
		assert.equal((await call('/api/source')).status, 400);
		assert.equal(calls.length, 0, 'invalid paths never reach GitHub');
	});

	test('returns 404 for a page that does not exist', async () => {
		stubGitHub({});
		const response = await call('/api/source?path=src/content/docs/areas/atlantis.md');
		assert.equal(response.status, 404);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'not_found', field: 'path' }] });
	});

	test('reports GitHub failures as 502', async () => {
		stubGitHub({}, 500);
		const response = await call('/api/source?path=src/content/docs/areas/gulshan.md');
		assert.equal(response.status, 502);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'github_error' }] });
	});

	test('reports missing configuration in production as 503', async () => {
		const response = await call('/api/source?path=src/content/docs/areas/gulshan.md', {}, testEnv());
		assert.equal(response.status, 503);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'not_configured' }] });
	});
});

describe('GET /api/health', () => {
	test('says whether a GitHub token can be minted', async () => {
		assert.deepEqual(await (await call('/api/health')).json(), { ok: true, canMintToken: false, github: 'unauthenticated' });
		const production = await (await call('/api/health', {}, testEnv())).json();
		assert.equal(production.canMintToken, false);
		assert.equal(production.github, 'not_configured');
	});

	test('never returns a secret', async () => {
		const secret = '-----BEGIN RSA PRIVATE KEY-----\nTOPSECRET\n-----END RSA PRIVATE KEY-----';
		const env = testEnv({
			GITHUB_APP_ID: '1',
			GITHUB_INSTALLATION_ID: '2',
			GITHUB_APP_PRIVATE_KEY: secret,
			GOOGLE_CLIENT_SECRET: 'GOOGLESECRET',
			SESSION_SECRET: 'SESSIONSECRET-of-at-least-32-bytes-long',
		});
		const text = await (await call('/api/health', {}, env)).text();
		for (const value of ['TOPSECRET', 'GOOGLESECRET', 'SESSIONSECRET']) assert.ok(!text.includes(value), value);
		assert.match(text, /"github":"not_configured"/);
	});
});

describe('CORS', () => {
	test('allows the configured origin and no other', async () => {
		stubGitHub({});
		const allowed = await call('/api/health', { headers: { Origin: 'http://localhost:4321' } });
		assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:4321');
		assert.equal(allowed.headers.get('Vary'), 'Origin');
		const other = await call('/api/health', { headers: { Origin: 'https://evil.example' } });
		assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
	});

	test('answers preflight requests', async () => {
		const ok = await call('/api/source', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4321' } });
		assert.equal(ok.status, 204);
		assert.equal(ok.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
		const blocked = await call('/api/source', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
		assert.equal(blocked.status, 403);
	});

	test('accepts a comma-separated list of origins', async () => {
		const env = testEnv({ ENVIRONMENT: 'development', ALLOWED_ORIGIN: 'https://visitdhaka.org, http://localhost:4321' });
		const response = await call('/api/health', { headers: { Origin: 'https://visitdhaka.org' } }, env);
		assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://visitdhaka.org');
	});
});

describe('identify', () => {
	test('is anonymous without a session, with the cleaned display name', async () => {
		const request = new Request('http://localhost/api/edit', { method: 'POST' });
		assert.deepEqual(await identify(request, dev, { name: '  <b>Rahim</b> ' }), { ok: true, value: { kind: 'anonymous', name: 'Rahim' } });
		assert.deepEqual(await identify(request, dev, {}), { ok: true, value: { kind: 'anonymous', name: 'Anonymous' } });
		assert.equal((await identify(request, dev, { name: 'x'.repeat(41) })).ok, false);
	});
});
