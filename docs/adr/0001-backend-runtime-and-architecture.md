# ADR 0001: Backend runtime and architecture

- **Status:** Proposed (2026-10-16)
- **Issue:** [#12](https://github.com/itkla/livingin.jp/issues/12)
- **Decision owner:** backend lead (unassigned); product owner approval
- **Affects:** every backend issue

## Context

One primary backend delivery stream builds six product modules plus shared capabilities (accounts, locality, media, search, messaging, sources, moderation). Hunter builds the frontend independently, so the backend must publish a machine-readable contract early and keep it stable. The domain is relational and concurrency-sensitive: atomic RSVP capacity and waitlists, reservations, revision-bound moderation, idempotent mutations. Inference is intended to use Cloudflare Workers AI ([#48](https://github.com/itkla/livingin.jp/issues/48)). #12 asks us not to assume an all-Cloudflare deployment just because of that.

## Options considered

| Option | For | Against |
|---|---|---|
| **A. TypeScript modular monolith on Node.js, Hono, zod** | One language for schemas, validation, contract generation and tests. Hono runs unchanged on Node, Bun, Deno and Cloudflare Workers, so hosting stays open. A large hiring/agent pool. Workers AI is reachable over its REST API from any runtime. | Node needs a host and a process model for background work (ADR 0005). TypeScript types are erased at runtime, so validation must be explicit (zod does this). |
| B. All-Cloudflare: Workers + D1 + Queues + R2 | Low operations overhead, colocated with Workers AI, generous free tiers. | D1 is SQLite: a single writer per database, no row locks, no PostGIS or Japanese full-text extensions, and size limits per database. Concurrency-sensitive flows (capacity, reservations) get harder. Ties every capability to one vendor at once. |
| C. Python (FastAPI or Django) monolith | Mature ORM/admin (Django), strong data tooling. | A second language from any TypeScript tooling Hunter may choose. Contract generation is good (FastAPI), but sharing schemas with fixtures and tests is less direct. No clear advantage for this domain. |
| D. Go service | Fast, simple deployment as one binary. | More boilerplate for validation and contract generation. A smaller pool for a single-stream team. |
| E. Microservices per module | Independent deploys. | Distributed transactions across modules (RSVP + messaging + moderation) for no current benefit, and operational load one stream cannot carry. |

## Decision

**A.** A single deployable TypeScript service:

- **Runtime:** Node.js 22 LTS (`engines.node >= 22.12`). TypeScript runs directly through `tsx`, and a bundling step can be added when deployment needs one.
- **HTTP:** Hono. The app is a plain `fetch` handler (`createApp()` in `backend/src/app.ts`) with the Node adapter in `server.ts`, so it can be moved to an edge runtime without rewriting routes.
- **Schemas:** zod 4 for request validation, response validation outside production, and OpenAPI generation (ADR 0003).
- **Modules:** `backend/src/modules/<module>.ts` own their schemas and operations. A module may import another module's *public* schemas (e.g. `ProfileSummary`) but not its internals. Database access will follow the same boundary: each module owns its tables.
- **Tests:** the Node built-in test runner (`node:test`) via `tsx --test`, so there is no test framework dependency.
- **Modes:** `API_MODE=mock` serves contract fixtures. `API_MODE=live` serves real implementations and answers 501 for contracted operations that haven't shipped.

Dependencies are pinned to exact versions that had been public for at least two weeks when chosen, and a lockfile is committed.

## Consequences

- Hunter can choose any frontend stack. Nothing here requires TypeScript on the frontend; the contract is OpenAPI plus JSON fixtures.
- Background work, scheduled jobs and the urgent notification lane need a process model on the chosen host (ADR 0005).
- A future edge deployment is possible because the app is runtime-neutral, but the database driver choice (ADR 0002) would need an edge-compatible path (e.g. a connection pooler/proxy).

## Revisit when

- Hosting (ADR 0005) or budget makes a Workers-only deployment materially cheaper *and* the concurrency-sensitive flows have a proven design on it.
- A module's load or isolation needs (e.g. live safety ingestion, [#41](https://github.com/itkla/livingin.jp/issues/41)) justify a separate worker process. That is a deployment split of the same codebase, not a new service.
