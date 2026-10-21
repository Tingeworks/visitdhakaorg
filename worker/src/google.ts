// Google sign-in as a server-side OpenID Connect redirect with PKCE (decision 0006, #57). No Google library or script:
// the browser is sent to Google, and the code it comes back with is exchanged here with `fetch`. Only the `openid` and
// `profile` scopes are asked for, and only the ID token's `sub` is kept.
import { base64url, fromBase64url } from './base64.ts';
import type { Env } from './env.ts';

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export class GoogleError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

/** The PKCE challenge for a verifier (S256). */
export const pkceChallenge = async (verifier: string) =>
	base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

/** Where to send the browser to sign in. */
export async function authorizeUrl(env: Env, options: { redirectUri: string; state: string; nonce: string; verifier: string }) {
	const url = new URL(AUTHORIZE);
	url.search = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID!,
		redirect_uri: options.redirectUri,
		response_type: 'code',
		scope: 'openid profile',
		state: options.state,
		nonce: options.nonce,
		code_challenge: await pkceChallenge(options.verifier),
		code_challenge_method: 'S256',
		// Lets someone on a shared computer pick their own account rather than whoever is signed in to Google.
		prompt: 'select_account',
	}).toString();
	return url.toString();
}

/** Exchanges the code Google sent back for an ID token. */
export async function exchangeCode(env: Env, options: { code: string; verifier: string; redirectUri: string }) {
	const response = await fetch(TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code: options.code,
			code_verifier: options.verifier,
			redirect_uri: options.redirectUri,
			client_id: env.GOOGLE_CLIENT_ID!,
			client_secret: env.GOOGLE_CLIENT_SECRET!,
		}),
	});
	if (!response.ok) throw new GoogleError(`Google's token endpoint refused the code (${response.status}).`, response.status);
	const { id_token } = (await response.json()) as { id_token?: unknown };
	if (typeof id_token !== 'string') throw new GoogleError('Google sent no ID token.', 502);
	return id_token;
}

/**
 * The Google account's subject ID from an ID token, or undefined if the token isn't for this sign-in. The token came
 * straight from Google's token endpoint over TLS, so as OpenID Connect allows, its signature isn't checked again. Its
 * issuer, audience, expiry and nonce are.
 */
export function subjectOf(env: Env, idToken: string, nonce: string, now = Math.floor(Date.now() / 1000)) {
	const [, payload] = idToken.split('.');
	const bytes = fromBase64url(payload ?? '');
	if (!bytes) return undefined;
	let claims: Record<string, unknown>;
	try {
		claims = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return undefined;
	}
	const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (!ISSUERS.includes(claims.iss as string)) return undefined;
	if (!audience.includes(env.GOOGLE_CLIENT_ID) || (audience.length > 1 && claims.azp !== env.GOOGLE_CLIENT_ID)) return undefined;
	if (typeof claims.exp !== 'number' || claims.exp <= now) return undefined;
	if (claims.nonce !== nonce) return undefined;
	if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) return undefined;
	return claims.sub;
}
