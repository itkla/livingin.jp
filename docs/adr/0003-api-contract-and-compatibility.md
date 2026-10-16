# ADR 0003: API contract, fixtures and compatibility

- **Status:** Proposed (2026-10-16)
- **Issues:** [#12](https://github.com/itkla/livingin.jp/issues/12); handoff requirements in [FRONTEND_HANDOFF.md](../FRONTEND_HANDOFF.md)

## Context

Hunter owns the frontend and must be able to build against the backend before it exists, without being told which framework to use. FRONTEND_HANDOFF.md requires a machine-readable interface, a domain dictionary, state models, fixtures for success/empty/pending/forbidden/stale/unsupported/failure, an error contract and compatibility discipline.

## Options considered

| Option | For | Against |
|---|---|---|
| **OpenAPI 3.1 generated from zod schemas** | One source of truth: the same schema validates requests, checks live responses and produces documentation. Any client stack can consume OpenAPI. JSON Schema 2020-12 compatible. | Generated documents need a drift check, and generator quirks occasionally need workarounds. |
| Hand-written OpenAPI | Full control over the document. | Drifts from the implementation. Validation is written twice. |
| GraphQL | Flexible client queries. | Per-field authorization and anti-enumeration get harder. HTTP caching and idempotency semantics need reinventing. Imposes tooling on the frontend. |
| tRPC or shared TypeScript types | Excellent DX in a TypeScript monorepo. | Couples the frontend to TypeScript and to this repository's internals, which contradicts Hunter's ownership. |
| Protobuf / gRPC-web | Strong typing and codegen. | Unusual for a browser-first product. Debugging and fixtures are harder. |

## Decision

1. **Each operation is declared once** with `defineOperation()` (`backend/src/contract/operation.ts`): method, path, module, feature gate, auth, roles, idempotency, If-Match, request schemas and success responses. Standard error responses are derived from those flags, so every documented error is one the pipeline can actually produce.
2. **`backend/contracts/openapi.json` is generated** (`npm run contract:generate`) and committed, so consumers can read or diff it without running anything. Schemas are converted with zod's native JSON Schema generator (draft 2020-12, the OpenAPI 3.1 dialect); `.openapi('Name')` is a thin wrapper over zod's `.meta({ id })` that publishes a named component. We tried `@asteasolutions/zod-to-openapi` first and dropped it: in the version evaluated it emitted nullable references to named components as non-nullable (or as an `allOf` that rejects `null`) and lost descriptions on first use, which would have produced wrong generated clients.
3. **Fixtures are JSON** in `backend/fixtures/<module>/<operationId>.json`, with named scenarios. Tests require a `default` scenario for every operation, an `empty` scenario for every list, each operation's declared `requiredScenarios`, schema-valid bodies, documented statuses and error codes, and synthetic data only (reserved example domains).
4. **The mock server** (`API_MODE=mock`) serves the fixtures through the same pipeline as the live service. Authentication, validation, idempotency and If-Match behave for real, so integration code written against the mock exercises the real HTTP rules. Scenarios are chosen with `Prefer: example=<name>`.
5. **Compatibility is enforced in CI** (`npm run contract:check`): no drift from the schemas, and no breaking change against the base branch without a contract version bump. The rules are in [CONVENTIONS.md](../api/CONVENTIONS.md#versioning-and-compatibility) and `src/contract/compat.ts`.
6. **Live responses are validated against the contract** in non-production environments, so a handler can't drift from the documented schema unnoticed.
7. **Conventions** (IDs, time, money, unknown values, state vocabulary, errors, idempotency, concurrency, authentication) are specified in [CONVENTIONS.md](../api/CONVENTIONS.md).

The baseline covers OPERATION_COUNT operations across system, identity, sources, Living, Community, Work, Events, Marketplace and Safety. It is a representative baseline per module, not a complete API. Each module's implementation issue extends its contract, and changes go through the same checks.

## Consequences

- Hunter can start integrating now against `npm run start:mock`, and optionally generate a typed client from the OpenAPI document with a tool of their choosing.
- Contract changes are explicit in review: the generated JSON diff shows exactly what changed for consumers.
- Response enums are open by policy (clients need fallbacks). This keeps state machines extensible, but it must be respected on the frontend.

## Revisit when

- Generator limitations block a needed schema shape.
- Hunter's integration finds the fixture format or mock behaviour insufficient. This is a two-way contract, and Hunter's feedback outranks this ADR.
