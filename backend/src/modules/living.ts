import { CalendarDate, Coverage, id, Instant, knowable, LocalityRef, LocalizedText, Money, page, PageQuery, ReviewState, SourceRef, Term, TimeZone } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';
import { Organization } from './identity';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const Key = z.string().regex(/^[a-z][a-z0-9_]*$/);
const LocalityCode = z.string().regex(/^JP-\d{2}(-\d{3})?$/);

export const LivingCondition = z
  .object({
    code: Key.openapi({ description: 'Stable machine-readable key. The same code means the same condition everywhere in a guide or entry, so a reader answers it once.', example: 'has_dependents_in_japan' }),
    description: z.string().openapi({ description: 'The condition in plain words.', example: 'Family members live with you in Japan' }),
  })
  .openapi('LivingCondition', { description: 'A stated circumstance that decides whether something applies to a reader. Never inferred from a member’s profile, account or private data.' });

export const LivingAppliesWhen = z
  .discriminatedUnion('kind', [z.object({ kind: z.literal('always') }), z.object({ kind: z.literal('only_if'), condition: LivingCondition })])
  .openapi('LivingAppliesWhen', {
    description: '`only_if`: applies only when the condition is true for the reader. Clients may let readers answer conditions to hide irrelevant items, but an unanswered condition is not false.',
  });

// ---------------------------------------------------------------------------
// Guides (#18)
// ---------------------------------------------------------------------------

export const GuideTopic = z
  .enum(['arrival', 'housing', 'immigration', 'local_admin', 'banking', 'tax_pension_insurance', 'healthcare', 'family_education', 'transport', 'household', 'language', 'long_term_planning', 'leaving_japan'])
  .openapi('GuideTopic', { description: 'Life area. More topics may be added; clients must tolerate unknown values.' });

export const GuideFormat = z
  .enum(['procedure', 'explainer'])
  .openapi('GuideFormat', { description: '`procedure`: ordered, possibly conditional steps. `explainer`: article-style explanation with no checklist.' });

export const GuideScope = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('national') }),
    z.object({ kind: z.literal('prefecture'), locality: LocalityRef }),
    z.object({ kind: z.literal('municipality'), locality: LocalityRef }),
    z.object({ kind: z.literal('provider'), provider: Organization, service_area: LocalityRef }),
  ])
  .openapi('GuideScope', {
    description:
      'Whose rules or process the guide describes. `national`: the same everywhere in Japan. `prefecture`/`municipality`: that jurisdiction’s procedure only; it never applies to a neighbouring area, however close. `provider`: one organization’s own process (for example a bank) within its `service_area` (`JP` for nationwide).',
  });

export const GuideAudienceCondition = LivingCondition.extend({
  effect: z.enum(['applies_if', 'excluded_if']),
}).openapi('GuideAudienceCondition', { description: 'A condition on who the guide is for.' });

export const GuideApplicability = z
  .object({
    scope: GuideScope,
    conditions: z.array(GuideAudienceCondition).openapi({
      description: 'The guide applies to a reader when every `applies_if` condition holds and no `excluded_if` condition does. Empty: everyone within the scope.',
    }),
  })
  .openapi('GuideApplicability', { description: 'Where (jurisdiction or provider) and to whom a guide applies.' });

export const GuideDocument = z
  .object({
    key: Key.openapi({ description: 'Referenced by `GuideStepDocument.document_key` within the same guide.' }),
    name: Term,
    aliases: z.array(Term).openapi({ description: 'Other names for the same document that readers may see on forms or hear at a counter.' }),
    description: z.string().openapi({ description: 'What the document is and where it comes from.' }),
  })
  .openapi('GuideDocument', { description: 'A document a reader may need to bring or obtain.' });

export const GuideStepDocument = z
  .object({ document_key: Key, applies: LivingAppliesWhen })
  .openapi('GuideStepDocument', { description: 'A document needed for one step, possibly only under a condition.' });

