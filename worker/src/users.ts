// Accounts for optional Google sign-in (decision 0006), in the D1 `users` table (worker/migrations/). Each function is
// one query, like repo.ts. Google's subject ID is only ever a lookup key: it's never returned, so it can't be shown.
// Names are cleaned by the caller (cleanAccountName in validate.ts) before they reach these functions.

export type User = {
	id: number;
	name: string;
	/** ISO 8601 UTC. */
	createdAt: string;
	bannedAt: string | null;
	banReason: string | null;
};

type Row = { id: number; display_name: string; created_at: string; banned_at: string | null; ban_reason: string | null };

const columns = 'id, display_name, created_at, banned_at, ban_reason';

const toUser = (row: Row): User => ({
	id: row.id,
	name: row.display_name,
	createdAt: row.created_at,
	bannedAt: row.banned_at,
	banReason: row.ban_reason,
});

const changed = (result: D1Result) => result.meta.changes > 0;

export async function findUserBySub(db: D1Database, sub: string) {
	const row = await db.prepare(`SELECT ${columns} FROM users WHERE google_sub = ?`).bind(sub).first<Row>();
	return row ? toUser(row) : undefined;
}

export async function findUser(db: D1Database, id: number) {
	const row = await db.prepare(`SELECT ${columns} FROM users WHERE id = ?`).bind(id).first<Row>();
	return row ? toUser(row) : undefined;
}

/** Every account that exists, banned or not, with its current name, for contributor profile pages (#62). */
export async function listUsers(db: D1Database) {
	const { results } = await db.prepare('SELECT id, display_name FROM users ORDER BY id').all<Pick<Row, 'id' | 'display_name'>>();
	return results.map((row) => ({ id: row.id, name: row.display_name }));
}

/** A new account, or the existing one if the same Google account signed up a moment ago in another tab. */
export async function createUser(db: D1Database, options: { sub: string; name: string; now?: Date }) {
	const row = await db
		.prepare(
			`INSERT INTO users (google_sub, display_name, created_at) VALUES (?, ?, ?) ON CONFLICT (google_sub) DO NOTHING RETURNING ${columns}`,
		)
		.bind(options.sub, options.name, (options.now ?? new Date()).toISOString())
		.first<Row>();
	return row ? toUser(row) : (await findUserBySub(db, options.sub))!;
}

/** False if there's no such account. */
export const renameUser = async (db: D1Database, id: number, name: string) =>
	changed(await db.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(name, id).run());

/** Stops an account making edits (#58). The reason is for maintainers only and is never shown publicly. */
export const banUser = async (db: D1Database, id: number, reason: string, now = new Date()) =>
	changed(await db.prepare('UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?').bind(now.toISOString(), reason, id).run());

export const unbanUser = async (db: D1Database, id: number) =>
	changed(await db.prepare('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = ?').bind(id).run());

/** Deletes the account's row (#60). Its ID is never reused, and its past edits stay in git. */
export const deleteUser = async (db: D1Database, id: number) =>
	changed(await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run());
