import { Coverage, Freshness, id, Instant, LocalityRef, LocalizedText, page, PageQuery, ReviewState, SourceRef, Term } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';

// Weather & Safety (#40 sources/preparedness baseline, #41 validated feeds, #42 explanation/delivery).
//
// Ground rules carried into every schema below:
// - The issuer's own warning, wording, severity tier and area naming are authoritative. livingin.jp
//   normalizes and explains them; it never re-ranks severity or replaces the official meaning.
// - Unavailable, stale and unsupported are three different states, and none of them means "no warnings".
// - No inferred safe routes, no shelter-open status and no emergency-grade delivery promise.
// - Warning ingestion runs on a dedicated urgent lane. It never waits for marketplace moderation or
//   publication batches.

const SUPPLEMENTARY_NOTE =
  'livingin.jp is a supplementary information service, not an official warning or emergency alert service. It may be delayed, incomplete or unavailable; always follow the issuer and your municipality.';

/** Prefecture or municipality code. Live warnings are always requested for a specific area. */
const AreaCode = z
  .string()
  .regex(/^JP-\d{2}(-\d{3})?$/)
  .openapi({ description: 'Prefecture (`JP-13`) or municipality (`JP-13-112`) code. A prefecture returns warnings affecting any part of it.', example: 'JP-13-112' });

const LanguageTag = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)
  .openapi({ description: 'BCP 47 language tag, e.g. `en`, `ja`, `zh-Hans`, `vi`, `pt-BR`.', example: 'en' });

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

export const SafetyIssuer = z
  .object({
    code: z.string().openapi({ description: 'Stable key for the issuing authority.', example: 'example_met_agency' }),
    name: Term,
  })
  .openapi('SafetyIssuer', { description: 'The official authority that issued a warning. Its products, wording, tiers and areas are authoritative.' });

export const SafetyIssuerArea = z
  .object({
    code: z.string().openapi({ description: 'The issuer’s own area code.', example: '1311200' }),
    name: Term,
  })
  .openapi('SafetyIssuerArea', { description: 'A warning area exactly as the issuer defines it. Issuer areas do not always match administrative boundaries.' });

export const SafetyHazard = z
  .enum(['heavy_rain', 'flood', 'landslide', 'storm', 'snow', 'high_waves', 'storm_surge', 'thunderstorm', 'high_temperature', 'test', 'other'])
  .openapi('SafetyHazard', { description: 'Broad hazard grouping derived from the issuer product, for grouping and icons only. More values may be added; clients must tolerate unknown values.' });

export const SafetyWarningProduct = z
  .object({
    code: z.string().openapi({ description: 'The issuer’s product (warning type) code.', example: 'heavy_rain_warning' }),
    name: Term.openapi({ description: 'The issuer’s product name, e.g. 大雨警報 / おおあめけいほう / heavy rain warning.' }),
    hazard: SafetyHazard,
  })
  .openapi('SafetyWarningProduct');

export const SafetyWarningLevel = z
  .enum(['advisory', 'warning', 'emergency_warning'])
  .openapi('SafetyWarningLevel', {
    description:
      'The issuer’s own severity tier (for a Japan-style meteorological issuer: 注意報 advisory, 警報 warning, 特別警報 emergency warning). The issuer’s tier is authoritative: livingin.jp maps its names one-to-one after review and never computes, combines or re-ranks severity. More values may be added for other issuers.',
  });

export const SafetyWarningLifecycle = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('active') }),
    z.object({ status: z.literal('cancelled'), cancelled_at: Instant.openapi({ description: 'When the issuer cancelled (lifted) the warning.' }) }),
    z.object({ status: z.literal('expired'), expired_at: Instant.openapi({ description: 'The issuer’s stated end of validity, now passed.' }) }),
  ])
  .openapi('SafetyWarningLifecycle', {
    description:
      '`cancelled`: the issuer explicitly lifted the warning. `expired`: its stated validity ended without a further revision. Ended warnings stay in the feed for a limited period so a warning is seen to end rather than silently disappearing.',
  });