export const GuideStep = z
  .object({
    key: Key.openapi({ description: 'Stable within the guide across revisions while the step keeps its meaning.' }),
    position: z.int().min(1),
    title: LocalizedText,
    instructions: LocalizedText.openapi({ description: 'CommonMark without raw HTML. Translation state is per field, so one step can be stale while others are current.' }),
    applies: LivingAppliesWhen,
    documents: z.array(GuideStepDocument),
    source_ids: z.array(id('source')).openapi({ description: 'Entries in the guide’s `sources` that support this step.' }),
  })
  .openapi('GuideStep');

export const GuideAnchorEvent = z
  .object({ code: Key, description: z.string() })
  .openapi('GuideAnchorEvent', { description: 'The event a deadline counts from, e.g. `moved_in`: “the day you moved into your new address”.', example: { code: 'moved_in', description: 'The day you moved into your new address' } });

export const GuideDueRule = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('no_deadline') }),
    z.object({
      kind: z.literal('days_after_event'),
      days: z.int().min(0),
      event: GuideAnchorEvent,
      explanation: z.string(),
      source_id: id('source'),
    }),
  ])
  .openapi('GuideDueRule', { description: 'A reviewed rule for deriving a deadline. The server applies it; clients never compute rule-derived deadlines themselves.' });

const StepKey = Key.nullable().openapi({ description: 'The step this action belongs to. `null`: the whole guide.' });

export const GuideRelatedAction = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('suggest_task'),
      step_key: StepKey,
      suggestion_key: Key,
      title: z.string(),
      due_rule: GuideDueRule,
      rule_version: z.string().openapi({ description: 'Version of the suggestion and its due rule. Recorded on any task created from it.' }),
    }),
    z.object({ kind: z.literal('use_tool'), step_key: StepKey, tool: z.enum(['move_in_cost_estimate']).openapi({ description: '`move_in_cost_estimate`: `estimateMoveInCosts`.' }), title: z.string() }),
    z.object({ kind: z.literal('read_guide'), step_key: StepKey, guide_id: id('guide'), title: z.string() }),
    z.object({ kind: z.literal('read_almanac_entry'), step_key: StepKey, entry_id: id('almanac_entry'), title: z.string() }),
    z.object({ kind: z.literal('official_resource'), step_key: StepKey, source_id: id('source'), title: z.string() }),
  ])
  .openapi('GuideRelatedAction', {
    description:
      'A typed reference to something the reader can do next; presentation is up to the client. `suggest_task` becomes a private task only when the member calls `createMyTask` with origin `rule_derived`; nothing is created automatically.',
  });

export const GuideLink = z.object({ guide_id: id('guide'), title: z.string() }).openapi('GuideLink');

export const GuideLifecycle = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('published') }),
    z.object({ state: z.literal('withdrawn'), withdrawn_at: Instant, reason: z.string(), replaced_by: GuideLink.nullable() }),
  ])
  .openapi('GuideLifecycle', {
    description:
      '`withdrawn`: no longer maintained or no longer applicable. The guide still resolves so saved links and tasks can explain what happened, but it is excluded from `listGuides` and its content must not be presented as current.',
  });

export const GuideSummary = z
  .object({
    id: id('guide'),
    format: GuideFormat,
    topics: z.array(GuideTopic).min(1),
    title: LocalizedText,
    summary: LocalizedText,
    applicability: GuideApplicability,
    variant_of: id('guide').nullable().openapi({ description: 'The national (or wider) guide this local guide specializes. `null` if it is not a variant.' }),
    review: ReviewState,
    revised_at: Instant,
  })
  .openapi('GuideSummary');

export const GuideSearchResult = page(GuideSummary)
  .extend({
    coverage: Coverage.openapi({
      description:
        'Coverage of *local* (prefecture and municipality) guides for the requested `locality`. National and nationwide provider guides apply everywhere and are still returned when local coverage is `partial` or `unsupported`; an unsupported locality is never presented as having no local procedures. `supported` when no `locality` is given.',
    }),
  })
  .openapi('GuideSearchResult', {
    description:
      'The `locality` filter matches by jurisdiction, not proximity: national guides, guides for the containing prefecture, guides for that exact municipality, and provider guides whose service area contains it. Guides for neighbouring municipalities are never returned as matches.',
  });

