import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createPgDatabase, createPgliteDatabase, type Database } from '../src/db/client';
import { SqlIdempotencyStore } from '../src/db/idempotency-store';
import { appliedMigrations, loadMigrations, migrateDown, migrateUp } from '../src/db/migrate';
import { newId } from '../src/lib/ids';

const migrations = loadMigrations();

async function userTables(db: Database): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = current_schema() and table_name <> 'schema_migrations' order by table_name`,
  );
  return rows.map((r) => r.table_name);
}

/**
 * Runs against in-process PGlite by default. Set TEST_DATABASE_URL to also exercise a real
 * Postgres server (CI does this). The target database must be empty and disposable.
 */
const targets: Array<[string, () => Promise<Database>]> = [['pglite', () => createPgliteDatabase()]];
if (process.env.TEST_DATABASE_URL) targets.push(['postgres', async () => createPgDatabase(process.env.TEST_DATABASE_URL!)]);

for (const [name, open] of targets) {
  describe(`migrations (${name})`, () => {
    let db: Database;
    before(async () => {
      db = await open();
      await migrateDown(db, migrations.length).catch(() => undefined);
    });
    after(async () => {
      await migrateDown(db, migrations.length).catch(() => undefined);
      await db.exec('drop table if exists schema_migrations');
      await db.close();
    });

    test('every migration is reversible and versions are contiguous', () => {
      assert.ok(migrations.length > 0);
      migrations.forEach((m, i) => assert.equal(Number(m.version), i + 1, `expected migration ${i + 1}, found ${m.version}`));
    });

    test('up applies everything, then is a no-op', async () => {
      assert.deepEqual(await migrateUp(db), migrations.map((m) => m.version));
      assert.deepEqual(await migrateUp(db), []);
      assert.deepEqual((await appliedMigrations(db)).map((a) => a.version), migrations.map((m) => m.version));
    });

    test('round trip: account and its separate public profile', async () => {
      const accountId = newId('account');
      const profileId = newId('profile');
      await db.transaction(async (tx) => {
        await tx.query(`insert into accounts (id, email, preferred_lang) values ($1, $2, 'ja')`, [accountId, 'Round.Trip@example.com']);
        await tx.query(`insert into public_profiles (id, account_id, display_name) values ($1, $2, $3)`, [profileId, accountId, 'Round Trip']);
      });
      const { rows } = await db.query<{ email: string; display_name: string; status: string; revision: number }>(
        `select a.email, a.status, p.display_name, p.revision from accounts a join public_profiles p on p.account_id = a.id where a.id = $1`,
        [accountId],
      );
      assert.deepEqual(rows, [{ email: 'Round.Trip@example.com', status: 'active', display_name: 'Round Trip', revision: 1 }]);
    });

    test('constraints reject malformed records', async () => {
      await assert.rejects(db.query(`insert into accounts (id, email) values ($1, $2)`, [newId('profile'), 'wrong-prefix@example.com']));
      await assert.rejects(db.query(`insert into accounts (id, email) values ($1, $2)`, [newId('account'), 'ROUND.TRIP@example.com']), 'email is unique case-insensitively');
      await assert.rejects(db.query(`insert into public_profiles (id, account_id, display_name) values ($1, $2, 'x')`, [newId('profile'), newId('account')]), 'profile needs an account');
      await assert.rejects(db.query(`insert into organizations (id, kind) values ($1, 'nonprofit')`, [newId('organization')]), 'organization needs a name');
    });

    test('a failed transaction rolls back completely', async () => {
      const accountId = newId('account');
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.query(`insert into accounts (id, email) values ($1, $2)`, [accountId, 'rollback@example.com']);
          await tx.query(`insert into public_profiles (id, account_id, display_name) values ($1, $2, '')`, [newId('profile'), accountId]);
        }),
      );
      const { rows } = await db.query(`select 1 from accounts where id = $1`, [accountId]);
      assert.equal(rows.length, 0);
    });

    test('idempotency store: claim, replay, mismatch, release', async () => {
      const store = new SqlIdempotencyStore(db);
      const scope = 'acct_test POST /v1/me/listings';
      assert.deepEqual(await store.begin(scope, 'k1', 'fp-a'), { kind: 'new' });
      assert.deepEqual(await store.begin(scope, 'k1', 'fp-a'), { kind: 'in_progress' });
      await store.complete(scope, 'k1', { status: 201, headers: { ETag: '"1"' }, body: '{"id":"x"}' });
      assert.deepEqual(await store.begin(scope, 'k1', 'fp-a'), { kind: 'replay', response: { status: 201, headers: { ETag: '"1"' }, body: '{"id":"x"}' } });
      assert.deepEqual(await store.begin(scope, 'k1', 'fp-b'), { kind: 'mismatch' });
      assert.deepEqual(await store.begin('other scope', 'k1', 'fp-b'), { kind: 'new' });

      assert.deepEqual(await store.begin(scope, 'k2', 'fp-a'), { kind: 'new' });
      await store.release(scope, 'k2');
      assert.deepEqual(await store.begin(scope, 'k2', 'fp-c'), { kind: 'new' }, 'released keys can be reused');

      await db.query(`update idempotency_keys set expires_at = now() - interval '1 second' where key = 'k1'`);
      assert.deepEqual(await store.begin(scope, 'k1', 'fp-b'), { kind: 'new' }, 'expired keys can be reused');
    });

    test('an applied migration that was edited is refused', async () => {
      const edited = migrations.map((m, i) => (i === 0 ? { ...m, checksum: 'edited' } : m));
      await assert.rejects(migrateUp(db, edited), /edited after it was applied/);
    });

    test('down reverts one step at a time, then everything, leaving no tables', async () => {
      const last = migrations.at(-1)!;
      assert.deepEqual(await migrateDown(db, 1), [last.version]);
      assert.ok(!(await appliedMigrations(db)).some((a) => a.version === last.version));
      await migrateDown(db, migrations.length);
      assert.deepEqual(await appliedMigrations(db), []);
      assert.deepEqual(await userTables(db), []);
    });

    test('re-applying after a full rollback works', async () => {
      assert.equal((await migrateUp(db)).length, migrations.length);
      assert.ok((await userTables(db)).includes('accounts'));
    });
  });
}
