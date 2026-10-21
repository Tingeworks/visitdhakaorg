// Signed cookies for optional Google sign-in (#57): the 30-day session, and the 10-minute cookies that carry a sign-in
// and a first sign-up across Google's redirect. A value is `<payload>.<signature>`: base64url JSON with an `exp`, and an
// HMAC-SHA256 over the cookie's name and the payload, keyed with SESSION_SECRET (WebCrypto). Signing the name too means a
// value can't be moved from one cookie to another. There's no session table: a session holds only the user ID, and
// identity.ts reads the user's row on every request, so a ban or a deleted account takes effect at once.
import { base64url, fromBase64url } from './base64.ts';
import type { Env } from './env.ts';

/** The signed-in session. Only identity.ts reads it. */
export const SESSION_COOKIE = '__Host-session';
/** `state`, `nonce`, the PKCE verifier and the return path, from /api/auth/login to /api/auth/callback. */
export const SIGN_IN_COOKIE = '__Host-signin';
/** A new Google account's subject ID, from /api/auth/callback until it chooses a display name (POST /api/auth/name). */
export const SIGN_UP_COOKIE = '__Host-signup';

export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const FLOW_SECONDS = 10 * 60;

/** SESSION_SECRET must be at least 32 bytes. A shorter one counts as missing, so sign-in reports `not_configured`. */
export const hasSessionSecret = (env: Env) => new TextEncoder().encode(env.SESSION_SECRET ?? '').length >= 32;

const key = (env: Env) =>
	crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);

const now = () => Math.floor(Date.now() / 1000);

/** A signed cookie value holding `data`, valid for `seconds`. */
export async function seal(env: Env, name: string, data: Record<string, unknown>, seconds: number) {
	const payload = base64url(JSON.stringify({ ...data, exp: now() + seconds }));
	const signature = await crypto.subtle.sign('HMAC', await key(env), new TextEncoder().encode(`${name}.${payload}`));
	return `${payload}.${base64url(signature)}`;
}

/** The data in a signed cookie value, or undefined if it's missing, tampered with or expired. */
export async function unseal(env: Env, name: string, value: string | undefined): Promise<Record<string, unknown> | undefined> {
	if (!value || !hasSessionSecret(env)) return undefined;
	const [payload, signature, extra] = value.split('.');
	const signatureBytes = fromBase64url(signature ?? '');
	if (!payload || !signatureBytes || extra !== undefined) return undefined;
	const valid = await crypto.subtle.verify('HMAC', await key(env), signatureBytes, new TextEncoder().encode(`${name}.${payload}`));
	if (!valid) return undefined;
	try {
		const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
		return data && typeof data === 'object' && typeof data.exp === 'number' && data.exp > now() ? data : undefined;
	} catch {
		return undefined;
	}
}

/** A cookie's value on the request. */
export function readCookie(request: Request, name: string) {
	for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
		const [key, ...value] = part.trim().split('=');
		if (key === name) return value.join('=');
	}
	return undefined;
}

/** A `Set-Cookie` value. Every cookie is first-party, `HttpOnly`, `Secure` and `SameSite=Lax` (`__Host-` needs the rest). */
export const cookie = (name: string, value: string, maxAge: number) =>
	`${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;

export const clearCookie = (name: string) => cookie(name, '', 0);
