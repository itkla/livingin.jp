# ADR 0004: Authentication and sessions

- **Status:** Proposed for HTTP behaviour; **identity provider open**
- **Issues:** [#12](https://github.com/itkla/livingin.jp/issues/12), [#13](https://github.com/itkla/livingin.jp/issues/13), [#46](https://github.com/itkla/livingin.jp/issues/46)

## Context

The frontend needs a fixed authentication contract now, but choosing an identity provider depends on #46 (threat/privacy model, adult-account policy), budget and data-residency decisions that are not made yet. The contract and the provider can be separated: the browser only ever talks to the livingin.jp API, which owns the session.

## Decision (HTTP contract)

- **Browser sessions:** an opaque session ID in a first-party cookie `__Host-livingin_session` (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`). Sessions are stored server-side so they can be revoked (logout everywhere, account restriction, deletion).
- **CSRF:** unsafe methods authenticated by cookie must send `X-CSRF-Token` (a per-session synchronizer token returned by `GET /v1/session`), and the server checks `Origin` against an allowlist. SameSite alone is not relied on.
- **CORS:** credentialed requests only from configured origins (`CORS_ORIGINS`). There are no wildcard origins.
- **Non-browser clients:** `Authorization: Bearer <token>` with short-lived tokens. In mock mode, `Bearer mock:<persona>` stands in for both (it is never accepted in live mode).
- **Authorization model:** roles `member` and `operator` on the account; organization roles (`owner`, `editor`) as grants in `organization_roles`; resource checks in each module. Restricted accounts can read but not mutate (`account_restricted`). Hidden resources return 404 (anti-enumeration).
- **Identity separation:** account (private: email, preferences), public profile (display name, self-declared languages) and organization are distinct records with distinct ID prefixes. Public payloads only contain profile IDs.

## Open: identity provider

| Option | For | Against |
|---|---|---|
| Self-hosted: passwordless email (magic link or one-time code) plus passkeys, using a maintained library | No per-user fees. Data stays in our database. Session semantics fully under our control. No dependency on social login. | We own email deliverability (Japanese carriers' filtering), rate limiting, account recovery and security review. |
| Managed identity provider (e.g. Auth0, Clerk, Cognito, Supabase Auth, Firebase Auth) | Mature MFA/passkeys, recovery flows and abuse protection out of the box. | Per-MAU cost, data residency to check, export/deletion obligations shared with a vendor, and session bridging still needed for first-party cookies. |

**Criteria:** #46 threat model and age policy; deletion/export obligations; deliverability to Japanese email providers; cost at pilot scale; region; recovery without phone-number dependence (not every newcomer has a Japanese number).

**Leaning:** self-hosted passwordless + passkeys, because the API must own first-party sessions anyway and the main draw of managed providers (social login) is not a requirement. This is a recommendation for #13, not a decision.

## Consequences

- Hunter can implement sign-in UI against `GET /v1/session` and the cookie/CSRF rules now. The sign-in endpoints themselves (start/verify/logout) are added to the contract in #13 once the provider is chosen.
- Live mode resolves no actors until #13 ships, so authenticated operations answer 501 or 401 there.
