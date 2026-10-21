// An in-memory stand-in for a D1 database, backed by Node's built-in SQLite, with every migration in worker/migrations/
// applied. D1 is SQLite too, so tests run the real migrations and queries, through the parts of D1's API the Worker uses.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const migrations = join(import.meta.dirname, '../migrations');

class Statement {
	private readonly db: DatabaseSync;
	private readonly sql: string;
	private readonly values: SQLInputValue[];

	constructor(db: DatabaseSync, sql: string, values: SQLInputValue[] = []) {
		this.db = db;
		this.sql = sql;
		this.values = values;
	}

	bind(...values: SQLInputValue[]) {
		return new Statement(this.db, this.sql, values);
	}

	async first() {
		const row = this.db.prepare(this.sql).get(...this.values);
		return row ? { ...row } : null;
	}

	async all() {
		return { success: true, results: this.db.prepare(this.sql).all(...this.values).map((row) => ({ ...row })), meta: {} };
	}

	async run() {
		const result = this.db.prepare(this.sql).run(...this.values);
		return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
	}
}

export class FakeD1 {
	readonly sqlite = new DatabaseSync(':memory:');

	constructor() {
		for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
			this.sqlite.exec(readFileSync(join(migrations, file), 'utf8'));
		}
	}

	prepare(sql: string) {
		return new Statement(this.sqlite, sql);
	}

	/** This fake as the Worker's `DB` binding. */
	get binding() {
		return this as unknown as D1Database;
	}
}
