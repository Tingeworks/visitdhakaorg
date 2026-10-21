import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { banUser, createUser, deleteUser, findUser, findUserBySub, listUsers, renameUser, unbanUser } from '../src/users.ts';
import worker from '../src/index.ts';
import { signInEnv, testEnv } from './helpers.ts';
import { cleanAccountName } from '../src/validate.ts';
import { FakeD1 } from './fake-d1.ts';

const now = new Date('2026-10-21T08:00:00Z');
let d1: FakeD1;
let db: D1Database;
beforeEach(() => {
	d1 = new FakeD1();
	db = d1.binding;
});

describe('users', () => {
	test('creates an account and finds it by Google subject or ID', async () => {
		const user = await createUser(db, { sub: '110248495921238986420', name: 'Rahim', now });
		assert.deepEqual(user, { id: 1, name: 'Rahim', createdAt: '2026-10-21T08:00:00.000Z', bannedAt: null, banReason: null });
		assert.deepEqual(await findUserBySub(db, '110248495921238986420'), user);
		assert.deepEqual(await findUser(db, 1), user);
		assert.equal(await findUserBySub(db, 'someone-else'), undefined);
		assert.equal(await findUser(db, 2), undefined);
	});

	test('never returns the Google subject ID', async () => {
		const user = await createUser(db, { sub: '110248495921238986420', name: 'Rahim' });
		assert.ok(!JSON.stringify(user).includes('110248495921238986420'));
	});

	test('returns the existing account when the same Google account signs up twice', async () => {
		const first = await createUser(db, { sub: 'sub-1', name: 'Rahim' });
		const second = await createUser(db, { sub: 'sub-1', name: 'Karim' });
		assert.deepEqual(second, first);
	});

	test('renames an account', async () => {
		const { id } = await createUser(db, { sub: 'sub-1', name: 'Rahim' });
		assert.equal(await renameUser(db, id, 'রহিম'), true);
		assert.equal((await findUser(db, id))!.name, 'রহিম');
		assert.equal(await renameUser(db, 99, 'Nobody'), false);
	});

	test('bans and unbans an account', async () => {
		const { id } = await createUser(db, { sub: 'sub-1', name: 'Rahim' });
		assert.equal(await banUser(db, id, 'Spam on #12', now), true);
		const banned = (await findUser(db, id))!;
		assert.equal(banned.bannedAt, '2026-10-21T08:00:00.000Z');
		assert.equal(banned.banReason, 'Spam on #12');
		assert.equal(await unbanUser(db, id), true);
		assert.deepEqual([(await findUser(db, id))!.bannedAt, (await findUser(db, id))!.banReason], [null, null]);
		assert.equal(await banUser(db, 99, 'x'), false);
	});

	test('deletes an account and never reuses its ID', async () => {
		const { id } = await createUser(db, { sub: 'sub-1', name: 'Rahim' });
		assert.equal(await deleteUser(db, id), true);
		assert.equal(await findUser(db, id), undefined);
		assert.equal(await deleteUser(db, id), false);
		const again = await createUser(db, { sub: 'sub-1', name: 'Rahim' });
		assert.equal(again.id, 2);
	});
});

describe('the users table', () => {
	test('has no column for an email or Google profile data', () => {
		const columns = d1.sqlite.prepare("SELECT name FROM pragma_table_info('users')").all().map((row) => row.name);
		assert.deepEqual(columns, ['id', 'google_sub', 'display_name', 'created_at', 'banned_at', 'ban_reason']);
	});

	test('refuses an email address in any text column', async () => {
		await assert.rejects(createUser(db, { sub: 'sub-1', name: 'rahim@example.com' }), /CHECK/);
		await assert.rejects(createUser(db, { sub: 'rahim@example.com', name: 'Rahim' }), /CHECK/);
		const { id } = await createUser(db, { sub: 'sub-1', name: 'Rahim' });
		await assert.rejects(renameUser(db, id, 'rahim@gmail.com'), /CHECK/);
		await assert.rejects(banUser(db, id, 'reported by karim@example.com'), /CHECK/);
	});

	test('refuses an empty name', async () => {
		await assert.rejects(createUser(db, { sub: 'sub-1', name: '' }), /CHECK/);
	});
});

describe('cleanAccountName', () => {
	const code = (raw: unknown) => {
		const result = cleanAccountName(raw);
		return result.ok ? result.value : result.errors[0].code;
	};

	test('cleans like the anonymous name', () => {
		assert.equal(code('  <b>Rahim</b>  Uddin '), 'Rahim Uddin');
		assert.equal(code('রহিম'), 'রহিম');
		assert.equal(code('a'.repeat(41)), 'name_too_long');
		assert.equal(code('see https://spam.example'), 'name_has_link');
	});

	test('is required, never Anonymous and never an email address', () => {
		for (const raw of [undefined, null, '', '   ', '<b></b>', 42]) assert.equal(code(raw), 'name_required');
		assert.equal(code('anonymous'), 'name_reserved');
		assert.equal(code('rahim@example.com'), 'name_has_email');
		assert.equal(code('Rahim @ Dhaka'), 'Rahim @ Dhaka');
	});
});

describe('GET /api/users', () => {
	const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
	const call = (env = signInEnv(db)) => worker.fetch(new Request('https://visitdhaka.org/api/users'), env, ctx);

	test('lists every account that exists, banned or not, with only its ID and current name', async () => {
		const rahim = await createUser(db, { sub: 'sub-1', name: 'Rahim', now });
		const karim = await createUser(db, { sub: 'sub-2', name: 'Karim' });
		const gone = await createUser(db, { sub: 'sub-3', name: 'Gone' });
		await renameUser(db, rahim.id, 'রহিম');
		await banUser(db, karim.id, 'spam');
		await deleteUser(db, gone.id);

		const response = await call();
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
		const text = await response.text();
		assert.deepEqual(JSON.parse(text), { ok: true, users: [{ id: 1, name: 'রহিম' }, { id: 2, name: 'Karim' }] });
		for (const hidden of ['sub-1', 'spam', '2026-10-21', 'Gone']) assert.ok(!text.includes(hidden), hidden);
		assert.deepEqual(await listUsers(db), [{ id: 1, name: 'রহিম' }, { id: 2, name: 'Karim' }]);
	});

	test('works with sign-in switched off, so profiles survive the kill switch', async () => {
		await createUser(db, { sub: 'sub-1', name: 'Rahim' });
		const response = await call(signInEnv(db, { SIGN_IN_ENABLED: 'false' }));
		assert.deepEqual((await response.json()).users, [{ id: 1, name: 'Rahim' }]);
	});

	test('reports a missing database as not_configured', async () => {
		const response = await call(testEnv());
		assert.equal(response.status, 503);
		assert.deepEqual(await response.json(), { ok: false, errors: [{ code: 'not_configured' }] });
	});
});
