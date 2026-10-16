# API conventions

Status: **proposed contract baseline v0.1.0** for [#12](https://github.com/itkla/livingin.jp/issues/12). These conventions apply to every operation in [`backend/contracts/openapi.json`](../../backend/contracts/openapi.json). The schemas in `backend/src/contract/` and `backend/src/modules/` are the source of truth, and the OpenAPI document is generated from them. Where this page and the generated document disagree, the generated document wins and this page has a bug.

This page describes the HTTP contract only. It does not prescribe frontend structure, framework or design.

## Versioning and compatibility

- The URL carries the major API version: `/v1/...`.
- `info.version` in the OpenAPI document is the **contract version** (semver). Below 1.0.0 a breaking change bumps the minor version; from 1.0.0 it bumps the major version.
- `npm run contract:check` (run in CI) fails when the generated document differs from the committed one, or when it contains a breaking change compared with the base branch without that version bump.
- **Breaking:** removing an operation, a success status, a response property, a request enum value or a request union variant; making a response property optional; adding a required request property or parameter; tightening request constraints; widening the types a response can return; no longer guaranteeing a response header.
- **Notice (allowed in a minor version):** new response enum values and new union variants. **Clients must handle unknown enum values and unknown `state`/`status`/`kind` variants with a generic fallback.** The checker lists every such change so it is announced, not silent.
- **Additive (not reported):** new operations, new optional request fields, new response fields, new error statuses. Clients must ignore unknown response fields.
- A breaking change ships with a migration note for frontend consumers in the PR that makes it.

## Identifiers

- `<prefix>_<ULID>`, e.g. `lst_01JB3K6Z9X0V8T7R6Q5P4N3M2K`. The prefix names the record type (`acct_` account, `prof_` public profile, `org_` organization, `lst_` listing; the full list is in `backend/src/lib/ids.ts`).
- Treat IDs as **opaque strings**. Don't parse the timestamp in a ULID. The published pattern may be relaxed later, never tightened.
- Different records have different IDs even when they relate to the same person: an account (`acct_`) is never interchangeable with a public profile (`prof_`). Public payloads only contain profile IDs.

## Time and dates

| Concept | Representation | Example |
|---|---|---|
| Instant | RFC 3339, UTC, `Z` suffix (`Instant`) | `2026-11-03T01:30:00Z` |
| Calendar date | `YYYY-MM-DD` (`CalendarDate`), no time of day | `2026-12-15` |
| Time zone | IANA name (`TimeZone`) | `Asia/Tokyo` |

- A **date-only deadline stays a date**. It is never sent as a midnight timestamp. Interpret it in the accompanying `time_zone`, or Asia/Tokyo when none is given.
- Schedules (events, recurrence) carry their own `time_zone`. Recurrence uses RFC 5545 RRULE strings plus a human-readable summary.
- Display conversion to the viewer's zone is a frontend decision. The API never pre-formats dates.

## Money

`{ "amount": 3000, "currency": "JPY" }`. `amount` is an integer in the currency's minor unit (JPY has none, so this is yen). Floats are never used. Ranges are `{ min, max }` of `Money`. Rounding rules for calculated amounts are stated by the calculator's rule version.

## Known, unknown and not applicable

`null` is never used to mean "unknown". Fields that may be unknown use the `knowable` wrapper:

```json
{ "status": "known", "value": { "amount": 210000, "currency": "JPY" }, "basis": "reported" }
{ "status": "unknown" }
{ "status": "not_applicable" }
```

`basis` says who asserted a known value: `reported` (the submitter, such as an employer, seller or organizer, and not checked), `verified` (livingin.jp checked it against evidence) or `source_derived` (taken from the cited `source_id`). An unknown salary is not ¥0, and an unknown fee is not "free". `null` appears only where the schema documents it, with one meaning, such as "no cover photo".

## Localization

- Send `Accept-Language` (`en`, `ja`). Content comes back in the best available language as `LocalizedText`, which states its `translation` status: `original`, `reviewed_translation`, `machine_translation` or `stale_translation` (the original changed after the translation was made).
- Japanese terms use `Term`: `{ ja, reading, romaji?, en }`, e.g. 在留カード / ざいりゅうカード / residence card.
- Error `detail` text follows `Accept-Language` when a translation exists. Branch on `code`, never on text.

## Pagination and filtering

- Lists return `{ "items": [...], "next_cursor": "..." | null }`. Pass `cursor` back to get the next page; `limit` is 1–100 (default 20). Cursors are opaque and may expire. On `validation_failed` for a cursor, restart from the first page.
- Sort order is stable for a given query. Filters are plain query parameters documented per operation.
- New records can take a few seconds to appear in search results. A just-created record is always readable directly by its ID.
- **Location is optional everywhere.** Browsing without a locality is supported. Locality filters take administrative codes: `JP`, a prefecture (`JP-13`) or a municipality (`JP-13-112`). *Jurisdiction* (which rules apply to you) is distinct from *proximity* (what is nearby). An operation says which one it uses.

## The state vocabulary

The backend always tells these states apart. Each has its own representation and is never inferred from an empty or missing field:

| State | How the API expresses it |
|---|---|
| Empty | 200 with `items: []` and `coverage.status: "supported"` |
| Unsupported | `coverage.status: "unsupported"` (lists), or `outcome: "unsupported"` (calculators), with `reason_code` and `explanation`. Never an empty or zero result. |
| Pending | A domain state such as `publication.state: "screening"`, `rsvp.state: "pending_approval"` or `membership.state: "pending"`. No success is implied. |
| Held | `publication.state: "held"` with a reason, or a feature `state: "held"` in `/v1/meta` |
| Stale | `freshness.state: "stale"`, `review.status: "review_overdue"` or `translation.status: "stale_translation"` |
| Unavailable | An explicit `unavailable` variant (e.g. a safety `feed.state`) with the last successful retrieval. It is **never** an empty list meaning "nothing to report". |
| Forbidden / not found | 403 `forbidden` only when the caller may know the resource exists. Otherwise 404 `not_found` (anti-enumeration). |
| Withdrawn / cancelled | An explicit status (`cancelled`, `withdrawn`, `closed`, `superseded_by`) on a record that still resolves |

## Errors

Every error is `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)):

```json
{
  "type": "urn:livingin:problem:validation_failed",
  "title": "Validation failed",
  "status": 400,
  "code": "validation_failed",
  "request_id": "6f1c…",
  "retryable": false,
  "fields": [{ "pointer": "/body/title", "code": "too_small", "message": "…" }]
}
```

- `code` is stable and machine-readable. Codes are only ever added, never renamed or removed. The full list with HTTP statuses is `ERROR_CODES` in `backend/src/contract/problem.ts`, and each operation documents the subset it can return.
- `fields[].pointer` is a JSON Pointer into the request: `/body/...`, `/query/...`, `/params/...` or `/headers/...`.
- `retryable` says whether repeating the same request may succeed. `Retry-After` / `retry_after_seconds` accompany 429 and 503.
- Request bodies are strict: unknown fields are rejected (`unrecognized_keys`) rather than silently ignored.
- Every response, success or error, carries `X-Request-Id`. A client may send its own (8–128 characters of `[A-Za-z0-9._:-]`) and the server echoes it.
- In `live` mode, operations whose implementation hasn't shipped answer 501 `not_implemented`.

## Authentication

Proposed in [ADR 0004](../adr/0004-authentication-and-sessions.md). The identity provider is not yet selected; the HTTP behaviour below is.

- **Browsers:** a first-party session cookie `__Host-livingin_session` (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`). Send requests with credentials. Unsafe methods (POST/PUT/PATCH/DELETE) must also send `X-CSRF-Token` with the `csrf_token` from `GET /v1/session`; the server additionally checks `Origin` against an allowlist.
- **Non-browser clients:** `Authorization: Bearer <token>`.
- `GET /v1/session` always answers 200: `{ "state": "anonymous" }` or the authenticated session.
- `auth: required` operations answer 401 `authentication_required` without credentials. A restricted account (moderation enforcement) can read but gets 403 `account_restricted` on changes.
- Roles: `member`, `operator`. Organization access is a role grant on the organization, not a different kind of account.

