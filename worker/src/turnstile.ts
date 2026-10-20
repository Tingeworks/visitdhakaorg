// Cloudflare Turnstile, verified on the server for every edit (docs/architecture/open-editing.md).
import type { Env } from './env.ts';
import { NotConfiguredError } from './github.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True when Turnstile accepts `token` for this visitor. */
export async function verifyTurnstile(env: Env, token: unknown, ip: string | null) {
	if (!env.TURNSTILE_SECRET_KEY) throw new NotConfiguredError('TURNSTILE_SECRET_KEY is not set (#10).');
	if (typeof token !== 'string' || !token || token.length > 2048) return false;
	const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
	if (ip) form.set('remoteip', ip);
	const response = await fetch(SITEVERIFY, { method: 'POST', body: form });
	if (!response.ok) return false;
	return ((await response.json()) as { success?: boolean }).success === true;
}
