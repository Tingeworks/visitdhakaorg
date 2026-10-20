import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NotConfiguredError, appJwt, clearTokenCache, importPrivateKey, installationToken } from '../src/github.ts';
import { keyPair, pem, testEnv } from './helpers.ts';

const fromBase64url = (part: string) => Buffer.from(part, 'base64url');

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
	clearTokenCache();
});

describe('appJwt', () => {
	test('signs an RS256 JWT for the app that GitHub can verify', async () => {
		const jwt = await appJwt('12345', await importPrivateKey(pem), 1_800_000_000);
		const [header, payload, signature] = jwt.split('.');
		assert.deepEqual(JSON.parse(fromBase64url(header).toString()), { alg: 'RS256', typ: 'JWT' });
		assert.deepEqual(JSON.parse(fromBase64url(payload).toString()), {
			iat: 1_800_000_000 - 60,
			exp: 1_800_000_000 + 540,
			iss: '12345',
		});
		const valid = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			keyPair.publicKey,
			fromBase64url(signature),
			new TextEncoder().encode(`${header}.${payload}`),
		);
		assert.ok(valid);
	});

	test('explains how to convert a PKCS#1 key', async () => {
		await assert.rejects(importPrivateKey('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'), {
			name: 'Error',
			message: /openssl pkcs8/,
		});
	});
});

describe('installationToken', () => {
	const withApp = testEnv({ GITHUB_APP_ID: '12345', GITHUB_INSTALLATION_ID: '678', GITHUB_APP_PRIVATE_KEY: pem });

	test('exchanges the JWT for an installation token and caches it', async () => {
		const calls: Request[] = [];
		globalThis.fetch = async (input, init) => {
			calls.push(new Request(input, init));
			return Response.json({ token: 'ghs_test', expires_at: new Date(Date.now() + 3600_000).toISOString() });
		};
		assert.equal(await installationToken(withApp), 'ghs_test');
		assert.equal(await installationToken(withApp), 'ghs_test');
		assert.equal(calls.length, 1);
		assert.equal(calls[0].method, 'POST');
		assert.equal(calls[0].url, 'https://api.github.com/app/installations/678/access_tokens');
		assert.match(calls[0].headers.get('Authorization')!, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
		assert.equal(calls[0].headers.get('User-Agent'), 'visitdhaka-edit-worker');
	});

	test('gets a new token when the cached one is about to expire', async () => {
		let count = 0;
		globalThis.fetch = async () => {
			count++;
			return Response.json({ token: `ghs_${count}`, expires_at: new Date(Date.now() + 60_000).toISOString() });
		};
		assert.equal(await installationToken(withApp), 'ghs_1');
		assert.equal(await installationToken(withApp), 'ghs_2');
	});

	test('reads without a token in development when there are no app credentials', async () => {
		assert.equal(await installationToken(testEnv({ ENVIRONMENT: 'development' })), undefined);
	});

	test('refuses to run without app credentials in production', async () => {
		await assert.rejects(installationToken(testEnv()), NotConfiguredError);
	});
});