export const SafetyOfficialText = z
  .object({
    original: LocalizedText.openapi({ description: 'The issuer’s own wording in its original language (`translation.status = original`). Always present and always authoritative.' }),
    localized: LocalizedText.openapi({
      description:
        'The official text in the negotiated language. A translation is only ever built from a reviewed translation template for this product (`reviewed_translation`); when none exists the original-language text is returned here unchanged. Official text is never machine translated.',
    }),
  })
  .openapi('SafetyOfficialText', {
    description:
      'The authoritative meaning of a warning. `original` is the issuer’s own wording and is always present; `localized` is the same text in the negotiated language, from a reviewed translation template or else unchanged. Never machine translated. Explanations supplement this text and never replace it.',
  });

export const SafetyExplanation = z
  .object({
    template_id: z.string().openapi({ description: 'Stable key of the reviewed guidance template.', example: 'heavy_rain.warning.general' }),
    template_version: z.int().min(1),
    reviewed_at: Instant,
    text: LocalizedText.openapi({ description: 'Plain-language guidance from the reviewed template, in the negotiated language.' }),
  })
  .openapi('SafetyExplanation', {
    description:
      'Reviewed, plain-language guidance for a warning product. It supplements the official text and never replaces or contradicts it. It is general preparedness guidance, not personalised instructions, safe routes or shelter status.',
  });

export const SafetyWarning = z
  .object({
    id: id('warning'),
    issuer: SafetyIssuer,
    product: SafetyWarningProduct,
    level: SafetyWarningLevel,
    issuer_areas: z.array(SafetyIssuerArea).min(1).openapi({ description: 'Areas exactly as the issuer named them. Authoritative.' }),
    affected_areas: z.array(LocalityRef).min(1).openapi({ description: 'livingin.jp’s reviewed mapping of the issuer areas onto administrative localities. Use `issuer_areas` when the two appear to disagree.' }),
    first_issued_at: Instant.openapi({ description: 'When the issuer first issued this warning (revision 1).' }),
    issued_at: Instant.openapi({ description: 'When the issuer issued the revision shown (`issuer_revision`).' }),
    valid_from: Instant,
    valid_until: Instant.nullable().openapi({ description: '`null`: the issuer gave no end time; the warning stays in effect until the issuer cancels or replaces it. Never means unknown.' }),
    issuer_revision: z.int().min(1).openapi({ description: 'The issuer’s revision number. Only the latest revision is shown; earlier revisions are superseded.' }),
    lifecycle: SafetyWarningLifecycle,
    is_test: z.boolean().openapi({
      description:
        '`true` for an issuer test or exercise message. It is not a real warning: clients must label it clearly and never present it as one. The public feed omits test messages except during announced drills.',
    }),
    official_text: SafetyOfficialText,
    explanation: SafetyExplanation.nullable().openapi({ description: '`null` when no reviewed guidance template exists for this product and language. livingin.jp never generates unreviewed guidance.' }),
    source_url: z.url().openapi({ description: 'The issuer’s own page for this warning, where the authoritative current version can be checked.' }),
  })
  .openapi('SafetyWarning', {
    description:
      'A canonical official warning or advisory as issued, with its issuer, product, tier, areas, times, revision, lifecycle and test flag. The official text is authoritative; the explanation is a reviewed supplement.',
  });

// ---------------------------------------------------------------------------
// Area status
// ---------------------------------------------------------------------------

export const SafetyResourceKind = z
  .enum(['hazard_map', 'evacuation_information', 'official_alert_service', 'preparedness_guide', 'emergency_contact', 'multilingual_support'])
  .openapi('SafetyResourceKind', {
    description:
      '`hazard_map`: an official hazard map. `evacuation_information`: where the municipality publishes evacuation information (livingin.jp does not report shelter-open status). `official_alert_service`: an official alerting channel residents can subscribe to. `preparedness_guide`: reviewed preparedness guidance. `emergency_contact`: published emergency numbers and contacts. `multilingual_support`: an official or provider multilingual help service.',
  });

