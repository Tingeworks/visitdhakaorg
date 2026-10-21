// Shared test fixtures: a throwaway RSA key in the PKCS#8 PEM format the Worker expects, and a base configuration.
import type { Env } from '../src/env.ts';

export const keyPair = await crypto.subtle.generateKey(
	{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
	true,
	['sign', 'verify'],
);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)).toString('base64');
export const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;

export const testEnv = (overrides: Partial<Env> = {}): Env => ({
	GITHUB_OWNER: 'Tingeworks',
	GITHUB_REPO: 'visitdhakaorg',
	GITHUB_BASE_BRANCH: 'main',
	DAILY_EDIT_CAP: '50',
	ALLOWED_ORIGIN: 'https://visitdhaka.org',
	...overrides,
});

/** A configuration with Google sign-in switched on and set up, using `db` for accounts. */
export const signInEnv = (db: D1Database, overrides: Partial<Env> = {}): Env =>
	testEnv({
		SIGN_IN_ENABLED: 'true',
		GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
		GOOGLE_CLIENT_SECRET: 'google-secret',
		SESSION_SECRET: 'a-session-secret-of-at-least-32-bytes!',
		DB: db,
		...overrides,
	});

/** An unsigned JWT with these claims, standing in for the ID token Google's token endpoint returns. */
export const idToken = (claims: Record<string, unknown>) =>
	[{ alg: 'RS256', typ: 'JWT' }, claims].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.sig';