export const Guide = z
  .object({
    id: id('guide'),
    revision: z.int().min(1).openapi({ description: 'Published content revision. Drafts and unpublished revisions are never served. Tasks created from the guide record the revision they came from.' }),
    lifecycle: GuideLifecycle,
    format: GuideFormat,
    topics: z.array(GuideTopic).min(1),
    title: LocalizedText,
    summary: LocalizedText,
    body: LocalizedText.openapi({ description: 'Article-style explanation. CommonMark without raw HTML.' }),
    applicability: GuideApplicability,
    variant_of: GuideLink.nullable(),
    steps: z.array(GuideStep).openapi({ description: 'Ordered by `position`. Empty for explainers.' }),
    documents: z.array(GuideDocument),
    terminology: z.array(Term),
    related_actions: z.array(GuideRelatedAction),
    sources: z.array(SourceRef).min(1),
    review: ReviewState,
    sources_checked_at: Instant.openapi({ description: 'Last automated check of the cited sources for changes. An automated check never counts as human review.' }),
    published_at: Instant,
    revised_at: Instant,
  })
  .openapi('Guide', { description: 'A maintained guide or procedure. Official, editorial and provider information are distinguished by `sources[].authority`.' });

// ---------------------------------------------------------------------------
// Residence-status almanac (#19)
// ---------------------------------------------------------------------------

export const AlmanacStatusOfResidence = z
  .object({
    code: Key,
    name: Term,
    category: z.enum(['work', 'study', 'family', 'status_based', 'designated_activities', 'other']),
    permitted_activities: z.string().openapi({ description: 'Summary of the activities the status covers. Reference information, not a determination for any person.' }),
    source_ids: z.array(id('source')).min(1),
  })
  .openapi('AlmanacStatusOfResidence', {
    description: 'A status of residence (在留資格): the category of activities a person may engage in while residing in Japan. Not a visa, a period of stay or a procedure.',
  });

export const AlmanacEntryVisa = z
  .object({ name: Term, description: z.string(), issued_by: z.string() })
  .openapi('AlmanacEntryVisa', {
    description: 'An entry visa (査証): issued abroad before travel to support an application for landing. Not the status of residence, and does not by itself permit residence or work.',
  });

export const AlmanacPeriodOfStay = z
  .object({ value: z.int().min(1), unit: z.enum(['years', 'months', 'days']), label: Term })
  .openapi('AlmanacPeriodOfStay', {
    description: 'A period of stay (在留期間) that may be granted with the status. The authority decides the period in each decision; the applicant does not choose it.',
  });

export const AlmanacRequirement = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('document'), key: Key, document: Term, description: z.string(), applies: LivingAppliesWhen, source_ids: z.array(id('source')).min(1) }),
    z.object({ kind: z.literal('eligibility'), key: Key, description: z.string(), applies: LivingAppliesWhen, source_ids: z.array(id('source')).min(1) }),
  ])
  .openapi('AlmanacRequirement', { description: 'A requirement of one procedure version, with the sources it comes from. Listing a requirement is not a statement that meeting it is sufficient.' });

const DayRange = z.object({ min: z.number().min(0), max: z.number().min(0) }).openapi('AlmanacDayRange', { description: 'Inclusive range of calendar days.' });

export const AlmanacProcessingEvidence = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('official_guidance'),
      description: z.string(),
      stated_range_days: DayRange,
      stated_on: CalendarDate,
      source_id: id('source'),
    }),
    z.object({
      kind: z.literal('official_statistics'),
      description: z.string(),
      scope: z.string().openapi({ description: 'What the statistic covers, e.g. which applications and where.' }),
      observed_from: CalendarDate,
      observed_to: CalendarDate,
      metric: z.enum(['mean', 'median']),
      value_days: z.number().min(0),
      sample_size: knowable(z.int().min(1)),
      source_id: id('source'),
    }),
    z.object({
      kind: z.literal('community_reported'),
      description: z.string(),
      scope: z.string(),
      observed_from: CalendarDate,
      observed_to: CalendarDate,
      sample_size: z.int().min(1),
      median_days: z.number().min(0),
      range_days: DayRange,
      collection_method: z.string(),
      limitations: z.array(z.string()).min(1),
      source_id: id('source'),
    }),
  ])
  .openapi('AlmanacProcessingEvidence', {
    description:
      'Evidence about stated or past processing times. Guidance, official statistics and community reports are different kinds of evidence and are never merged. None of them is a promise or an estimate for a particular application.',
  });

