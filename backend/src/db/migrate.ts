import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database, Queryable } from './client';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

export interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: string;
}

const FILE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

/** Reads `NNNN_name.up.sql` / `NNNN_name.down.sql` pairs. Every migration must be reversible. */
export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const pairs = new Map<string, { name: string; up?: string; down?: string }>();
  for (const file of readdirSync(dir).sort()) {
    const m = FILE.exec(file);
    if (!m) continue;
    const [, version, name, direction] = m as unknown as [string, string, string, 'up' | 'down'];
    const entry = pairs.get(version) ?? { name };
    if (entry.name !== name) throw new Error(`Migration ${version} has mismatched names: ${entry.name} / ${name}`);
    entry[direction] = readFileSync(join(dir, file), 'utf8');
    pairs.set(version, entry);
  }
  return [...pairs.entries()].map(([version, e]) => {
    if (!e.up || !e.down) throw new Error(`Migration ${version}_${e.name} needs both .up.sql and .down.sql`);
    return { version, name: e.name, up: e.up, down: e.down, checksum: createHash('sha256').update(e.up).digest('hex') };
  });
}

const LOCK = `select pg_advisory_xact_lock(hashtext('livingin.schema_migrations'))`;

async function ensureTable(db: Queryable) {
  await db.exec(`create table if not exists schema_migrations (
    version text primary key,
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);
}

export async function appliedMigrations(db: Database): Promise<AppliedMigration[]> {
  await ensureTable(db);
  const { rows } = await db.query<AppliedMigration>(`select version, name, checksum, applied_at::text as applied_at from schema_migrations order by version`);
  return rows;
}

function verifyHistory(applied: AppliedMigration[], available: Migration[]) {
  const byVersion = new Map(available.map((m) => [m.version, m]));
  for (const a of applied) {
    const m = byVersion.get(a.version);
    if (!m) throw new Error(`Applied migration ${a.version}_${a.name} is missing from the migrations directory`);
    if (m.checksum !== a.checksum) throw new Error(`Applied migration ${a.version}_${a.name} was edited after it was applied; add a new migration instead`);
  }
}

/** Applies pending migrations in order, each in its own transaction. Returns the versions applied. */
export async function migrateUp(db: Database, migrations: Migration[] = loadMigrations()): Promise<string[]> {
  const applied = await appliedMigrations(db);
  verifyHistory(applied, migrations);
  const done = new Set(applied.map((a) => a.version));
  const ran: string[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    await db.transaction(async (tx) => {
      await tx.query(LOCK);
      const again = await tx.query(`select 1 from schema_migrations where version = $1`, [m.version]);
      if (again.rows.length) return;
      await tx.exec(m.up);
      await tx.query(`insert into schema_migrations (version, name, checksum) values ($1, $2, $3)`, [m.version, m.name, m.checksum]);
      ran.push(m.version);
    });
  }
  return ran;
}

/** Reverts the most recent `steps` migrations (default 1), newest first. */
export async function migrateDown(db: Database, steps = 1, migrations: Migration[] = loadMigrations()): Promise<string[]> {
  const applied = await appliedMigrations(db);
  verifyHistory(applied, migrations);
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  const reverted: string[] = [];
  for (const a of applied.reverse().slice(0, steps)) {
    const m = byVersion.get(a.version)!;
    await db.transaction(async (tx) => {
      await tx.query(LOCK);
      await tx.exec(m.down);
      await tx.query(`delete from schema_migrations where version = $1`, [m.version]);
    });
    reverted.push(m.version);
  }
  return reverted;
}
