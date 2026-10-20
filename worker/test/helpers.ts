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