export const AlmanacProcedureVersion = z
  .object({ label: z.string(), effective_from: CalendarDate, source_id: id('source') })
  .openapi('AlmanacProcedureVersion', { description: 'The version of the procedure that the fee, requirements and evidence belong to.' });

export const AlmanacProcedure = z
  .object({
    key: Key,
    kind: z.enum(['certificate_of_eligibility', 'change_of_status', 'extension_of_period_of_stay', 'permission_for_other_activities', 're_entry_permit', 'other']),
    name: Term,
    use_when: z.string().openapi({ description: 'When this procedure is the relevant one.' }),
    where_to_apply: z.string(),
    version: AlmanacProcedureVersion,
    fee: knowable(Money).openapi({ description: '`unknown`: livingin.jp does not currently hold a verified fee. Never shown as zero. `not_applicable`: the procedure has no fee in this version.' }),
    fee_note: z.string().optional().openapi({ description: 'How or when the fee is paid, or why it is unknown.' }),
    requirements: z.array(AlmanacRequirement),
    processing_time: knowable(z.array(AlmanacProcessingEvidence).min(1)).openapi({ description: '`unknown`: no evidence held. Evidence is never a promised turnaround.' }),
  })
  .openapi('AlmanacProcedure', { description: 'An application procedure (手続き) for a status. Fees, requirements and processing evidence belong to a procedure version, not to the status or the visa.' });

export const AlmanacEntry = z
  .object({
    id: id('almanac_entry'),
    revision: z.int().min(1),
    summary: LocalizedText.openapi({ description: 'The entry’s other descriptive strings are in `summary.lang` and share its translation state.' }),
    status_of_residence: AlmanacStatusOfResidence,
    entry_visa: knowable(AlmanacEntryVisa).openapi({ description: 'The related entry visa, if any. A separate concept from the status.' }),
    periods_of_stay: knowable(z.array(AlmanacPeriodOfStay).min(1)),
    procedures: z.array(AlmanacProcedure).min(1),
    terminology: z.array(Term),
    related_guides: z.array(GuideLink),
    sources: z.array(SourceRef).min(1),
    review: ReviewState,
    published_at: Instant,
    revised_at: Instant,
  })
  .openapi('AlmanacEntry', {
    description:
      'Reference record for one status of residence. Visa, status of residence, period of stay and procedure are separate fields and never collapsed into one. Only reviewed entries are published. Reference information, not legal advice or a prediction of any decision.',
  });

// ---------------------------------------------------------------------------
// Practical tools: move-in cost estimate (#20)
// ---------------------------------------------------------------------------

/** Input-side known/unknown. The engine never invents a default for an unknown term: it applies a listed assumption range. */
function userKnown<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('status', [z.object({ status: z.literal('known'), value }).strict(), z.object({ status: z.literal('unknown') }).strict()]);
}

const Months = z.number().min(0).max(12).multipleOf(0.5);

export const MoveInContractTerms = z
  .object({
    deposit_months: userKnown(Months).openapi({ description: '敷金 in months of rent. `0` is known-none, different from `unknown`.' }),
    key_money_months: userKnown(Months).openapi({ description: '礼金 in months of rent.' }),
    agency_fee: userKnown(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('months_of_rent'), months: z.number().min(0).max(2).multipleOf(0.5), includes_consumption_tax: z.boolean() }).strict(),
        z.object({ kind: z.literal('amount'), amount: Money, includes_consumption_tax: z.boolean() }).strict(),
      ]),
    ).openapi({ description: '仲介手数料.' }),
    guarantor_company: userKnown(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('not_used') }).strict(),
        z.object({ kind: z.literal('percent_of_monthly_rent'), percent: z.number().min(0).max(200) }).strict(),
        z.object({ kind: z.literal('amount'), amount: Money }).strict(),
      ]),
    ).openapi({ description: '保証会社 initial fee. `unknown` covers not knowing whether one is required.' }),
    fire_insurance: userKnown(Money).openapi({ description: '火災保険 premium charged at signing.' }),
    lock_change: userKnown(Money).openapi({ description: '鍵交換費用.' }),
    other_fees: z
      .array(z.object({ label: z.string().trim().min(1).max(60), amount: Money, refundable: z.boolean() }).strict())
      .max(10)
      .openapi({ description: 'Other fees from the quote, entered by the user. Each is included as given.' }),
  })
  .partial()
  .strict()
  .openapi('MoveInContractTerms', { description: 'Contract terms the user knows. An omitted term is the same as `{ "status": "unknown" }`; `other_fees` defaults to none.' });