export const SafetyResourceLink = z
  .object({
    resource_id: id('safety_resource'),
    kind: SafetyResourceKind,
    title: z.string(),
    publisher: z.string(),
    url: z.url(),
  })
  .openapi('SafetyResourceLink', { description: 'A short reference to a reviewed safety resource. Fetch the resource for its review and link-check state.' });

export const SafetyFeedUnavailableReason = z
  .enum(['upstream_outage', 'upstream_data_rejected', 'maintenance'])
  .openapi('SafetyFeedUnavailableReason', {
    description:
      '`upstream_outage`: the issuer or provider feed cannot be reached. `upstream_data_rejected`: data was retrieved but failed validation, so it is not shown. `maintenance`: livingin.jp has paused the feed. More values may be added; clients must tolerate unknown values.',
  });

export const SafetyFeed = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('available'),
      freshness: Freshness.openapi({
        description:
          '`current`: retrieved within the freshness requirement. `stale`: the latest data is older than required and must be shown as possibly out of date, never as reassurance.',
      }),
      retrieved_at: Instant.openapi({ description: 'When livingin.jp last successfully retrieved and validated the feed for this area (also `source.retrieved_at`).' }),
      source: SourceRef.openapi({ description: 'The issuer or approved provider the feed comes from.' }),
      warnings: z.array(SafetyWarning).openapi({
        description:
          'Warnings in the feed for this area as of `retrieved_at`, including recently cancelled or expired ones. An empty array means "no warnings in effect according to the feed" and is only meaningful when `freshness.state` is `current`. When the feed is stale, an empty array must not be presented as "no warnings".',
      }),
    }),
    z.object({
      status: z.literal('unavailable'),
      reason_code: SafetyFeedUnavailableReason,
      last_successful_retrieval_at: Instant.nullable().openapi({ description: '`null` when the feed has never been retrieved successfully for this area.' }),
      explanation: z.string().openapi({ description: 'Safe human-readable explanation. Always states that this does not mean there are no warnings.' }),
    }),
    z.object({
      status: z.literal('not_covered'),
      explanation: z.string().openapi({ description: 'Safe human-readable explanation. Always states that this does not mean there are no warnings.' }),
    }),
  ])
  .openapi('SafetyFeed', {
    description:
      'State of the warning feed for the area. `available`: data exists from `source`, the issuer or an approved provider; check `freshness` — `stale` data must be shown as possibly out of date, never as reassurance. `unavailable`: an upstream or service failure prevents a reliable result; no warnings are listed and this NEVER means there are none. `not_covered`: livingin.jp does not carry warnings for this area (see `coverage`); this also never means there are none.',
  });

export const AreaSafetyStatus = z
  .object({
    area: LocalityRef,
    coverage: Coverage.openapi({
      description: '`partial` lists what is not carried (for example warning types handled only by official alert services). `unsupported` comes with `feed.status = not_covered`.',
    }),
    feed: SafetyFeed,
    official_fallbacks: z.array(SafetyResourceLink).min(1).openapi({
      description: 'Official places to check the authoritative current situation. Always present; most important when the feed is stale, unavailable or not covered.',
    }),
    disclaimer: z.string().openapi({ description: 'Notice that livingin.jp is supplementary to official sources and makes no delivery promise. Show it with the status.' }),
  })
  .openapi('AreaSafetyStatus', {
    description:
      'Current official warnings for an area, with feed health and coverage. Contains no inferred safe routes, no shelter-open status and no delivery promise; livingin.jp is supplementary to official sources.',
  });

// ---------------------------------------------------------------------------
// Preparedness and official resources
// ---------------------------------------------------------------------------

