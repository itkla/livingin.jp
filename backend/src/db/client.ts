import pg from 'pg';

export interface Queryable {
  /** One parameterised statement. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** One or more statements without parameters (migration scripts). */
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  readonly driver: 'pg' | 'pglite';
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
    driver: 'pg',
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      const tx: Queryable = {
        async query<R>(sql: string, params: unknown[] = []) {
          const r = await client.query(sql, params);
          return { rows: r.rows as R[] };
        },
        async exec(sql: string) {
          await client.query(sql);
        },
      };
      try {
        await client.query('BEGIN');
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * In-process Postgres (WASM) for tests and zero-setup local runs. PGlite is a dev dependency;
 * production always uses `createPgDatabase`.
 */
export async function createPgliteDatabase(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dataDir);
  await db.waitReady;
  const wrap = (q: { query: typeof db.query; exec: typeof db.exec }): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await q.query<T>(sql, params);
      return { rows: r.rows };
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
  });
  return {
    driver: 'pglite',
    ...wrap(db),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx as never))),
    close: () => db.close(),
  };
}