export const MoveInCostEstimateInput = z
  .object({
    monthly_rent: Money,
    monthly_management_fee: userKnown(Money).optional().openapi({ description: '管理費・共益費. Omitted is the same as `unknown`.' }),
    locality_code: LocalityCode.openapi({ description: 'Prefecture or municipality of the property. Decides which regional rules apply.' }),
    move_in_date: CalendarDate.openapi({ description: 'Contract start date (Asia/Tokyo). Used for prorated rent.' }),
    contract_terms: MoveInContractTerms.optional(),
  })
  .strict()
  .refine((v) => v.monthly_rent.amount > 0, { message: 'Rent must be greater than zero', path: ['monthly_rent', 'amount'] })
  .openapi('MoveInCostEstimateInput', { description: 'User-entered inputs. Not stored, and never added to a profile, analytics or advertising.' });

export const MoveInCostAmount = z
  .discriminatedUnion('kind', [z.object({ kind: z.literal('exact'), amount: Money }), z.object({ kind: z.literal('range'), min: Money, max: Money })])
  .openapi('MoveInCostAmount', { description: '`range` when an input is unknown and the engine applied an assumption. A range is never collapsed into a single figure.' });

export const MoveInCostRange = z
  .object({ min: Money, max: Money })
  .openapi('MoveInCostRange', { description: 'Inclusive range. `min` equals `max` when every contributing amount is exact.' });

export const MoveInCostLineItem = z
  .object({
    key: Key,
    label: z.string(),
    term: Term.optional(),
    category: z.enum(['upfront', 'recurring_monthly', 'optional']).openapi({ description: '`optional`: commonly offered but declinable; never included in `upfront` or `recurring_monthly` totals.' }),
    refundability: z.enum(['non_refundable', 'refundable_less_deductions']),
    amount: MoveInCostAmount,
    basis: z.enum(['user_input', 'rule', 'assumption']).openapi({ description: '`user_input`: computed only from what the user entered. `rule`: from a reviewed rule in `rules`. `assumption`: the user did not know; see `assumption_keys`.' }),
    explanation: z.string().openapi({ description: 'How this amount was computed, contribution by contribution.' }),
    assumption_keys: z.array(Key).openapi({ description: 'Entries in `assumptions` this line depends on.' }),
    source: SourceRef.optional(),
  })
  .openapi('MoveInCostLineItem');

export const MoveInCostAssumption = z
  .object({ key: Key, description: z.string() })
  .openapi('MoveInCostAssumption', { description: 'An explicit assumption the engine made. There are no hidden defaults.' });

export const MoveInCostExclusion = z
  .object({ key: Key, description: z.string() })
  .openapi('MoveInCostExclusion', { description: 'A cost the estimate deliberately does not include.' });

export const MoveInCostRuleSet = z
  .object({
    version: z.string().openapi({ example: '2026.10.1' }),
    effective_from: CalendarDate,
    review: ReviewState,
  })
  .openapi('MoveInCostRuleSet', { description: 'Version of the deterministic rule set. The same inputs and version always give the same result. No LLM is involved.' });

