# Architecture decision records

Each ADR records one decision: context, options considered, the choice, consequences and what would make us revisit it. The fields follow the decision record template in [DECISIONS_AND_RISKS.md](../DECISIONS_AND_RISKS.md#decision-record-template).

**Status meanings.** *Proposed*: written and implemented as the working baseline, but not yet approved by the backend lead and product owner. *Accepted*: approved. *Open*: options and criteria are recorded, but the information needed to choose (budget, provider access, review) is missing. *Superseded*: replaced by a later ADR, which it links.

Proposed decisions are reversible by design. Nothing here commits a vendor contract, budget or release date.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-backend-runtime-and-architecture.md) | TypeScript modular monolith on Node.js with Hono, portable to edge runtimes | Proposed |
| [0002](0002-database-and-migrations.md) | PostgreSQL 16+, plain reversible SQL migrations, PGlite for tests | Proposed |
| [0003](0003-api-contract-and-compatibility.md) | OpenAPI 3.1 generated from zod schemas, fixtures and a mock server, enforced compatibility | Proposed |
| [0004](0004-authentication-and-sessions.md) | First-party cookie sessions with CSRF tokens; identity provider still to choose | Proposed (provider open) |
| [0005](0005-hosting-storage-and-jobs.md) | Hosting region, object storage and background job execution | Open |

Changing a decision means writing a new ADR that supersedes the old one, not editing history.
