# livingin.jp backend

API contract, contract fixtures, mock server and service skeleton for livingin.jp ([#12](https://github.com/itkla/livingin.jp/issues/12)). This directory contains no frontend code; Hunter owns the frontend.

**State at P0:** the contract and mock server cover every module. The live service implements health and the feature manifest only; every other operation answers 501 `not_implemented` in live mode until its issue ships. Decisions are recorded in [docs/adr](../docs/adr/README.md), and HTTP conventions in [docs/api/CONVENTIONS.md](../docs/api/CONVENTIONS.md).

## Quick start

Requires Node.js 22.12 or later.

```sh
cd backend
npm ci
npm run start:mock          # mock server on http://localhost:8787 (no database needed)
```

```sh
curl localhost:8787/v1/health
curl localhost:8787/openapi.json
curl -H 'Authorization: Bearer mock:member' localhost:8787/v1/session
curl -H 'Authorization: Bearer mock:member' -H 'Prefer: example=held' \
  localhost:8787/v1/me/listings/lst_01JA0000000000000000000001
```

Every operation's scenarios are listed in its fixture file, `fixtures/<module>/<operationId>.json`. Mock personas, scenario selection and what the mock enforces are covered in [CONVENTIONS.md § Mock server](../docs/api/CONVENTIONS.md#mock-server).

### Live mode (database-backed)

```sh
cp .env.example .env        # set API_MODE=live and DATABASE_URL; npm scripts load .env if present
npm run db:migrate
npm start
```

## Scripts

| Command | What it does |
|---|---|
| `npm run start:mock` | Serve fixtures for every contracted operation |
| `npm start` / `npm run dev` | Start in the mode set by `API_MODE` (default `mock`); `dev` reloads on change |
| `npm test` | Contract/fixture conformance, HTTP behaviour, compatibility checker, migrations (PGlite; also real Postgres when `TEST_DATABASE_URL` is set) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run contract:generate` | Regenerate `contracts/openapi.json` from the schemas (commit the result) |
| `npm run contract:check -- --base <file>` | Fail on drift, or on breaking changes against `<file>` without a version bump |
| `npm run db:migrate` / `db:rollback [-- N]` / `db:status` | Apply, revert N (default 1) or list migrations (`DATABASE_URL`) |
| `npm run check` | typecheck + test + contract check, the same gates CI runs |

## Layout

```
contracts/openapi.json     generated contract (committed; do not edit)
fixtures/<module>/*.json   named example scenarios per operation (synthetic data)
src/contract/              shared primitives (IDs, time, money, knowable, coverage…), errors,
                           operation definition, OpenAPI generation, compatibility checker
src/modules/<module>.ts    schemas and operations for one module
src/http/                  request pipeline (auth, validation, If-Match, idempotency), fixtures, personas
src/db/                    database client (pg / PGlite), migration runner, SQL migrations
src/live.ts                live-mode implementations (system endpoints only at P0)
src/app.ts, server.ts      Hono app factory and Node entry point
test/                      node:test suites
```

## Adding or changing an operation

1. Define or extend the schemas and the operation with `defineOperation()` in `src/modules/<module>.ts`. Reuse the primitives in `src/contract/common.ts`: never use `null` for unknown, keep dates as `CalendarDate`, use integer `Money`.
2. Add or update `fixtures/<module>/<operationId>.json`: a `default` scenario, an `empty` scenario for lists, every name in `requiredScenarios`, and the error states the handoff doc asks for.
3. `npm run contract:generate`, then `npm run check`.
4. If `contract:check` reports a breaking change, either make the change additive or bump `CONTRACT_VERSION` (`src/contract/version.ts`) and describe the migration for frontend consumers in the PR.
5. Live implementation: add a handler keyed by `operationId` in `src/live.ts` (or a module file it imports). Its responses are validated against the contract outside production.

## Database

PostgreSQL 16+. Migrations are reversible SQL pairs in `src/db/migrations/` (`NNNN_name.up.sql` / `.down.sql`). Applied migrations are checksummed; never edit one that has been applied, add a new one instead. See [ADR 0002](../docs/adr/0002-database-and-migrations.md).
