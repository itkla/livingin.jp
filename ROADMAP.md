# Delivery roadmap

Planning baseline: **2026-09-30**. Execution index: [roadmap #1](https://github.com/itkla/livingin.jp/issues/1).

## Purpose and ownership

Help residents settle in, live well and feel at home in Japan. Living and Community remain central; work, events, exchange and safety support the whole resident experience. Neither local discovery nor community contribution becomes the sole product identity.

**Hunter owns all frontend implementation.** This plan supplies backend/domain behavior, APIs, data, fixtures, tests and operations. It does not select a frontend framework or prescribe visual design. A backend-ready gate cannot declare the website publicly ready without Hunter's integration sign-off.

## Timeline assumptions

The following is an illustrative scenario, not a release commitment or a measured estimate. Example kickoff: **Monday, October 5, 2026**, Asia/Tokyo. Assume one primary backend delivery stream, Hunter working on frontend separately, and reviewers/operators available before high-risk activation. Staffing, budget and velocity have not been confirmed.

Re-estimate after P0 using actual scope, working contracts, provider access and capacity. If kickoff changes, shift the windows. If permission/review work is delayed, defer the affected module rather than removing its gate. P3 deliberately has a wider window spanning year-end holidays. Do not interpret parallel domain possibilities as permission to run unlimited agents.

| Phase | Example dates | Gate | Intended result |
|---|---|---|---|
| P0: foundations and contracts | Oct 5–18, 2026 | [#52](https://github.com/itkla/livingin.jp/issues/52) | ADRs, API fixtures, threat/privacy model, source feasibility and scoped pilot |
| P1: initial resident alpha | Oct 19–Nov 15, 2026 | [#53](https://github.com/itkla/livingin.jp/issues/53) | Living reference/tools/private tasks plus narrow day-one marketplace and preparedness resources |
| P2: belonging and local beta | Nov 16–Dec 13, 2026 | [#54](https://github.com/itkla/livingin.jp/issues/54) | Groups, conversation, requests, user events/RSVPs, local directory and municipal calendars |
| P3: established-resident beta | Dec 14, 2026–Jan 24, 2027 | [#55](https://github.com/itkla/livingin.jp/issues/55) | Work, validated weather information and independently reviewed specialist tools |
| P4: 1.0 readiness decision | Jan 25–Mar 7, 2027 | [#56](https://github.com/itkla/livingin.jp/issues/56) | Reliability, operating sustainability, measured expansion and optional controlled experiments |

These gates are GitHub issues with evidence checklists. They are not native GitHub milestone objects, scheduled automations or promised delivery dates.

## P0 — establish the foundations

Start [#12](https://github.com/itkla/livingin.jp/issues/12) architecture/contracts with [#46](https://github.com/itkla/livingin.jp/issues/46) threat/privacy decisions. In parallel, perform the decision-only portions of [#43](https://github.com/itkla/livingin.jp/issues/43) source rights, [#40](https://github.com/itkla/livingin.jp/issues/40) weather/provider feasibility, [#30](https://github.com/itkla/livingin.jp/issues/30) Work operating-model review and [#51](https://github.com/itkla/livingin.jp/issues/51) pilot planning.

P0 source feasibility does not require a completed P1 source-registry implementation. Likewise, P0 weather feasibility does not depend on completed locality or guide APIs; those are dependencies of the later implementation slice. External review requests may remain pending, but their affected features must be marked blocked from activation.

Decide runtime/database/deployment, source coverage, budget assumptions, approved initial marketplace categories and participant-age policy. Establish machine-readable contracts, fixtures, auth/resource permissions and common state/error conventions. Do not spend P0 implementing every product domain.

Exit evidence: approved ADRs, contract version, threat model, decision log, source/provider feasibility, operating owners and a re-estimated P1 backlog. Hunter receives fixtures without waiting for production backend completion.

## P1 — useful resident alpha and initial marketplace

Deliver shared core [#13–#17](https://github.com/itkla/livingin.jp/issues/13), source provenance [#43](https://github.com/itkla/livingin.jp/issues/43), Living [#18–#21](https://github.com/itkla/livingin.jp/issues/18), marketplace [#37–#39](https://github.com/itkla/livingin.jp/issues/37), moderation/AI [#47–#48](https://github.com/itkla/livingin.jp/issues/47), and deployment/operations [#49–#50](https://github.com/itkla/livingin.jp/issues/49). Range labels here identify a span of issues; the master index links each issue individually.

The smallest intended release contains a reviewed guide/almanac subset, practical apartment/form tools, private tasks and a local household marketplace. Initial Safety is reviewed preparedness and official resources, not a claim of validated live warning delivery.

The marketplace is planned for the first user-facing release. Its day-one scope is household sales/giveaways and pickup coordination—not payments, escrow, shipping guarantees or broad regulated categories. It needs working reports, blocks, appeals, operator coverage, safe media and revision-bound moderation. Optional 30-minute publication windows release completed approvals; inference delays never cause automatic approval.

Public release is conditional on the [P1 evidence gate](https://github.com/itkla/livingin.jp/issues/53) and Hunter's frontend readiness. Jobs, full events/community, specialist calculators, live alerts, Reddit and paperwork AI do not block this slice.

## P2 — connection and local participation

Deliver groups/discussion/requests [#26–#28](https://github.com/itkla/livingin.jp/issues/26), event model/RSVP [#33–#34](https://github.com/itkla/livingin.jp/issues/33), volunteer/language participation [#29](https://github.com/itkla/livingin.jp/issues/29), directory [#35](https://github.com/itkla/livingin.jp/issues/35) and pilot municipal connectors [#44](https://github.com/itkla/livingin.jp/issues/44).

A resident should be able to create a hike, others join under clear participation rules, a waitlist works under concurrency, and cancellations reach participants without a moderation-batch delay. Nationality/language/interest groups can operate nationally or online; location is not mandatory. Group privacy is separate from group discoverability.

Municipal/flea-market sources feed the same event records. Confirmed occurrences, recurring series, exceptions and external registration remain distinct. Small pilot coverage with reliable sources is preferable to unmaintained national breadth. Household utilities [#36](https://github.com/itkla/livingin.jp/issues/36) can be enabled only for supported districts.

Exit evidence: end-to-end participation tests, source-change/recurrence tests, privacy checks, genuine organizers/participants and operating coverage. A large number of empty groups is not success.

## P3 — work, weather and specialist tools

Work activates only after [#30](https://github.com/itkla/livingin.jp/issues/30) permits the actual operating model. [#31](https://github.com/itkla/livingin.jp/issues/31) delivers transparent job records and authorized discovery; [#32](https://github.com/itkla/livingin.jp/issues/32) adds preparation, comparison and private tracking. External apply clicks are not recorded as completed applications.

Live Safety follows [#40](https://github.com/itkla/livingin.jp/issues/40) source/meaning review, [#41](https://github.com/itkla/livingin.jp/issues/41) normalized ingestion/replay and [#42](https://github.com/itkla/livingin.jp/issues/42) urgent delivery/degradation. It needs real operator coverage and failure drills. Stale feeds must not look like no danger. It remains supplementary, not an emergency-grade replacement.

HSP [#22](https://github.com/itkla/livingin.jp/issues/22), PR readiness [#23](https://github.com/itkla/livingin.jp/issues/23) and scoped tax estimation [#24](https://github.com/itkla/livingin.jp/issues/24) have independent review, source-version and golden-test gates. No AI arithmetic or approval probability. These may be held independently; doing so must be recorded rather than silently counting them complete.

## P4 — readiness and controlled expansion

Audit enabled scope, operations, privacy, source maintenance, costs, recovery and actual resident outcomes. Publish a support/coverage/limitations manifest and a prioritized next backlog.

Paperwork [#25](https://github.com/itkla/livingin.jp/issues/25) is a controlled optional experiment with restricted document types and approved processing/retention. Reddit [#45](https://github.com/itkla/livingin.jp/issues/45) is permission-dependent and never a prerequisite for the core site. Expanding locales, languages, job workflows or document types requires operating ownership and renewed review.

A 1.0 decision does not mean all possible features ship. It means the enabled product is useful and maintainable, with explicit holds for unfinished work.

## Dependency and handoff discipline

| Shared capability | Owns | Consumers |
|---|---|---|
| Accounts/roles #13 | Identity and authorization | Every private or user-generated domain |
| Locality #14 | Jurisdiction and proximity model | Guides, events, listings, jobs, services, weather mapping |
| Media #15 | Quarantine/derivatives/access | Listings, events, editorial and later approved documents |
| Search/collections #16 | Permission-aware discovery | All public discoverable domain records |
| Communication #17 | Context threads/outbox/scheduling | Marketplace, community, events, reminders, safety |
| Sources #43 | Rights, revisions, attribution and review dependencies | Guides, calculators, directory, ingestion and safety |
| Events #33–#34 | Occurrences and participation | Local, groups, municipal calendars and volunteering |
| Moderation #47–#48 | Cases/enforcement and evaluated inference | Listings, groups, posts, events and jobs |

Do not introduce circular implementation dependencies by confusing shared contracts with completed domain implementations. Contracts can be agreed in parallel; activation needs the relevant implemented controls. Freeze shared interfaces per slice, supply fixtures, then integrate bounded changes.

## Definition of done

A feature needs its accepted behavior, permissions/error paths, tests, migrations, source/rule evidence when applicable, API/fixture handoff, operating documentation and appropriate feature flag. A PR references the issue. Local testing targets affected areas; CI provides the broader verification. Do not mark a phase or feature complete just because code or planning text exists.

Implementation and release acceptance are tracked in GitHub issues. Update this overview when scope/timing changes, but avoid maintaining contradictory status counters in multiple places.
