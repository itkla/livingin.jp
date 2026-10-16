import { IDEMPOTENCY_TTL_MS, type BeginResult, type IdempotencyStore, type StoredResponse } from '../http/idempotency';
import type { Database } from './client';

interface Row {
  fingerprint: string;
  response_status: number | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
}

/** Postgres-backed Idempotency-Key store for live mode. */
export class SqlIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Database) {}

  async begin(scope: string, key: string, fingerprint: string): Promise<BeginResult> {
    return this.db.transaction(async (tx) => {
      // An expired key is free to reuse.
      await tx.query(`delete from idempotency_keys where scope = $1 and key = $2 and expires_at <= now()`, [scope, key]);
      const inserted = await tx.query(
        `insert into idempotency_keys (scope, key, fingerprint, expires_at)
         values ($1, $2, $3, now() + ($4::int * interval '1 millisecond'))
         on conflict (scope, key) do nothing
         returning key`,
        [scope, key, fingerprint, IDEMPOTENCY_TTL_MS],
      );
      if (inserted.rows.length) return { kind: 'new' } as const;
      const { rows } = await tx.query<Row>(
        `select fingerprint, response_status, response_headers, response_body from idempotency_keys where scope = $1 and key = $2`,
        [scope, key],
      );
      const row = rows[0];
      if (!row) return { kind: 'new' } as const;
      if (row.fingerprint !== fingerprint) return { kind: 'mismatch' } as const;
      if (row.response_status === null) return { kind: 'in_progress' } as const;
      return { kind: 'replay', response: { status: row.response_status, headers: row.response_headers ?? {}, body: row.response_body } } as const;
    });
  }

  async complete(scope: string, key: string, response: StoredResponse): Promise<void> {
    await this.db.query(
      `update idempotency_keys set response_status = $3, response_headers = $4::jsonb, response_body = $5 where scope = $1 and key = $2`,
      [scope, key, response.status, JSON.stringify(response.headers), response.body],
    );
  }

  async release(scope: string, key: string): Promise<void> {
    await this.db.query(`delete from idempotency_keys where scope = $1 and key = $2 and response_status is null`, [scope, key]);
  }
}
