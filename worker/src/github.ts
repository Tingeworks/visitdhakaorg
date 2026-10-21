// GitHub access as the GitHub App (#10): an RS256 JWT signed with WebCrypto, exchanged for an installation token that
// is cached until shortly before it expires. No Octokit: the Worker needs a handful of REST calls.
import { base64url } from './base64.ts';
import { isDevelopment, type Env } from './env.ts';

const API = 'https://api.github.com';
/** GitHub's API, or in development the `GITHUB_API_URL` override, such as the fake GitHub server (#18). */
const apiBase = (env: Env) => (isDevelopment(env) && env.GITHUB_API_URL ? env.GITHUB_API_URL.replace(/\/$/, '') : API);
// GitHub rejects API requests without a User-Agent, and Workers' fetch doesn't send one.
const baseHeaders = {
	Accept: 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
	'User-Agent': 'visitdhaka-edit-worker',
};

export class GitHubError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

export class NotConfiguredError extends Error {}

/** Imports a PKCS#8 PEM private key. GitHub downloads keys as PKCS#1, which has to be converted first (#10). */
export async function importPrivateKey(pem: string) {
	if (pem.includes('BEGIN RSA PRIVATE KEY')) {
		throw new NotConfiguredError(
			'GITHUB_APP_PRIVATE_KEY is PKCS#1. Convert it with: openssl pkcs8 -topk8 -nocrypt -in app.pem -out app-pkcs8.pem',
		);
	}
	const base64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
	const der = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** A JWT that authenticates as the app itself, valid for 9 minutes (GitHub allows up to 10). */
export async function appJwt(appId: string, key: CryptoKey, now = Math.floor(Date.now() / 1000)) {
	// Backdated a minute to allow for clock drift between Cloudflare and GitHub.
	const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
	const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`));
	return `${header}.${payload}.${base64url(signature)}`;
}

let cachedToken: { token: string; expiresAt: number } | undefined;

/** Forgets the cached installation token. For tests. */
export const clearTokenCache = () => {
	cachedToken = undefined;
};

export const hasAppCredentials = (env: Env) =>
	Boolean(env.GITHUB_APP_ID && env.GITHUB_INSTALLATION_ID && env.GITHUB_APP_PRIVATE_KEY);

/**
 * An installation token for the repo, cached in memory until five minutes before it expires. In development without
 * app credentials, returns undefined so reads go to the public API without signing in.
 */
export async function installationToken(env: Env): Promise<string | undefined> {
	if (!hasAppCredentials(env)) {
		if (isDevelopment(env)) return undefined;
		throw new NotConfiguredError('GitHub App credentials are not set (#10).');
	}
	if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60_000) return cachedToken.token;

	const jwt = await appJwt(env.GITHUB_APP_ID!, await importPrivateKey(env.GITHUB_APP_PRIVATE_KEY!));
	const response = await fetch(`${apiBase(env)}/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`, {
		method: 'POST',
		headers: { ...baseHeaders, Authorization: `Bearer ${jwt}` },
	});
	if (!response.ok) throw new GitHubError(`Could not get an installation token (${response.status}).`, response.status);
	const { token, expires_at } = (await response.json()) as { token: string; expires_at: string };
	cachedToken = { token, expiresAt: Date.parse(expires_at) };
	return token;
}

/** A GitHub REST call as the app, with a path relative to the API root (`/repos/...`). */
export async function github(env: Env, path: string, init: RequestInit = {}) {
	const token = await installationToken(env);
	return fetch(`${apiBase(env)}${path}`, {
		...init,
		headers: { ...baseHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
	});
}

const decodeBase64Utf8 = (base64: string) =>
	new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\s+/g, '')), (char) => char.charCodeAt(0)));

/** A file's text and blob SHA on `ref` (the base branch by default), or undefined if it doesn't exist. */
export async function getFile(env: Env, path: string, ref = env.GITHUB_BASE_BRANCH) {
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	const response = await github(
		env,
		`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
	);
	if (response.status === 404) return undefined;
	if (!response.ok) throw new GitHubError(`Could not read ${path} (${response.status}).`, response.status);
	const data = (await response.json()) as { type: string; content?: string; encoding?: string; sha: string };
	if (data.type !== 'file' || data.encoding !== 'base64' || data.content === undefined) return undefined;
	return { text: decodeBase64Utf8(data.content), sha: data.sha };
}
