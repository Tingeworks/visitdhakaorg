import { readChanges, type Change } from './changes';
import { localizePath } from './i18n';

// Contributor profile pages for signed-in editors (#62), at /contributors/<id>/ and /bn/contributors/<id>/. A signed-in
// edit's commit has the author email `user-<id>@visitdhaka.org` (decision 0003), so git alone finds every published
// edit by one account. Git can't say what an account is called now or whether it was deleted, so the build also asks
// the edit Worker (GET /api/users). If the Worker can't be reached, no profile pages are built, so a deleted account's
// page can't come back from git alone. Profiles are built only with PUBLIC_SIGN_IN_ENABLED, so builds without sign-in
// make no network request.

export const profilesEnabled = import.meta.env.PUBLIC_SIGN_IN_ENABLED === 'true';

/** The edit Worker. In production it's on the site's own origin, which a build has to name. */
const api = (import.meta.env.PUBLIC_EDIT_API_URL || 'https://visitdhaka.org').replace(/\/$/, '');

export type Profile = { id: number; name: string; changes: Change[] };

/** Accounts that still exist, by ID, with their current names. Undefined if the Worker can't be reached. */
async function currentAccounts() {
	try {
		const response = await fetch(`${api}/api/users`, { signal: AbortSignal.timeout(10_000) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json();
		if (!data?.ok || !Array.isArray(data.users)) throw new Error('unexpected response');
		const valid = (user: { id?: unknown; name?: unknown }) =>
			Number.isSafeInteger(user?.id) && typeof user?.name === 'string' && user.name.length > 0;
		return new Map<number, string>(data.users.filter(valid).map((user: { id: number; name: string }) => [user.id, user.name]));
	} catch (cause) {
		console.warn(`[profiles] Couldn't read ${api}/api/users (${(cause as Error).message}), so no contributor profile pages are built.`);
		return undefined;
	}
}

async function load(): Promise<Profile[]> {
	if (!profilesEnabled) return [];
	const accounts = await currentAccounts();
	if (!accounts) return [];
	const byAccount = new Map<number, Change[]>();
	// Only commits by these pseudonymous addresses are read. Every other author is left out by git itself.
	for (const change of readChanges(['--extended-regexp', '--author=<user-[0-9]+@visitdhaka\\.org>$'])) {
		if (change.account === undefined || !accounts.has(change.account)) continue;
		byAccount.set(change.account, [...(byAccount.get(change.account) ?? []), change]);
	}
	return [...byAccount].map(([id, changes]) => ({ id, name: accounts.get(id)!, changes }));
}

let cache: Promise<Profile[]> | undefined;

/** Every account that exists and has at least one published edit, read once per build. */
export function profiles() {
	cache ??= load();
	return cache;
}

/** IDs of the accounts with a profile page, for linking names to them. */
export const profileIds = async () => new Set((await profiles()).map((profile) => profile.id));

export const profileUrl = (id: number, locale: string | undefined) => localizePath(`/contributors/${id}/`, locale);
