# Backend-to-frontend handoff

Planning baseline: **2026-09-30**. Parent: [Platform epic #2](https://github.com/itkla/livingin.jp/issues/2). Initial contract task: [#12](https://github.com/itkla/livingin.jp/issues/12).

This document specifies what future backend work must supply. It is **not** an implemented API, generated SDK, running mock server or frontend design specification.

## Ownership

**Hunter owns the frontend:** framework, application structure, pages, components, styling, navigation, interaction design, accessibility implementation, frontend build tooling and all administrative interfaces. These planning tickets must not scaffold or change those assets.

Backend work owns domain behavior, storage, authorization, APIs, calculation rules, integrations, background processing, fixtures, tests and operational evidence. It must give Hunter enough information to build independently without imposing a UI layout or requiring the complete backend to exist first.

Public release needs both backend evidence and Hunter's integration sign-off. A working endpoint does not establish a working user experience.

## Contract package required for each feature

| Deliverable | Minimum contents |
|---|---|
| Machine-readable interface | OpenAPI or an agreed equivalent selected in #12; documented request/response schemas and compatibility policy |
| Domain dictionary | IDs, relationships, enum meanings, required/optional/unknown fields, monetary/date units and provenance |
| State model | Allowed transitions, actor permissions, asynchronous states, revision/concurrency behavior and terminal states |
| Examples and fixtures | Success, empty, pending, forbidden, stale, unsupported and failure cases using synthetic data |
| Authorization matrix | Who can see/change each resource and what happens after membership, role or account changes |
| Error contract | Stable machine-readable codes, validation fields, retryability and safe human-readable explanation data |
| Integration notes | Authentication transport, pagination/filtering, upload lifecycle, caching restrictions and notifications |
| Verification evidence | Contract tests, relevant integration/security tests, migrations and required source/rule reviews |

Actual endpoint names, repository package paths and transport details are decisions for #12. Examples must not be mistaken for already implemented services.

## Shared conventions to agree first

Use stable identifiers and explicit relationships. Public profile, private account, organization, group membership, RSVP, attendance and job application are different records.

Document timestamps and calendar dates separately. Store/transport timestamps consistently, and retain the relevant timezone for schedules and recurrence; Japan-based dates use Asia/Tokyo unless a supported event explicitly says otherwise. A date-only deadline must not silently become a midnight timestamp with a different meaning.

Represent monetary amounts with defined units/currency and deterministic rounding rules. Preserve unknown versus zero, not-applicable versus missing, and reported versus verified information. Do not use a null field as a substitute for every possible state.

Specify pagination, supported filters, sort stability, localization, Japanese/English aliases, source attribution and search-index delay. Location filtering must distinguish applicable jurisdiction from nearby results. Users can browse without choosing a location.

Mutations need documented validation and concurrency behavior. Repeated requests or worker callbacks must not duplicate RSVPs, reservations, messages or publication. Moderation approvals reference an exact content revision and media set. Changes to a reviewed revision must not inherit approval accidentally.

## States the frontend must be able to represent

| State | Required backend distinction |
|---|---|
| Empty | A successful supported query has no matching records |
| Unsupported | The product does not maintain this jurisdiction, procedure or scenario |
| Pending | Work or review has not finished; no success is implied |
| Held | A human or policy decision is required before activation/publication |
| Stale | Data exists but no longer satisfies its freshness/review requirements |
| Unavailable | An upstream or service failure prevents a reliable current result |
| Forbidden/not found | Follow the agreed anti-enumeration and permission contract; do not leak private existence |
| Withdrawn/cancelled | A previously available record is explicitly no longer active |

An unavailable weather feed is not an empty list meaning no warnings. An unsupported calculator scenario is not an estimate of zero. A saved external event is not a confirmed reservation.

## Domain-specific fixture requirements

**Living:** national/local/provider applicability; reviewed/stale translations; conditional checklist steps; explicit assumptions; user-entered versus rule-derived deadlines; supported/unsupported calculator output; contribution-by-contribution explanations and source/rule versions. Private calculations are never included in public profile payloads.

**Community:** public/private discoverability independently of membership visibility; open/approval membership; chapters; removed members; blocked users; ordinary discussion; requests converted into an event only with explicit participation consent. Sensitive memberships must not leak through counts, previews or search.

**Work:** actual employer versus agency; known/unknown compensation components; employer-reported language/immigration assistance; stale vacancies; external apply handoff versus confirmed submission; private application stages. No payload should imply immigration permission or an employer-quality guarantee.

**Local & Events:** series versus confirmed occurrence; venue versus meeting point; online/hybrid events; recurrence exceptions; cancelled/rescheduled events; open/approved RSVPs; full capacity and waitlist offers; external registration routes; organizer-provided outdoor requirements.

**Marketplace:** draft/submitted/screening/approved/held/rejected publication states, separately from inventory availability; changed revision during review; bundle with partially sold items; approximate public pickup area; private coordination; model outage. AI-reviewed is not seller-verified.

**Weather & Safety:** issuer/product, affected areas, issue/validity/retrieval times, revision/cancellation/test flags, current source health and explicit coverage limitations. Guidance must retain authoritative meaning. No unsupported safe-route or shelter-open status.

## Privacy and security handoff

Authentication transport, CSRF/CORS requirements, session handling and cache restrictions must be documented before integration. Do not dictate a frontend framework as a shortcut around these requirements.

Public caches must not contain private tasks, calculations, applications, group membership or messages. Quarantined/private media needs explicit authorized access, not publicly guessable storage links. Retention/export/deletion must include relevant derived data and follow the approved policy.

Location and personalization are optional. Nationality/background affiliations are self-selected, not inferred. A user's private inputs must not become analytics, advertising or public-profile attributes.

Notification payloads must remain safe after access changes. Sensitive group names, personal documents and exact pickup details should not appear in default previews. Provider acceptance is not proof a person received or read a message.

## Change and release process

Agree a contract/fixture baseline before parallel work. Every feature PR identifies the issue, contract changes, migration impact, permissions, tests and integration examples. Breaking changes require an explicit migration/compatibility plan rather than silently changing fields Hunter already uses.

Use synthetic fixtures so frontend development can proceed without production accounts or personal data. Test backend behavior against those contracts; Hunter separately validates rendering, interaction, accessibility and integration.

A release handoff includes the enabled-feature manifest, known limitations, supported coverage, unresolved dependencies, operational owner and rollback/disable behavior. Features awaiting legal/source/reviewer/provider approval stay disabled even when the frontend and endpoint are otherwise complete.

See [release gates #52–#56](https://github.com/itkla/livingin.jp/issues/1) for phase-specific evidence. Planning completion is not implementation completion.