export const MoveInCostEstimate = z
  .discriminatedUnion('outcome', [
    z.object({
      outcome: z.literal('supported'),
      locality: LocalityRef,
      move_in_date: CalendarDate,
      line_items: z.array(MoveInCostLineItem).min(1),
      totals: z.object({
        upfront: MoveInCostRange.openapi({ description: 'Due at or before signing. Includes refundable amounts.' }),
        upfront_refundable_less_deductions: MoveInCostRange.openapi({ description: 'The part of `upfront` that is refundable at move-out, less deductions.' }),
        recurring_monthly: MoveInCostRange,
        optional_not_included: MoveInCostRange,
      }),
      assumptions: z.array(MoveInCostAssumption),
      excluded: z.array(MoveInCostExclusion),
      rounding: z.object({ method: z.enum(['round_down_each_line_item']), explanation: z.string() }),
      rules: MoveInCostRuleSet,
    }),
    z.object({
      outcome: z.literal('unsupported'),
      reason_code: z.enum(['locality_not_covered', 'currency_not_supported', 'move_in_date_outside_rules']),
      explanation: z.string(),
      rules: MoveInCostRuleSet,
    }),
  ])
  .openapi('MoveInCostEstimate', {
    description: '`unsupported`: the rule set does not cover this scenario. It carries no amounts and is never an estimate of zero. Private: never cached publicly or included in profile payloads.',
  });

// ---------------------------------------------------------------------------
// My Life: private tasks (#21)
// ---------------------------------------------------------------------------

export const MyLifeJourney = z
  .enum(['getting_established', 'moving'])
  .openapi('MyLifeJourney', { description: 'A private journey a task belongs to. More may be added; clients must tolerate unknown values.' });

export const MyTaskStatus = z
  .enum(['open', 'done', 'dismissed'])
  .openapi('MyTaskStatus', { description: '`dismissed`: the member decided the task does not apply to them. Not the same as `done`.' });

export const MyTaskOrigin = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('user_entered') }),
    z.object({
      kind: z.literal('rule_derived'),
      guide_id: id('guide'),
      guide_revision: z.int().min(1),
      guide_title: z.string().openapi({ description: 'Title when the task was created.' }),
      suggestion_key: Key,
      rule_version: z.string(),
      explanation: z.string().openapi({ description: 'Why the guide suggested this task.' }),
      rule_status: z
        .discriminatedUnion('status', [
          z.object({ status: z.literal('current'), checked_at: Instant }),
          z.object({ status: z.literal('rule_changed'), detected_at: Instant, current_rule_version: z.string(), explanation: z.string() }),
        ])
        .openapi({ description: '`rule_changed`: the guide’s rule changed after the task was created. The task and its date are never changed automatically; the member decides whether to recompute.' }),
    }),
  ])
  .openapi('MyTaskOrigin', { description: 'How the task came to exist.' });

const DueUserEntered = z.object({ kind: z.literal('user_entered'), set_at: Instant });

export const MyTaskDueProvenance = z
  .discriminatedUnion('kind', [
    DueUserEntered,
    z.object({
      kind: z.literal('rule_derived'),
      anchor: z.object({ event: GuideAnchorEvent, date: CalendarDate }).openapi({ description: 'The event the rule counts from and the date the member gave for it.' }),
      offset_days: z.int().min(0),
      explanation: z.string().openapi({ description: 'How the date was derived.' }),
    }),
  ])
  .openapi('MyTaskDueProvenance', {
    description:
      'Who set the due date. `rule_derived`: computed by the server from the rule recorded in the task’s `origin` (which is then always `rule_derived`). Setting an explicit date replaces it with `user_entered`; the origin still records the rule.',
  });

export const MyTaskDue = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('date'), date: CalendarDate, time_zone: TimeZone, provenance: MyTaskDueProvenance }),
    z.object({ kind: z.literal('datetime'), at: Instant, time_zone: TimeZone.openapi({ description: 'For display.' }), provenance: DueUserEntered }),
  ])
  .openapi('MyTaskDue', { description: '`date`: a calendar-date deadline, never a midnight timestamp. `datetime`: a specific moment such as an appointment; always user-entered.' });

export const MyTask = z
  .object({
    id: id('task'),
    revision: z.int().min(1).openapi({ description: 'Served as the ETag of mutation responses; send it as If-Match to `updateMyTask`.' }),
    title: z.string(),
    notes: z.string().openapi({ description: 'Empty string when there are none.' }),
    status: MyTaskStatus,
    status_changed_at: Instant,
    origin: MyTaskOrigin,
    due: MyTaskDue,
    journey: MyLifeJourney.nullable().openapi({ description: '`null`: not part of a journey.' }),
    created_at: Instant,
    updated_at: Instant,
  })
  .openapi('MyTask', { description: 'A private task. Only ever returned to its owner; contains no public-profile data and never appears in public profiles, search or analytics.' });

