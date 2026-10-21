// The account page's behaviour (src/pages/[...locale]/account.astro): show who is signed in, and change the display
// name, sign out or delete the account through the edit Worker (src/scripts/account.ts). A new account that signed in
// from here chooses its name here too.
import { deleteAccount, linkContributions, nameForm, signInUrl, signOut, whoAmI, type Account } from './account';

const root = document.getElementById('account');
if (root) start(root);

function start(root: HTMLElement) {
	const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
	const messages: Record<string, string> = JSON.parse($('account-messages').textContent ?? '{}');
	const message = (key: string) => messages[key] ?? messages['edit.error.generic'];
	const api = root.dataset.api ?? '';

	// "Back to the editor", when the editor sent the reader here. Only a path on this site is accepted.
	const back = new URLSearchParams(location.search).get('return') ?? '';
	if (/^\/(?!\/)[^\\]*$/.test(back)) {
		$<HTMLAnchorElement>('account-back-link').href = back;
		$('account-back').hidden = false;
	}
	$<HTMLAnchorElement>('account-sign-in').href = signInUrl(api, location.pathname + location.search);

	let account: Account | undefined;
	let pendingName = false;

	function show() {
		$('account-status').hidden = true;
		$('account-signed-out').hidden = Boolean(account || pendingName);
		$('account-summary').hidden = !account;
		$('account-name').hidden = !account && !pendingName;
		$('account-delete').hidden = !account;
		$('account-skip-name').hidden = !pendingName;
		$('account-name-title').textContent = message(pendingName ? 'edit.chooseNameTitle' : 'edit.changeName');
		if (!account) return;
		$('account-signed-in-as').textContent = message('account.signedInAs').replace('{{name}}', account.name);
		linkContributions($('account-contributions'), `${root.dataset.contributors ?? '/contributors/'}${account.id}/`, message('edit.contributions'));
		names.reset(account.name);
	}

	function showAlert(text: string) {
		$('account-alert-text').textContent = text;
		$('account-alert').hidden = false;
		$('account-alert').focus();
	}

	const names = nameForm({
		api,
		message: (code) => message(`edit.error.${code}`),
		onSaved(saved) {
			const first = pendingName;
			account = saved;
			pendingName = false;
			show();
			$(first ? 'account-signed-in-as' : 'account-name-title').focus();
		},
	});

	$('account-skip-name').addEventListener('click', async () => {
		await signOut(api);
		pendingName = false;
		show();
	});

	$('account-sign-out').addEventListener('click', async () => {
		await signOut(api);
		account = undefined;
		show();
		$('account-sign-in').focus();
	});

	$('account-delete-button').addEventListener('click', async () => {
		if (!confirm(message('edit.deleteConfirm'))) return;
		const result = await deleteAccount(api);
		if (!result.ok) return showAlert(message(`edit.error.${result.code}`));
		account = undefined;
		show();
		const done = $('account-deleted');
		done.textContent = message('account.deleted');
		done.hidden = false;
		$('account-sign-in').focus();
	});

	whoAmI(api).then((me) => {
		if (!me) {
			$('account-status').textContent = message('account.unavailable');
			return;
		}
		account = me.user;
		pendingName = !account && me.pendingName;
		show();
	});
}
