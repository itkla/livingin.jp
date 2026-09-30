# Decisions, dependencies and release risks

Planning baseline: **2026-09-30**. [Master roadmap](https://github.com/itkla/livingin.jp/issues/1). This is a decision register, not an implementation report or legal/compliance certification.

## Established direction versus open decisions

| Item | Current planning status | Owner / next action |
|---|---|---|
| Product mission | Settle in, live well, feel at home in Japan; newcomers and established residents both matter | Product direction established in #1 |
| Broad modules | Living, Community, Work, Local & Events, Marketplace, Weather & Safety | Scope maintained in module epics |
| Frontend ownership | Hunter owns all frontend, including administrative interfaces | Backend delivers contracts/fixtures; #12 |
| Architecture | Empty-repository baseline; runtime, database and hosting not selected | Backend lead role, unassigned; #12 |
| Inference | Cloudflare Workers AI is the intended provider; model/capability/cost selection unconfirmed | Backend/security review; #48 |
| Marketplace timing | Narrow local exchange intended for first release, subject to safety gate | Product/operator decision; #53 |
| Publication cadence | Optional 30-minute windows for completed approvals; default to be measured/decided | #38 and #48 |
| Kickoff and delivery capacity | Oct 5, 2026 is an illustrative scenario, not a confirmed start; velocity unknown | Rebaseline at #52 |
| Budget and operational staffing | Hosting, inference, moderation, editorial and review capacity not committed | #50 and #51 |
| Pilot geography/languages | Select based on resident needs, source quality and partner capacity; no assumed national depth | #51 |
| Age and participation policy | Adult-account pilot is a proposal, not an approved final policy | #46 |
| External data access | Source-specific rights and actual availability must be established | #43, #44, #45, #40 |
| Specialist calculators | Desired features, but no rule implementation or review is complete | #22, #23, #24 |
| Jobs operating model | Source-linked information/handoff is proposed; workflow-specific review outstanding | #30 |

Issue references throughout this document refer to this repository and are individually indexed in [#1](https://github.com/itkla/livingin.jp/issues/1). Role owners are requirements to fill, not people already assigned or commitments already obtained.

## P0 decision order

Begin architecture/contracts #12 alongside threat/privacy decisions #46. Review source rights #43, weather/provider feasibility #40, Work operating boundaries #30 and pilot/capacity #51 early enough to expose blockers before substantial implementation.

Decision-only feasibility work can happen before the implementation it informs. P0 weather research does not wait for completed P1 guide/locality APIs. P0 source-rights review does not wait for the source-registry service to be built. Record resulting constraints in the contracts and phase gates.

After these decisions, choose a limited P1 backlog, a measurable cost/service baseline and an operating owner. Reforecast the timeline using actual capacity rather than treating the original dates as fixed.

## Risk register

| Risk | Consequence | Mitigation and activation condition | Tracking |
|---|---|---|---|
| Scope expands faster than maintainable value | Many incomplete modules and no compelling resident experience | Deliver complete narrow slices; validate actual tasks; defer stretch work | #1, #51–#56 |
| Existing services remain easier to use | A broader feature list does not attract repeat use | Compare outcomes with residents' normal methods; treat external handoffs as success where useful | #51 |
| Local cold start | Empty events/groups/listings discourage participation | Genuine pilot organizers/sellers; national/online communities; tools useful without other users | #26–#29, #51 |
| AI moderation misses abuse or rejects legitimate content | Fraud, unsafe publication, unfair decisions and operator load | Text/image evaluation, policy thresholds, hold path, reports/appeals, sampling and accountable operators | #38, #46–#48 |
| Stale approval publishes an edited listing | Unreviewed content bypasses checks | Bind decisions to revision/assets; authoritative state transitions; replay/concurrency tests | #15, #37–#38 |
| Model/provider outage | Review backlog or inappropriate automatic approval | Fail closed, observable pending state, bounded retries, human fallback and kill switch | #38, #48, #50 |
| Municipal source is stale, irregular or changed | Incorrect event dates or local instructions | Source evidence, occurrence exceptions, parser health, conflict review and explicit unsupported coverage | #33, #36, #43–#44 |
| Source access does not permit intended reuse | Removal demands or an unusable integration | Document rights and transformations; no circumvention; disable unauthorized adapters | #43–#45 |
| Reddit approval unavailable | Richer ingestion cannot launch | Curated references only as permitted; core platform never depends on Reddit | #45 |
| Immigration/tax rules are wrong or change | Misleading high-stakes outputs | Official rule versions, explicit scenarios, qualified review, golden tests and independent disable controls | #19, #22–#24, #43 |
| Warning feed delayed or misinterpreted | Users misunderstand a developing hazard | Authoritative semantics, tested area mapping, fresh/stale states, independent urgent lane, drills and supplementary positioning | #40–#42, #50 |
| Private information leaks | Exposure of memberships, locations, calculations or applications | Least privilege, minimal collection, permission-aware search, redacted logs, deletion tests and incident plan | #13–#17, #21, #46–#50 |
| Jobs implementation crosses unreviewed operating boundaries | Obligations differ from the assumed job-information model | Review the actual workflow before activation; do not silently add placement or candidate-sharing functions | #30–#32 |
| Backend and frontend assumptions diverge | Rework and blocked integration | Early machine-readable contracts, representative fixtures, compatibility review and separate integration sign-off | #12, handoff document |
| Content/moderation cost exceeds capacity | Stale data, unresolved reports and unsustainable operations | Include human work in budgets, monitor queues, cap coverage and establish staffing before launch | #47, #50–#51 |

## Source and provider review starting points

These references were used for the planning baseline and must be checked again when implementing. They are not evidence that livingin.jp already has approval, a provider contract, legal clearance or production access.

- [Cloudflare Workers AI asynchronous Batch API](https://developers.cloudflare.com/workers-ai/features/batch-api/): evaluate actual model support, limits and completion behavior. A scheduled publication window is not an inference completion guarantee.
- [Reddit Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy): review approval, commercial-use and privacy requirements. Confirm storage, redistribution and downstream AI uses under the actual approved arrangement; no sensitive-profile inference or cross-platform identification.
- [JMA XML/Atom public distribution](https://xml.kishou.go.jp/xmlpull.html): consider availability/delay limitations and appropriate provider arrangements for the intended service. Do not assume public access implies an emergency-grade delivery guarantee.
- [MHLW job-information versus employment-placement guidance](https://www.mhlw.go.jp/stf/shoukaibosyuukubun.html): obtain workflow-specific review, including applicant information and automated functions. This plan does not determine legal classification.
- [Digital Agency municipal standard open-data formats](https://www.digital.go.jp/resources/open_data/municipal-standard-data-set-test): use as an input/schema starting point; verify individual municipalities' coverage, freshness and reuse rights.

NERV is a potential provider/partner to investigate, not a public API assumed available in this plan. Official-source identity and reuse permission are different questions. A copied flyer can contain third-party material with different rights from the surrounding municipal page.

## Independent activation decisions

Each release records an enabled/disabled feature manifest. A source or review dependency can block one feature without forcing unrelated completed features to wait.

The marketplace requires moderation/operator coverage before publication. Live Safety requires source, semantics, replay and outage evidence. Each HSP/PR/tax tool requires its own supported-scenario review. Work requires its operating-model decision. Reddit requires the actual permitted integration. Paperwork uploads require a separate privacy/evaluation/retention decision.

A hold decision is not completion of the feature. Phase gates may record that a feature remains disabled, but its implementation issue stays open or is explicitly re-scoped.

## Deliberately deferred or excluded from initial scope

No payment custody, escrow, shipping guarantee, unrestricted document vault, universal tax/immigration adviser, immigration-approval probability, emergency-grade warning promise, generated evacuation route, native app, general engagement feed or unrestricted stranger-message network.

Broader job placement, candidate pools, household sharing, public processing-time aggregates, more local utilities, product discovery and monetization infrastructure require separate evidence and scope decisions. They are not silently added to 1.0 because the broad platform could support them.

## Decision record template

For each resolved decision, record the date, responsible role/person, affected issues, alternatives, evidence/source versions, chosen scope, costs/operating implications, remaining uncertainty, activation/rollback condition and next review trigger.

Never mark an unresolved risk accepted merely because its feature has code. The release gates require backend evidence, Hunter's frontend integration and the necessary review/operating capacity separately.
