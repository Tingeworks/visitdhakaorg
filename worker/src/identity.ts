// Who is making a request, worked out in one place (decision 0006). Anyone can edit anonymously, credited by the
// optional display name they type. With optional Google sign-in (#57), a valid session cookie makes them a signed-in
// account instead. This is the only code that reads the session cookie, and the rest of the Worker takes the identity
// from here rather than reading the name from the request itself.
import type { Env } from './env.ts';
import { SESSION_COOKIE, hasSessionSecret, readCookie, unseal } from './session.ts';
import { findUser, type User } from './users.ts';
import { cleanName, type Result } from './validate.ts';

export type Identity = { kind: 'anonymous'; name: string } | { kind: 'user'; id: number; name: string; banned: boolean };

/** SIGN_IN_ENABLED is the switch: anything but `true` turns sign-in off, and every request is anonymous. */
export const signInEnabled = (env: Env) => env.SIGN_IN_ENABLED === 'true';

/** Whether everything sign-in needs is set (#55). */
export const signInConfigured = (env: Env) =>
	Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.DB && hasSessionSecret(env));

/**
 * The signed-in account: a valid session for an account that still exists, while sign-in is on. The account's row is
 * read every time, so a rename, ban or deletion applies to the next request.
 */
export async function sessionUser(request: Request, env: Env): Promise<User | undefined> {
	if (!signInEnabled(env) || !signInConfigured(env)) return undefined;
	const session = await unseal(env, SESSION_COOKIE, readCookie(request, SESSION_COOKIE));
	if (!session || !Number.isSafeInteger(session.uid)) return undefined;
	return findUser(env.DB!, session.uid as number);
}

/** The editor's identity for a request whose JSON body is `input`. */
export async function identify(request: Request, env: Env, input: { name?: unknown }): Promise<Result<Identity>> {
	const user = await sessionUser(request, env);
	if (user) return { ok: true, value: { kind: 'user', id: user.id, name: user.name, banned: user.bannedAt !== null } };
	const name = cleanName(input.name);
	return name.ok ? { ok: true, value: { kind: 'anonymous', name: name.value } } : name;
}

/**
 * The commit author for an edit. Anonymous edits always use the placeholder email, never one the contributor typed,
 * because GitHub links commit emails to accounts (decision 0003). Signed-in edits use the pseudonymous
 * `user-<id>@visitdhaka.org`, which links one account's edits without anything from its Google account (decision 0006).
 * Contributor profile pages are built from these addresses (#62).
 */
export const authorFor = (identity: Identity) => ({
	name: identity.name,
	email: identity.kind === 'user' ? `user-${identity.id}@visitdhaka.org` : 'anonymous@visitdhaka.org',
});

/** How an edit's contributor is described in the commit and the pull request: `<name> (account <id>)` or `<name> (unverified)`. */
export const creditFor = (identity: Identity) =>
	identity.kind === 'user' ? { name: identity.name, note: `(account ${identity.id})` } : { name: identity.name, note: '(unverified)' };
