// JSON responses and CORS. Every error has the same shape, `{ ok: false, errors: [{ code, field? }] }`, so the editor
// (#16) can translate each code. Validation errors from validate.ts already have that shape.
import type { Env } from './env.ts';
import type { ValidationError } from './validate.ts';

export type ErrorBody = { code: string; field?: string };

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
	});
}

export const error = (status: number, code: string, field?: string) =>
	json({ ok: false, errors: [field ? { code, field } : { code }] }, status);

export const validationErrors = (errors: ValidationError[], status = 400) => json({ ok: false, errors }, status);

const allowedOrigins = (env: Env) =>
	env.ALLOWED_ORIGIN.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

/** True when the request comes from an allowed origin, or has no Origin header (not a browser cross-origin call). */
export function isAllowedOrigin(request: Request, env: Env) {
	const origin = request.headers.get('Origin');
	return origin === null || allowedOrigins(env).includes(origin);
}

/** Adds CORS headers for allowed origins. Other origins get none, so the browser blocks the response. */
export function withCors(response: Response, request: Request, env: Env) {
	const origin = request.headers.get('Origin');
	if (!origin || !allowedOrigins(env).includes(origin)) return response;
	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', origin);
	headers.append('Vary', 'Origin');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function preflight(request: Request, env: Env) {
	if (!isAllowedOrigin(request, env)) return new Response(null, { status: 403 });
	return withCors(
		new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Max-Age': '86400',
			},
		}),
		request,
		env,
	);
}
