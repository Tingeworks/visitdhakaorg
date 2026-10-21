// The in-site editor's behaviour (src/pages/[...locale]/edit.astro): load the page's Markdown from the edit Worker, show
// the form, load Turnstile, and send the edit. The Worker's responses are documented in
// docs/architecture/open-editing.md ("Responses from POST /api/edit"). Every message comes from the page, already in
// the reader's language, and is inserted as text, never as HTML. With sign-in on (#59), it also shows whether the reader
// is signed in (GET /api/auth/me), and asks a new account for its display name (POST /api/auth/name) before anything
// else. Requests that may carry the session cookie use `credentials: 'include'`, because locally the Worker is on
// another port.

type Turnstile = {
	render: (element: HTMLElement, options: Record<string, unknown>) => string;
	getResponse: (widget: string) => string | undefined;
	reset: (widget: string) => void;
};
type ApiError = { code: string; field?: string };

declare global {
	interface Window {
		turnstile?: Turnstile;
		onVisitDhakaTurnstile?: () => void;
	}
}

const root = document.getElementById('editor');
if (root) start(root);

function start(root: HTMLElement) {
	const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
	const messages: Record<string, string> = JSON.parse($('edit-messages').textContent ?? '{}');
	const message = (key: string) => messages[key] ?? messages['edit.error.generic'];
	const api = root.dataset.api ?? '';

	const status = $('edit-status');
	const alert = $('edit-alert');
	const alertText = $('edit-alert-text');
	const reload = $<HTMLButtonElement>('edit-reload');
	const form = $<HTMLFormElement>('edit-form');
	const body = $<HTMLTextAreaElement>('edit-body');
	const submit = $<HTMLButtonElement>('edit-submit');
	const fields = ['body', 'name', 'summary', 'licence', 'turnstile'] as const;

	const path = new URLSearchParams(location.search).get('path') ?? '';
	// The page's address on the site, for "Cancel" and "Back to the page": src/content/docs/bn/areas/x.md -> /bn/areas/x/.
	// An English file edited from the Bangla editor goes back to the Bangla page, which shows the English text.
	const page = path.replace(/^src\/content\/docs\//, '').replace(/\.md$/, '').replace(/(^|\/)index$/, '');
	const prefix = root.dataset.locale && !page.startsWith(`${root.dataset.locale}/`) ? `${root.dataset.locale}/` : '';
	const pageUrl = `/${prefix}${page}/`.replace(/\/+/g, '/');
	for (const id of ['edit-cancel', 'edit-back']) $<HTMLAnchorElement>(id).href = pageUrl;
	// The text's language follows its file, so Bangla files get Bangla spellchecking and fonts.
	body.lang = path.startsWith('src/content/docs/bn/') ? 'bn' : 'en';

	let baseSha = '';
	let original = '';
	let sent = false;
	let widget: string | undefined;
	/** The page text has loaded, so the form can be shown. */
	let loaded = false;
	/** A new account is choosing its display name, so the form waits. */
	let choosingName = false;
	/** The signed-in account, if any. Its name is sent by the session, not the form. */
	let account: { id: number; name: string } | undefined;

	/** Replaces {{link}} in a message with a link, keeping the rest as text. */
	function fillWithLink(element: HTMLElement, text: string, href: string, linkText: string) {
		const [before, after = ''] = text.split('{{link}}');
		const link = Object.assign(document.createElement('a'), { href, textContent: linkText });
		element.replaceChildren(before, link, after);
	}

	function showAlert(text: string, offerReload = false) {
		alertText.textContent = text;
		reload.hidden = !offerReload;
		alert.hidden = false;
		alert.focus();
	}

	function clearErrors() {
		alert.hidden = true;
		for (const field of fields) {
			const error = $(`edit-${field}-error`);
			error.hidden = true;
			error.textContent = '';
			document.getElementById(`edit-${field}`)?.removeAttribute('aria-invalid');
		}
	}

	function showFieldError(field: string, text: string) {
		const error = document.getElementById(`edit-${field}-error`);
		if (!error) return false;
		error.textContent = text;
		error.hidden = false;
		document.getElementById(`edit-${field}`)?.setAttribute('aria-invalid', 'true');
		return true;
	}

	function loadTurnstile() {
		const render = () => {
			widget = window.turnstile!.render($('edit-turnstile'), { sitekey: root.dataset.sitekey, language: 'auto' });
		};
		if (window.turnstile) return render();
		window.onVisitDhakaTurnstile = render;
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onVisitDhakaTurnstile';
		script.async = true;
		script.onerror = () => showAlert(message('edit.error.turnstile'));
		document.head.append(script);
	}

	async function load() {
		clearErrors();
		status.hidden = false;
		form.hidden = true;
		let response: Response;
		try {
			response = await fetch(`${api}/api/source?${new URLSearchParams({ path })}`, { cache: 'no-store' });
		} catch {
			status.textContent = message('edit.loadFailed');
			return;
		}
		const data = await response.json().catch(() => undefined);
		if (!response.ok || !data?.ok) {
			const code = data?.errors?.[0]?.code ?? '';
			status.textContent = message(
				response.status === 404 ? 'edit.notFound' : code.startsWith('path_') ? 'edit.notEditable' : 'edit.loadFailed',
			);
			return;
		}
		baseSha = data.sha;
		original = data.body;
		body.value = data.body;
		$('edit-heading').textContent = message('edit.editing').replace('{{title}}', data.title);
		const pending = $('edit-pending');
		pending.hidden = !data.pending;
		if (data.pending) fillWithLink(pending, root.dataset.pending ?? '', data.pending.prUrl, message('edit.pendingLink'));
		status.hidden = true;
		loaded = true;
		form.hidden = choosingName;
		if (!widget) loadTurnstile();
	}

	// ---------- Optional sign-in (#59) ----------

	const signIn = root.dataset.signIn === 'true';
	const chooseName = document.getElementById('edit-choose-name');

	/** Shows the signed-in or signed-out state, or hides sign-in altogether when the Worker doesn't offer it. */
	function showAccount(state: 'signed-in' | 'signed-out' | 'unavailable') {
		const panel = $('edit-account');
		panel.hidden = state === 'unavailable';
		$('edit-signed-out').hidden = state !== 'signed-out';
		$('edit-signed-in').hidden = state !== 'signed-in';
		$('edit-name-field').hidden = state === 'signed-in';
		if (state !== 'signed-in' || !account) return;
		$('edit-signed-in-as').textContent = message('edit.signedInAs').replace('{{name}}', account.name);
		// The profile page exists once one of the account's edits is published and the site rebuilt (#62).
		const profile = `${root.dataset.contributors ?? '/contributors/'}${account.id}/`;
		fetch(profile, { method: 'HEAD' })
			.then((response) => {
				if (!response.ok) return;
				const link = Object.assign(document.createElement('a'), { href: profile, textContent: message('edit.contributions') });
				$('edit-contributions').replaceChildren(link);
			})
			.catch(() => {});
	}

	function showChooseName(renaming: boolean) {
		if (!chooseName) return;
		choosingName = true;
		chooseName.hidden = false;
		form.hidden = true;
		$('edit-skip-name').hidden = renaming;
		$('edit-cancel-name').hidden = !renaming;
		const input = $<HTMLInputElement>('edit-new-name');
		input.value = renaming && account ? account.name : '';
		$('edit-choose-name-title').focus();
	}

	function hideChooseName() {
		if (!chooseName) return;
		choosingName = false;
		chooseName.hidden = true;
		form.hidden = !loaded;
	}

	async function loadAccount() {
		let data: { ok?: boolean; user?: { id: number; name: string } | null; pendingName?: boolean } | undefined;
		try {
			const response = await fetch(`${api}/api/auth/me`, { credentials: 'include', cache: 'no-store' });
			data = await response.json();
		} catch {
			data = undefined;
		}
		if (!data?.ok) return showAccount('unavailable');
		account = data.user ?? undefined;
		showAccount(account ? 'signed-in' : 'signed-out');
		if (!account && data.pendingName) showChooseName(false);
	}

	if (signIn && chooseName) {
		$<HTMLAnchorElement>('edit-sign-in').href =
			`${api}/api/auth/login?${new URLSearchParams({ return: location.pathname + location.search })}`;

		$('edit-name-form').addEventListener('submit', async (event) => {
			event.preventDefault();
			const input = $<HTMLInputElement>('edit-new-name');
			const error = $('edit-new-name-error');
			error.hidden = true;
			input.removeAttribute('aria-invalid');
			const save = $<HTMLButtonElement>('edit-save-name');
			save.disabled = true;
			let response: Response | undefined;
			try {
				response = await fetch(`${api}/api/auth/name`, {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: input.value }),
				});
			} catch {
				response = undefined;
			}
			save.disabled = false;
			const data = await response?.json().catch(() => undefined);
			if (response?.ok && data?.ok) {
				account = data.user;
				hideChooseName();
				showAccount('signed-in');
				$('edit-signed-in-as').focus();
				return;
			}
			const code = data?.errors?.[0]?.code;
			error.textContent = message(response ? `edit.error.${code}` : 'edit.error.network');
			error.hidden = false;
			input.setAttribute('aria-invalid', 'true');
			input.focus();
			// A sign-up that took longer than ten minutes: start again.
			if (code === 'signed_out') showAccount('signed-out');
		});

		const signOut = async () => {
			await fetch(`${api}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
			account = undefined;
			hideChooseName();
			showAccount('signed-out');
		};
		$('edit-skip-name').addEventListener('click', signOut);
		$('edit-sign-out').addEventListener('click', signOut);
		$('edit-cancel-name').addEventListener('click', () => {
			hideChooseName();
			$('edit-change-name').focus();
		});
		$('edit-change-name').addEventListener('click', () => showChooseName(true));
		$('edit-signed-in-as').tabIndex = -1;
		loadAccount();
	}

	function showErrors(response: Response, errors: ApiError[] | undefined) {
		if (!errors?.length) {
			return showAlert(message(response.status === 429 ? 'edit.error.rate_limited' : 'edit.error.generic'));
		}
		let first: HTMLElement | undefined;
		for (const { code, field } of errors) {
			if (code === 'stale') return showAlert(message('edit.error.stale'), true);
			const text = message(`edit.error.${code}`);
			if (field && showFieldError(field, text)) first ??= document.getElementById(`edit-${field}`) ?? undefined;
			else showAlert(text);
		}
		first?.focus();
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		clearErrors();
		const licence = $<HTMLInputElement>('edit-licence').checked;
		const token = widget ? window.turnstile?.getResponse(widget) : undefined;
		if (!licence) showFieldError('licence', message('edit.error.licence_required'));
		if (!token) showFieldError('turnstile', message('edit.error.turnstile'));
		if (!licence || !token) {
			if (!licence) $('edit-licence').focus();
			else showAlert(message('edit.error.turnstile'));
			return;
		}

		submit.disabled = true;
		submit.textContent = message('edit.submitting');
		let response: Response | undefined;
		try {
			response = await fetch(`${api}/api/edit`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path,
					body: body.value,
					baseSha,
					// A signed-in edit is credited to the account, so the name field isn't sent.
					...(account ? {} : { name: $<HTMLInputElement>('edit-name').value }),
					summary: $<HTMLInputElement>('edit-summary').value,
					turnstile: token,
					licence,
				}),
			});
		} catch {
			showAlert(message('edit.error.network'));
		}
		submit.disabled = false;
		submit.textContent = message('edit.submit');
		// Each Turnstile token works once, so get a fresh one for the next try.
		if (widget) window.turnstile?.reset(widget);
		if (!response) return;

		const data = await response.json().catch(() => undefined);
		if (response.ok && data?.ok) {
			sent = true;
			form.hidden = true;
			const success = $('edit-success');
			fillWithLink($('edit-success-text'), root.dataset.success ?? '', data.prUrl, message('edit.successLink'));
			success.hidden = false;
			success.focus();
			return;
		}
		showErrors(response, data?.errors);
	});

	// The stale message has already asked the reader to copy their text before reloading.
	reload.addEventListener('click', () => load());

	// Warn before leaving with unsent changes.
	addEventListener('beforeunload', (event) => {
		if (!sent && !form.hidden && body.value !== original) event.preventDefault();
	});

	if (path) load();
	else status.textContent = message('edit.notFound');
}

export {};
