# ADR 0005: Hosting, object storage and background jobs

- **Status:** Open. Criteria and a working direction are recorded; the choice needs budget and provider inputs.
- **Issues:** [#12](https://github.com/itkla/livingin.jp/issues/12), [#15](https://github.com/itkla/livingin.jp/issues/15), [#17](https://github.com/itkla/livingin.jp/issues/17), [#42](https://github.com/itkla/livingin.jp/issues/42), [#48](https://github.com/itkla/livingin.jp/issues/48)–[#51](https://github.com/itkla/livingin.jp/issues/51)

## Why this is open

#12 asks for measurable latency and cost targets "with actual deployment inputs". Those inputs don't exist yet: budget, expected pilot traffic, operating staff, data-residency requirements from #46. Choosing a vendor now would lock in unsupported assumptions, which the roadmap explicitly warns against.

## Requirements any choice must meet

- **Region:** compute and Postgres in or near Japan (latency for residents; possible data-residency expectations).
- **Postgres** with point-in-time recovery, tested restores ([#50](https://github.com/itkla/livingin.jp/issues/50)) and, ideally, a Japanese full-text extension (ADR 0002).
- **Object storage:** S3-compatible, private by default. Uploads land in quarantine, and only processed derivatives are served, through time-limited signed URLs ([#15](https://github.com/itkla/livingin.jp/issues/15)). No publicly guessable links to originals.
- **Background work with separate lanes:** an *urgent* lane (safety notices, event cancellations, RSVP waitlist offers) that never waits behind a *batch* lane (moderation inference, publication windows, digests). This separation is a product requirement (FEATURE_PLAN: "alerts and event cancellations never wait for marketplace batches").
- **Scheduled jobs:** source freshness checks, idempotency-key expiry, listing expiry, publication windows.
- **Workers AI** reachable over its REST API from the chosen host ([#48](https://github.com/itkla/livingin.jp/issues/48)). Inference outages fail closed: content stays pending and is never auto-approved.
- **Observability:** structured logs with request IDs (already emitted), metrics, alerting on feed staleness and queue age.

## Working direction (not a decision)

- **Compute:** a container running the Node service plus a separate worker process from the same codebase, on a managed platform with a Tokyo region.
- **Jobs:** start with a Postgres-backed queue (outbox table, `FOR UPDATE SKIP LOCKED`, one table or priority per lane) to avoid a second stateful system at pilot scale. Move the urgent lane to a dedicated queue if measured latency requires it.
- **Storage:** Cloudflare R2 is a strong candidate (no egress fees, adjacent to Workers AI), but any S3-compatible private bucket satisfies the contract.

## To decide at the P0 gate ([#52](https://github.com/itkla/livingin.jp/issues/52))

Monthly budget ceiling; host and region; Postgres provider; storage provider; latency SLO for the urgent lane; restore-time objective; who is on call. Record the decision as a new ADR that supersedes this one.