export const MyTaskPage = page(MyTask).openapi('MyTaskPage');

export const MyTaskOriginInput = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('user_entered') }).strict(),
    z.object({ kind: z.literal('rule_derived'), guide_id: id('guide'), suggestion_key: Key }).strict(),
  ])
  .openapi('MyTaskOriginInput', { description: '`rule_derived`: create from a guide’s `suggest_task` action. The server records the current guide revision and rule version; an unknown suggestion is a validation error.' });

export const MyTaskDueInput = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }).strict(),
    z.object({ kind: z.literal('date'), date: CalendarDate, time_zone: TimeZone.optional().openapi({ description: 'Defaults to Asia/Tokyo.' }) }).strict(),
    z.object({ kind: z.literal('datetime'), at: Instant, time_zone: TimeZone }).strict(),
    z.object({ kind: z.literal('derive_from_rule'), anchor_date: CalendarDate.openapi({ description: 'Date of the rule’s anchor event, e.g. the day you moved in.' }) }).strict(),
  ])
  .openapi('MyTaskDueInput', { description: '`date`/`datetime` are recorded as user-entered. `derive_from_rule` asks the server to apply the task’s rule; only valid when the task’s origin is `rule_derived`.' });

const TaskTitle = z.string().trim().min(1).max(200);
const TaskNotes = z.string().max(4000);

export const MyTaskInput = z
  .object({
    title: TaskTitle,
    notes: TaskNotes.optional(),
    journey: MyLifeJourney.nullable().optional(),
    origin: MyTaskOriginInput,
    due: MyTaskDueInput,
  })
  .strict()
  .refine((v) => v.due.kind !== 'derive_from_rule' || v.origin.kind === 'rule_derived', { message: 'derive_from_rule requires a rule_derived origin', path: ['due', 'kind'] })
  .openapi('MyTaskInput');

export const MyTaskPatchInput = z
  .object({ title: TaskTitle, notes: TaskNotes, status: MyTaskStatus, journey: MyLifeJourney.nullable(), due: MyTaskDueInput })
  .partial()
  .strict()
  .openapi('MyTaskPatchInput', { description: 'Fields to replace. Changing `due` to an explicit date makes it user-entered; `derive_from_rule` recomputes from the current rule.' });

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const etag = { ETag: { description: 'Current revision, e.g. `"3"`.', required: true } };

