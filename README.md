# livingin.jp

**Settle in. Live well. Feel at home in Japan.**

livingin.jp is a resident-focused platform for people building a life in Japan: understandable guides, practical tools, useful opportunities, local exchange, and communities where people can connect through language, background, interests and everyday experience.

It should serve newcomers and established residents alike. Local discovery and volunteering support the mission; they do not define it. A useful explanation, a completed task and a meaningful conversation can all be valuable outcomes.

## Project status

Planning baseline created **September 30, 2026**. The repository initially contained no implementation. These documents and GitHub issues are a proposed delivery plan, not a claim that features exist or that target dates are committed.

**Hunter owns the frontend.** Current implementation planning covers backend services, APIs, data, ingestion, rules, security, moderation, infrastructure, operations and contract fixtures. No frontend framework, pages, components, styling or design system is selected or scaffolded here.

## Start here

- [Master roadmap and issue index](https://github.com/itkla/livingin.jp/issues/1)
- [Delivery roadmap and timeline](ROADMAP.md)
- [Module and feature plan](docs/FEATURE_PLAN.md)
- [Backend-to-frontend handoff contract](docs/FRONTEND_HANDOFF.md)
- [Decisions, dependencies and release risks](docs/DECISIONS_AND_RISKS.md)

## Product modules

| Module | Purpose | Epic |
|---|---|---|
| Living | Guides, reference information, practical tools and private life administration | [#3](https://github.com/itkla/livingin.jp/issues/3) |
| Community | Belonging, groups, conversation, requests and shared activities | [#4](https://github.com/itkla/livingin.jp/issues/4) |
| Work | Transparent jobs, career preparation and applications | [#5](https://github.com/itkla/livingin.jp/issues/5) |
| Local & Events | User activities, municipal calendars, services and local resources | [#6](https://github.com/itkla/livingin.jp/issues/6) |
| Marketplace | Local buying/selling, giveaways and moving exchanges | [#7](https://github.com/itkla/livingin.jp/issues/7) |
| Weather & Safety | Authoritative information, preparedness and understandable guidance | [#8](https://github.com/itkla/livingin.jp/issues/8) |

Shared workstreams are [Platform #2](https://github.com/itkla/livingin.jp/issues/2), [Sources #9](https://github.com/itkla/livingin.jp/issues/9), [Trust & Safety #10](https://github.com/itkla/livingin.jp/issues/10), and [Delivery #11](https://github.com/itkla/livingin.jp/issues/11). These are not extra navigation modules.

## Planning structure

The initial backlog contains one roadmap, ten epics, forty implementation/planning issues, and five release gates. Parent/dependency references and task checklists link the work; native GitHub sub-issues, milestones and a Projects board are not configured by this baseline.

Begin with [architecture/API contracts #12](https://github.com/itkla/livingin.jp/issues/12) and [threat/privacy decisions #46](https://github.com/itkla/livingin.jp/issues/46), alongside source/provider feasibility. The example timeline starts October 5, 2026; re-estimate at the [P0 gate #52](https://github.com/itkla/livingin.jp/issues/52).

## Delivery principles

A narrow marketplace is planned for the first release, with moderation and operational safeguards. High-stakes calculators, live warning delivery and external data integrations have independent review/permission gates. AI assists assessment and explanation; it does not replace deterministic rules, qualified review or human operating responsibility.

Backend completion, frontend integration and public-release readiness are separate decisions. Detailed acceptance criteria live in the linked issues.
