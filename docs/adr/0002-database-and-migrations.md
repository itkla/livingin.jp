# ADR 0002: Database and migrations

- **Status:** Proposed (2026-10-16)
- **Issues:** [#12](https://github.com/itkla/livingin.jp/issues/12), consumers [#13](https://github.com/itkla/livingin.jp/issues/13)–[#17](https://github.com/itkla/livingin.jp/issues/17), [#34](https://github.com/itkla/livingin.jp/issues/34), [#38](https://github.com/itkla/livingin.jp/issues/38)

## Context

The core invariants are transactional: an RSVP must not exceed capacity under concurrent requests, an Idempotency-Key must claim exactly once, a moderation approval must bind to exactly one content revision, and item reservations must not double-book. Locality needs proximity queries ([#14](https://github.com/itkla/livingin.jp/issues/14)). Search needs Japanese text handling ([#16](https://github.com/itkla/livingin.jp/issues/16)).

## Options considered

| Option | For | Against |
|---|---|---|
| **PostgreSQL 16+** | Row locks, `SELECT … FOR UPDATE SKIP LOCKED` for job queues, partial and unique indexes, JSONB, PostGIS, advisory locks. Widely hosted, including in Tokyo regions. | Japanese full-text search needs an extension (pg_bigm or PGroonga) whose availability varies by managed provider, or an external search service. |
| SQLite / Cloudflare D1 | Simple, cheap, embedded. | A single writer, no row-level locking, no PostGIS, extension support limited. |
| MySQL 8 | Mature and widely hosted. | Weaker partial/expression indexes and JSON tooling for this design. No advantage over Postgres here. |
| Document database | Flexible schemas. | The domain is relational, and the integrity constraints above would move into application code. |

## Decision

- **PostgreSQL 16 or later** in every environment.
- **Migrations are plain SQL** in `backend/src/db/migrations/NNNN_name.up.sql` with a mandatory `NNNN_name.down.sql`. The runner (`src/db/migrate.ts`):
  - applies each migration in its own transaction, under a transaction-scoped advisory lock, so concurrent deploys can't double-apply;
  - records a SHA-256 checksum and refuses to run if an applied migration was edited (add a new migration instead);
  - supports `up`, `down [steps]` and `status` (`npm run db:migrate`, `db:rollback`, `db:status`).
- **Production is forward-only by policy.** Down migrations exist so every change is reversible in development and CI, and as an emergency tool. Destructive production changes use expand → migrate data → contract across releases.
- **Constraints live in the database** where they can: ID prefix checks, enum checks, case-insensitive unique email, cascading ownership. Application validation duplicates them for good error messages; it doesn't replace them.
- **Tests run on PGlite** (Postgres compiled to WASM, a dev dependency) so `npm test` needs no server, and CI also runs them against a real `postgres:16` service (`TEST_DATABASE_URL`).
- **No ORM yet.** The `Database` interface (`src/db/client.ts`) exposes parameterised `query`, `exec` and `transaction`. A typed query builder (Kysely is the leading candidate) can be adopted with the first domain implementation ([#13](https://github.com/itkla/livingin.jp/issues/13)) without changing the migration approach.

The P0 schema is deliberately small: `accounts`, `public_profiles`, `organizations` and `organization_roles` (the identity separation #12 requires), plus `idempotency_keys`.

## Consequences

- Japanese search is an open sub-decision for #16: Postgres extension if the chosen host supports one, otherwise an external index. The contract already allows for search-index delay.
- A managed Postgres provider must be chosen with ADR 0005, with region (latency, data residency), backups/PITR and extension support as criteria.

## Revisit when

- The chosen host can't provide Postgres with point-in-time recovery in or near Japan.
- Query complexity makes raw SQL a maintenance problem (adopt the query builder; this doesn't change the database).