export const livingOperations = [
  defineOperation({
    operationId: 'listGuides',
    module: 'living',
    feature: 'living.guides',
    method: 'get',
    path: '/v1/guides',
    summary: 'Browse guides',
    description: 'Browsing needs no location. Sorted by relevance when `q` is given, otherwise by title; the order is stable across pages.',
    auth: 'optional',
    request: {
      query: PageQuery.extend({
        locality: z.string().regex(/^JP(-\d{2}(-\d{3})?)?$/).optional().openapi({ description: '`JP`, a prefecture or a municipality code. Filters by jurisdiction, not proximity; `JP` returns national and nationwide guides only.' }),
        topic: GuideTopic.optional(),
        q: z.string().max(200).optional().openapi({ description: 'Matches English and Japanese text, including terminology aliases.' }),
      }),
    },
    responses: { 200: { description: 'A page of guides with local coverage for the requested locality.', schema: GuideSearchResult } },
    requiredScenarios: ['empty', 'unsupported_locality'],
  }),
  defineOperation({
    operationId: 'getGuide',
    module: 'living',
    feature: 'living.guides',
    method: 'get',
    path: '/v1/guides/{guide_id}',
    summary: 'Guide',
    description: 'The latest published revision in the negotiated language. Drafts and unpublished revisions return 404; withdrawn guides still resolve with `lifecycle.state: "withdrawn"`.',
    auth: 'optional',
    request: { params: z.object({ guide_id: id('guide') }) },
    responses: { 200: { description: 'A guide.', schema: Guide } },
    requiredScenarios: ['machine_translation', 'stale_translation', 'review_overdue', 'municipality_variant', 'withdrawn', 'not_found'],
  }),
  defineOperation({
    operationId: 'getAlmanacEntry',
    module: 'living',
    feature: 'living.almanac',
    method: 'get',
    path: '/v1/almanac/{entry_id}',
    summary: 'Residence-status almanac entry',
    description: 'Only reviewed entries are published; others return 404.',
    auth: 'optional',
    request: { params: z.object({ entry_id: id('almanac_entry') }) },
    responses: { 200: { description: 'An almanac entry.', schema: AlmanacEntry } },
    requiredScenarios: ['unknown_fee', 'not_found'],
  }),
  defineOperation({
    operationId: 'estimateMoveInCosts',
    module: 'living',
    feature: 'living.tools',
    method: 'post',
    path: '/v1/tools/move-in-cost/estimates',
    summary: 'Estimate move-in costs',
    description:
      'Deterministic calculation from user-entered terms. Anonymous use is allowed and nothing is stored. An unsupported scenario returns 200 with `outcome: "unsupported"` and no amounts; it is never an estimate of zero.',
    auth: 'optional',
    pure: true,
    request: { body: MoveInCostEstimateInput },
    responses: { 200: { description: 'An estimate, or an explicit unsupported outcome.', schema: MoveInCostEstimate } },
    requiredScenarios: ['unsupported_scenario', 'validation_failed'],
  }),
  defineOperation({
    operationId: 'listMyTasks',
    module: 'living',
    feature: 'living.my_life',
    method: 'get',
    path: '/v1/me/tasks',
    summary: 'My tasks',
    description: 'Sorted by due date (tasks without one last), then `created_at`; stable across pages. Private: served with `Cache-Control: private, no-store`.',
    auth: 'required',
    request: { query: PageQuery.extend({ status: MyTaskStatus.optional(), journey: MyLifeJourney.optional() }) },
    responses: { 200: { description: 'A page of the member’s private tasks.', schema: MyTaskPage } },
    requiredScenarios: ['empty'],
  }),
  defineOperation({
    operationId: 'createMyTask',
    module: 'living',
    feature: 'living.my_life',
    method: 'post',
    path: '/v1/me/tasks',
    summary: 'Create a task',
    description: 'Creates a private task. From a guide suggestion, the server records the guide revision and rule version and, with `derive_from_rule`, computes the due date.',
    auth: 'required',
    idempotent: true,
    request: { body: MyTaskInput },
    responses: { 201: { description: 'Task created at revision 1.', schema: MyTask, headers: etag } },
    requiredScenarios: ['from_guide_suggestion', 'validation_failed'],
  }),
  defineOperation({
    operationId: 'updateMyTask',
    module: 'living',
    feature: 'living.my_life',
    method: 'patch',
    path: '/v1/me/tasks/{task_id}',
    summary: 'Update a task',
    description: 'Returns 404 unless the viewer owns the task. `derive_from_rule` on a task whose origin is not `rule_derived` fails validation.',
    auth: 'required',
    ifMatch: true,
    request: { params: z.object({ task_id: id('task') }), body: MyTaskPatchInput },
    responses: { 200: { description: 'The task at its new revision.', schema: MyTask, headers: etag } },
    requiredScenarios: ['not_found', 'revision_conflict'],
  }),
  defineOperation({
    operationId: 'getMyTask',
    module: 'living',
    feature: 'living.my_life',
    method: 'get',
    path: '/v1/me/tasks/{task_id}',
    summary: 'A task',
    description: 'Returns 404 unless the viewer owns the task. Use after a 412 `revision_conflict` to reload the current revision.',
    auth: 'required',
    request: { params: z.object({ task_id: id('task') }) },
    responses: { 200: { description: 'The private task.', schema: MyTask, headers: etag } },
    requiredScenarios: ['not_found'],
  }),
  defineOperation({
    operationId: 'deleteMyTask',
    module: 'living',
    feature: 'living.my_life',
    method: 'delete',
    path: '/v1/me/tasks/{task_id}',
    summary: 'Delete a task',
    description: 'Permanently deletes the private task and its reminders. Dismissing (status `dismissed`) keeps it; deleting does not. Deleting an already-deleted task returns 404.',
    auth: 'required',
    request: { params: z.object({ task_id: id('task') }) },
    responses: { 204: { description: 'Deleted.' } },
    requiredScenarios: ['not_found'],
  }),
];
