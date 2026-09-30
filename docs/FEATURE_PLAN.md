# Module and feature plan

Baseline: 2026-09-30. [Master issue index](https://github.com/itkla/livingin.jp/issues/1). All features below are planned, not implemented. See [ROADMAP](../ROADMAP.md) for dates/gates and [FRONTEND_HANDOFF](FRONTEND_HANDOFF.md) for the ownership boundary.

## Product lens

**Settle in:** understand Japan and get established. **Live well:** improve everyday decisions and handle life more easily. **Feel at home:** connect through background, language, interests and shared experiences. These guide priorities; they are not mandated navigation tabs.

The six broad modules are Living, Community, Work, Local & Events, Marketplace, and Weather & Safety. Guides, tools, resources, maps, calendars and checklists are formats within them. My Life is a private workspace; source ingestion, search and moderation are shared capabilities.

The competitive proposition is a hypothesis to test: understandable information, personal applicability, useful actions and relevant people reduce effort. Do not assume a smaller marketplace or a new forum beats incumbents. External application/booking/discussion handoffs can be successful outcomes. Translation alone is not enough.

## Living — settle and live better

Epic: [#3](https://github.com/itkla/livingin.jp/issues/3).

| Feature | First scope | Phase / issue |
|---|---|---|
| Maintained guides/procedures | Applicability, documents, conditional steps, terminology, sources/reviews and related actions | P1 [#18](https://github.com/itkla/livingin.jp/issues/18) |
| Residence-status almanac | Reviewed subset; separate visa/status/period/procedure; sourced fees/requirements/processing evidence | P1 [#19](https://github.com/itkla/livingin.jp/issues/19) |
| Practical tools | Move-in/recurring cost and apartment comparison; form/date/name helpers and reviewed message templates | P1 [#20](https://github.com/itkla/livingin.jp/issues/20) |
| My Life | Private tasks, manual deadlines, getting-established/moving journeys, application stages and calendar export | P1 [#21](https://github.com/itkla/livingin.jp/issues/21) |
| HSP points | Deterministic supported categories/dates, explained contributions and evidence requirements | P3 gated [#22](https://github.com/itkla/livingin.jp/issues/22) |
| PR readiness | Supported pathways, unknown conditions and preparation—not an approval probability | P3 gated [#23](https://github.com/itkla/livingin.jp/issues/23) |
| Tax estimates | Defined salaried scenario, tax-year versions, explicit included/excluded components | P3 gated [#24](https://github.com/itkla/livingin.jp/issues/24) |
| Paperwork assistant | Evaluated notice types, evidence-linked extraction, redaction/retention and confirmed reminders | P4 optional [#25](https://github.com/itkla/livingin.jp/issues/25) |

Long-term coverage: arrival; housing/moving; immigration; local administration; banking/payments; tax/pension/insurance; healthcare navigation; family/education; transport; household tasks; language; long-term planning; leaving Japan. Coverage expands as maintained slices, not bulk filler.

Later candidates: provider-maintained phone/bank comparisons, richer household sharing, aggregate application timelines with privacy/sample-bias review, product-name/local-availability lookup, neighborhood comparisons. These are not automatically part of 1.0.

## Community — connection and belonging

Epic: [#4](https://github.com/itkla/livingin.jp/issues/4).

| Feature | First scope | Issue |
|---|---|---|
| Groups and optional chapters | Self-selected language/background/interests/life circumstances/location; national and online groups | P2 [#26](https://github.com/itkla/livingin.jp/issues/26) |
| Conversation and introductions | Normal group discussion, questions, pinned resources and clearly labeled resident experience | P2 [#27](https://github.com/itkla/livingin.jp/issues/27) |
| Requests | Wanted items, recommendations, activity interest/availability, linked responses and resolutions | P2 [#28](https://github.com/itkla/livingin.jp/issues/28) |
| Volunteer/language participation | Real organizer requirements, shifts, orientation, language expectations and registration handoffs | P2 [#29](https://github.com/itkla/livingin.jp/issues/29) |

People choose communities; the system does not infer sensitive traits or populate groups from Reddit profiles. Membership visibility differs from discoverability. Japanese participants are welcome. Ordinary conversation, friendship and shared cultural familiarity need not produce a completed task. Volunteering is one optional use, not the platform's defining goal.

Shared events power recurring activities. Later opt-in attendee introductions or richer group coordination must preserve consent and privacy. Avoid a general engagement feed, unrestricted stranger messaging and a universal public reputation score.

## Work — suitable opportunities and informed decisions

Epic: [#5](https://github.com/itkla/livingin.jp/issues/5).

| Feature | First scope | Issue |
|---|---|---|
| Operating-model review | Initial information/handoff model, applicant-data boundaries and workflow-specific legal review | P0 [#30](https://github.com/itkla/livingin.jp/issues/30) |
| Job discovery | Employer submissions/authorized feeds with transparent conditions, freshness and external apply route | P3 [#31](https://github.com/itkla/livingin.jp/issues/31) |
| Career workspace | Preparation resources/templates, offer comparison and private application stages/reminders | P3 [#32](https://github.com/itkla/livingin.jp/issues/32) |

Expose actual employer and direct/agency arrangement, salary components, contract conditions, language expectations, location/schedule and employer-reported immigration assistance. Unknown fields remain unknown. No job-quality verdict, immigration guarantee, hidden candidate sharing or assumption that every resident works in IT/teaching.

Later employer-facing applicant workflows, placement, candidate pools and sophisticated matching need separate scope/review, not merely another endpoint.

## Local & Events — useful nearby resources and activities

Epic: [#6](https://github.com/itkla/livingin.jp/issues/6).

| Feature | First scope | Issue |
|---|---|---|
| Canonical event model | User/group/organization/imported events, series/occurrences, exceptions, cancellation and provenance | P2 [#33](https://github.com/itkla/livingin.jp/issues/33) |
| Participation | Open/approved RSVPs, atomic capacity, waitlists, co-hosts, participant threads and calendar export | P2 [#34](https://github.com/itkla/livingin.jp/issues/34) |
| Directory | Organizations/branches/services, specific language support, booking, eligibility, accessibility evidence and freshness | P2 [#35](https://github.com/itkla/livingin.jp/issues/35) |
| Household utilities | Verified waste/disposal/resources for pilot districts; user notes and explicit unsupported coverage | P2 optional [#36](https://github.com/itkla/livingin.jp/issues/36) |

Municipal/flea-market ingestion is [#44](https://github.com/itkla/livingin.jp/issues/44), not a duplicate event database. A saved imported event is not a confirmed external registration. Recurring announcements are not proof that every future occurrence is happening. Hiking requirements are organizer-provided, not platform safety certification.

Location supports cross-border proximity and multiple followed areas. Administrative instructions require correct jurisdiction, not the nearest city. A quiet locality remains useful through applicable national tools and clearly labeled nearby resources.

## Marketplace — local household exchange

Epic: [#7](https://github.com/itkla/livingin.jp/issues/7).

| Feature | First scope | Issue |
|---|---|---|
| Listings and move-out bundles | Household sale/giveaway, dimensions/condition, coarse pickup location, per-item inventory and expiry | P1 [#37](https://github.com/itkla/livingin.jp/issues/37) |
| Review/publication | Revision-bound AI/human assessment; optional 30-minute release windows for completed approvals | P1 [#38](https://github.com/itkla/livingin.jp/issues/38) |
| Coordination | Contextual inquiries, pickup proposals, reservations, reports/blocks and user-reported completion | P1 [#39](https://github.com/itkla/livingin.jp/issues/39) |

Day-one is an intended launch scope, not exemption from safeguards. Shared moderation [#47](https://github.com/itkla/livingin.jp/issues/47) and evaluated Workers AI [#48](https://github.com/itkla/livingin.jp/issues/48) must operate first. AI approval is not seller verification. No escrow, stored balances, shipping protection or broad regulated categories initially.

## Weather & Safety — authoritative and understandable

Epic: [#8](https://github.com/itkla/livingin.jp/issues/8).

| Feature | First scope | Issue |
|---|---|---|
| Source feasibility and baseline | Approved providers/coverage/terminology; reviewed preparedness and official resources | P0/P1 [#40](https://github.com/itkla/livingin.jp/issues/40) |
| Validated feeds | Canonical issuer/product/area/time/revision/cancellation/test data with replay tests | P3 [#41](https://github.com/itkla/livingin.jp/issues/41) |
| Explanation/delivery | Reviewed templates, separate urgent processing, freshness alarms, fallback and outage drills | P3 [#42](https://github.com/itkla/livingin.jp/issues/42) |

No inferred safe routes, undocumented NERV API assumption, stale-data-as-safety, unsupported shelter-open claim or emergency-grade delivery promise. Official warning meanings and region mappings need current review. Alerts and event cancellations never wait for marketplace batches.

## Shared capabilities and operating work

| Workstream | Issues |
|---|---|
| Platform contracts and runtime decisions | [#12](https://github.com/itkla/livingin.jp/issues/12) |
| Accounts, preferences and roles | [#13](https://github.com/itkla/livingin.jp/issues/13) |
| Locality | [#14](https://github.com/itkla/livingin.jp/issues/14) |
| Media lifecycle | [#15](https://github.com/itkla/livingin.jp/issues/15) |
| Search, bookmarks, collections and follows | [#16](https://github.com/itkla/livingin.jp/issues/16) |
| Messaging, notifications and scheduling | [#17](https://github.com/itkla/livingin.jp/issues/17) |
| Source rights/revisions/dependencies | [#43](https://github.com/itkla/livingin.jp/issues/43) |
| Municipal connectors | [#44](https://github.com/itkla/livingin.jp/issues/44) |
| Conditional Reddit integration | [#45](https://github.com/itkla/livingin.jp/issues/45) |
| Threat/privacy/policy decisions | [#46](https://github.com/itkla/livingin.jp/issues/46) |
| Moderation cases/appeals/enforcement | [#47](https://github.com/itkla/livingin.jp/issues/47) |
| AI adapter/evaluation/costs | [#48](https://github.com/itkla/livingin.jp/issues/48) |
| CI/deployment | [#49](https://github.com/itkla/livingin.jp/issues/49) |
| Observability/restore/operations | [#50](https://github.com/itkla/livingin.jp/issues/50) |
| Pilot/outcome/operating decisions | [#51](https://github.com/itkla/livingin.jp/issues/51) |

## Cross-module journeys to validate

**Moving:** guide -> apartment/cost comparison -> private checklist -> sale/giveaway -> local disposal resource -> community/event in the next area.

**Meeting people:** choose a language/interest community -> introductions/discussion -> express activity interest -> join a real event -> return to the group. Participation and connection are valuable even without a transactional outcome.

**Career:** understand employment options -> filter transparent jobs -> compare conditions -> prepare externally submitted application -> track privately.

**Safety:** follow an area -> view authoritative current information and freshness -> understand reviewed guidance -> reach relevant official resources. Unavailable data must remain visibly unavailable.

Measure whether these paths improve real outcomes and reduce uncertainty versus each resident's existing approach. Do not treat module breadth as proof of product value.
