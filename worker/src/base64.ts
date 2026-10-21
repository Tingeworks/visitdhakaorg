// base64url, for JWTs (github.ts, google.ts) and signed cookies (session.ts).

export const base64url = (data: ArrayBuffer | Uint8Array | string) => {
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The bytes of a base64url string, or undefined if it isn't one. */
export function fromBase64url(text: string) {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return undefined;
	try {
		return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
	} catch {
		return undefined;
	}
}

/** A random base64url string with `bytes` bytes of entropy. */
export const randomToken = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));