export const SafetyResource = z
  .object({
    id: id('safety_resource'),
    kind: SafetyResourceKind,
    title: z.string().openapi({ description: 'Title in the negotiated language.' }),
    official_name: Term.nullable().openapi({ description: 'The name residents will see on the publisher’s own site, when it is published in Japanese. `null` when the resource’s own name is not Japanese.' }),
    summary: z.string(),
    publisher: z.string(),
    authority: z.enum(['official', 'provider', 'community', 'editorial']).openapi({ description: '`official`: published by a government body or the issuer. `editorial`: written and maintained by livingin.jp.' }),
    url: z.url(),
    locality: LocalityRef.openapi({ description: 'The jurisdiction the resource applies to. National resources use `JP`.' }),
    languages: z.array(LanguageTag).min(1).openapi({ description: 'Languages the resource itself is available in.' }),
    review: ReviewState,
    last_checked: Freshness.openapi({ description: 'Whether the link and its content were checked recently enough. `stale` means the last check is too old or failed.' }),
  })
  .openapi('SafetyResource', { description: 'A reviewed preparedness or official safety resource. livingin.jp links to it; the publisher remains authoritative for its content.' });

export const SafetyResourceSearchResult = page(SafetyResource)
  .extend({ coverage: Coverage })
  .openapi('SafetyResourceSearchResult', {
    description:
      'Resources whose jurisdiction is the requested locality or one of its parents (national `JP`, the prefecture). This is jurisdiction, not proximity. When local resources for the locality are not maintained, `coverage` says so and national resources are still listed because they apply everywhere.',
  });

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export const safetyOperations = [
  defineOperation({
    operationId: 'getAreaSafetyStatus',
    module: 'safety',
    feature: 'safety.live_warnings',
    method: 'get',
    path: '/v1/safety/areas/{locality_code}/status',
    summary: 'Current official warnings for an area',
    description: [
      'Official warnings for a prefecture or municipality with feed freshness, source health and coverage.',
      'Held: this feature stays disabled until source, semantics, replay and outage evidence exist (#41, #42).',
      'Warnings are ingested on a dedicated urgent lane, separate from marketplace moderation and publication batches, and never wait for them.',
      'Responses are short-lived: do not cache beyond `feed.freshness.stale_after`.',
      'An empty `warnings` array is only "no warnings in effect" when the feed is `available` and `current`. Stale, unavailable and not-covered states must never be presented as safety.',
      SUPPLEMENTARY_NOTE,
      'Unknown locality codes return 404.',
    ].join(' '),
    auth: 'none',
    request: { params: z.object({ locality_code: AreaCode }) },
    responses: { 200: { description: 'Area status. Check `coverage` and `feed.status` before reading `warnings`.', schema: AreaSafetyStatus } },
    requiredScenarios: ['active_warning', 'stale_feed', 'unavailable', 'cancelled_warning', 'test_message', 'unsupported_area', 'validation_failed', 'not_found'],
  }),
  defineOperation({
    operationId: 'listSafetyResources',
    module: 'safety',
    feature: 'safety.preparedness',
    method: 'get',
    path: '/v1/safety/resources',
    summary: 'Reviewed preparedness and official safety resources',
    description:
      'Hazard maps, evacuation information pages, official alert services, preparedness guides, emergency contacts and multilingual support. Without `locality`, national resources are returned. Links lead to the publisher, which stays authoritative.',
    auth: 'none',
    request: {
      query: PageQuery.extend({
        locality: z.string().regex(/^JP(-\d{2}(-\d{3})?)?$/).optional().openapi({ description: '`JP`, a prefecture or a municipality code. Returns resources for that jurisdiction and its parents.' }),
        kind: SafetyResourceKind.optional(),
      }),
    },
    responses: { 200: { description: 'A page of resources with coverage for the requested locality.', schema: SafetyResourceSearchResult } },
    requiredScenarios: ['empty', 'unsupported_locality', 'validation_failed'],
  }),
  defineOperation({
    operationId: 'getSafetyResource',
    module: 'safety',
    feature: 'safety.preparedness',
    method: 'get',
    path: '/v1/safety/resources/{resource_id}',
    summary: 'Safety resource',
    auth: 'none',
    request: { params: z.object({ resource_id: id('safety_resource') }) },
    responses: { 200: { description: 'A reviewed safety resource.', schema: SafetyResource } },
    requiredScenarios: ['review_overdue', 'link_check_stale', 'not_found'],
  }),
];
