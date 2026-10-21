// Optional sign-in in the browser (#59, #60), shared by the editor (src/scripts/editor.ts) and the account page
// (src/scripts/account-page.ts): the calls to the edit Worker's /api/auth/* routes, and the display name form
// (src/components/AccountNameForm.astro). Requests use `credentials: 'include'`, because locally the Worker is on
// another port. Messages come from the page, already in the reader's language, and are inserted as text.

export type Account = { id: number; name: string };

/** Who is signed in, or undefined when the Worker doesn't offer sign-in (switched off, or unreachable). */
export async function whoAmI(api: string): Promise<{ user?: Account; pendingName: boolean } | undefined> {
	try {
		const response = await fetch(`${api}/api/auth/me`, { credentials: 'include', cache: 'no-store' });
		const data = await response.json();
		if (!data?.ok) return undefined;
		return { user: data.user ?? undefined, pendingName: data.pendingName === true };
	} catch {
		return undefined;
	}
}

/** Where "Sign in with Google" goes: the Worker's login route, which comes back to `back` (a path on this site). */
export const signInUrl = (api: string, back: string) => `${api}/api/auth/login?${new URLSearchParams({ return: back })}`;

export const signOut = (api: string) =>
	fetch(`${api}/api/auth/logout`, { method: 'POST', credentials: 'include' }).then(
		() => undefined,
		() => undefined,
	);

/** Sends a request and returns `{ ok, data }`, or the error code to show: the Worker's, or `network`. */
async function send(url: string, init: RequestInit) {
	let response: Response;
	try {
		response = await fetch(url, { ...init, credentials: 'include' });
	} catch {
		return { ok: false as const, code: 'network' };
	}
	const data = await response.json().catch(() => undefined);
	if (response.ok && data?.ok) return { ok: true as const, data };
	return { ok: false as const, code: String(data?.errors?.[0]?.code ?? 'generic') };
}

/** Deletes the signed-in account (#60). */
export const deleteAccount = (api: string) => send(`${api}/api/auth/account`, { method: 'DELETE' });

/**
 * Once the account's contributor page exists (after one of its edits is published and the site rebuilt, #62), replaces
 * `element`'s "will be listed once…" note with a link to it.
 */
export function linkContributions(element: HTMLElement, href: string, text: string) {
	fetch(href, { method: 'HEAD' })
		.then((response) => {
			if (response.ok) element.replaceChildren(Object.assign(document.createElement('a'), { href, textContent: text }));
		})
		.catch(() => {});
}

/**
 * Wires up the display name form: a new account's first name, or a new name for the signed-in account. It calls
 * POST /api/auth/name and passes the account to `onSaved`. `message` turns an error code into text.
 */
export function nameForm(options: { api: string; message: (code: string) => string; onSaved: (account: Account) => void }) {
	const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
	const form = $<HTMLFormElement>('account-name-form');
	const input = $<HTMLInputElement>('account-new-name');
	const error = $('account-new-name-error');
	const save = $<HTMLButtonElement>('account-save-name');

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		error.hidden = true;
		input.removeAttribute('aria-invalid');
		save.disabled = true;
		const result = await send(`${options.api}/api/auth/name`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: input.value }),
		});
		save.disabled = false;
		if (result.ok) return options.onSaved(result.data.user);
		error.textContent = options.message(result.code);
		error.hidden = false;
		input.setAttribute('aria-invalid', 'true');
		input.focus();
	});

	return {
		/** Fills the field, for renaming, and clears any old error. */
		reset(value = '') {
			input.value = value;
			error.hidden = true;
			input.removeAttribute('aria-invalid');
		},
	};
}