## Authorization and privacy

- Private resources live under `/v1/me/...` and are only ever returned to their owner.
- When the caller may not know a resource exists (private listing, unlisted group, someone else's task, a blocked member), the answer is 404 `not_found`, identical to a truly missing ID.
- Public payloads never include account IDs, email addresses, private calculations, applications, exact pickup details or sensitive group memberships. Sensitive group names and exact meeting points are excluded from notification previews.
- Responses default to `Cache-Control: no-store`. Operations that become publicly cacheable will say so explicitly.

## Idempotency

POST operations that create or change state require an `Idempotency-Key` header (1–255 characters; use a UUID per user action and reuse it on retries):

- A retry with the same key and the same body replays the original status, headers and body, with `Idempotent-Replayed: true`.
- The same key with a different body: 422 `idempotency_key_reused`.
- The first request still in progress: 409 `idempotency_request_in_progress` (retryable; see `Retry-After`).
- A missing key: 400 `idempotency_key_required`.
- Keys are scoped to the caller and route, and kept for 24 hours. 5xx responses are not stored, so a retry re-executes.

PUT and DELETE are naturally idempotent. POSTs that only compute something (`pure`, e.g. calculators) create nothing and need no key.

## Optimistic concurrency

Revisioned resources (listings, tasks, applications, accounts) carry an integer `revision`, also served as `ETag: "<revision>"`. PATCH (and other operations marked `If-Match`) require `If-Match: "<revision>"`:

- Missing: 428 `precondition_required`.
- Stale: 412 `revision_conflict` with `current_revision` and the current `ETag`. Reload, reapply the user's edit and retry. Changes are never merged silently.

Moderation decisions name the exact revision they apply to. Editing an approved listing creates a new revision that is not public until it is approved; approval never carries over to edited content.

## Feature activation

`GET /v1/meta` returns the enabled-feature manifest: every feature key with `state` (`enabled`, `disabled` or `held`), a `reason` and a `coverage_note`. Hide features that are not `enabled`. Calling a disabled feature's operation answers 403 `feature_disabled`. A feature can be held on a legal, source, review or operating decision even when its code and frontend are complete.

## Mock server

`npm run start:mock` (from `backend/`) serves every operation from the fixtures in `backend/fixtures/<module>/<operationId>.json`. No database or credentials are needed.

- **Choose a scenario** with `Prefer: example=<scenario>`, e.g. `Prefer: example=held`. Without it you get `default`. An unknown name answers 400 with the available names.
- **Generic scenarios** on every operation: `feature_disabled`, `rate_limited`, `internal_error`, `service_unavailable`.
- **Authenticate as a persona** with `Authorization: Bearer mock:<persona>`: `member` (Aiko), `member_b` (Daniel), `organizer` (Mai), `operator` (Kenta) or `restricted` (Ren, who can read but not change anything). Fixture content doesn't change with the persona; use scenarios for viewer-specific states.
- Real behaviour that the mock does enforce: authentication, request validation (including strict bodies), Idempotency-Key replay and reuse detection, and If-Match (each fixture file names its `current_etag`).
- Responses are static examples. A POST doesn't persist anything, and the response doesn't echo your input.
- Browser origins `http://localhost:*` and `http://127.0.0.1:*` are allowed by CORS in mock mode. Add others with `CORS_ORIGINS`.

Fixtures are synthetic: people are fictional personas, organizations are labelled "(example)", and every URL and email uses a reserved example domain. Tests enforce this.
