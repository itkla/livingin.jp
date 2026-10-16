import { ApproximateArea, CalendarDate, Coverage, Freshness, id, Instant, knowable, LocalityRef, LocalizedText, Money, page, PageQuery, SourceRef, TimeZone } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';
import { Organization } from './identity';

// Activation of both work features is held on the operating-model review (#30): job-information
// versus placement classification, applicant-data boundaries and handoff tracking. The contract
// deliberately has no employer-facing applicant workflow, candidate sharing or matching.

const HELD_NOTE = 'Activation is held pending the Work operating-model review (#30); the mock server serves fixtures regardless.';

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export const JobCategory = z
  .enum([
    'hospitality',
    'food_service',
    'retail',
    'logistics',
    'manufacturing',
    'construction',
    'care_and_healthcare',
    'engineering',
    'it_software',
    'education',
    'customer_support',
    'office_admin',
    'agriculture_fishery',
    'cleaning_facilities',
    'other',
  ])
  .openapi('JobCategory', { description: 'Broad occupational grouping for browsing. Not a status-of-residence category and says nothing about who may lawfully take the job.' });

export const JobEmploymentType = z
  .enum(['full_time', 'contract', 'part_time', 'dispatch'])
  .openapi('JobEmploymentType', {
    description:
      '`full_time`: 正社員 (seishain), a regular employee, normally without a fixed term. `contract`: 契約社員, a fixed-term contract, usually full-time hours. `part_time`: パート・アルバイト. `dispatch`: 派遣社員, employed by a dispatch agency and placed with a host company; used exactly when `hiring_arrangement.kind` is `dispatch`. As reported by the submitter.',
  });

export const JobWorkArrangement = z.enum(['onsite', 'hybrid', 'remote']).openapi('JobWorkArrangement');

export const JobLanguageLevel = z
  .enum(['none', 'basic', 'conversational', 'business', 'fluent'])
  .openapi('JobLanguageLevel', {
    description:
      'Ordered from lowest to highest. `none`: not needed. `basic`: greetings and simple instructions. `conversational`: everyday workplace conversation. `business`: meetings, phone calls and written communication. `fluent`: near-native, including formal documents. Certificates such as JLPT levels are stated separately and only when the employer asks for one.',
  });

// ---------------------------------------------------------------------------
// Hiring arrangement: who the employer actually is
// ---------------------------------------------------------------------------

export const JobHiringArrangement = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('direct'), employer: Organization.openapi({ description: 'The organization you would sign an employment contract with.' }) })
      .openapi({ description: 'The employer posts its own vacancy.' }),
    z
      .object({
        kind: z.literal('placement_agency'),
        agency: Organization.openapi({ description: 'The agency (職業紹介) that introduces candidates. It is not the employer.' }),
        employer: knowable(Organization).openapi({ description: 'The client company you would sign an employment contract with. `unknown` when the agency has not disclosed it in the listing.' }),
      })
      .openapi({ description: 'A placement agency introduces candidates; the employment contract is with the client employer.' }),
    z
      .object({
        kind: z.literal('dispatch'),
        agency: Organization.openapi({ description: 'The dispatch agency (派遣元). It is the employer of record: the employment contract and pay come from the agency.' }),
        host_company: knowable(Organization).openapi({ description: 'Where the work is performed and directed (派遣先). `unknown` when the agency has not disclosed it.' }),
      })
      .openapi({ description: 'Worker dispatch (派遣, haken): employed by the agency, working at a host company.' }),
  ])
  .openapi('JobHiringArrangement', {
    description: 'Direct, agency-introduced or dispatched employment, as reported by the submitter. Organization `verification` confirms who controls the record; it is not an endorsement, licence check or quality assessment.',
  });

// ---------------------------------------------------------------------------
// Compensation: every component separately knowable; no computed total
// ---------------------------------------------------------------------------

export const JobPayPeriod = z.enum(['hourly', 'daily', 'monthly', 'annual']).openapi('JobPayPeriod');

export const JobPayAmount = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('fixed'), amount: Money }),
    z.object({ kind: z.literal('range'), min: Money, max: Money }),
    z.object({ kind: z.literal('minimum_only'), min: Money }).openapi({ description: 'Only a starting figure was stated (e.g. 「25万円〜」). There is no implied upper bound.' }),
  ])
  .openapi('JobPayAmount');

export const JobBasePay = z
  .object({ amount: JobPayAmount, period: JobPayPeriod })
  .openapi('JobBasePay', { description: 'Gross base pay before deductions. When `overtime.fixed_overtime.kind` is `included_in_base_pay`, this figure already includes that fixed overtime pay.' });

export const JobAllowance = z
  .object({
    name: z.object({ ja: z.string(), reading: z.string().optional(), en: z.string() }).openapi({ description: 'e.g. 夜勤手当 / やきんてあて / night-shift allowance.' }),
    amount: knowable(z.object({ amount: Money, per: z.enum(['hour', 'shift', 'day', 'month', 'year', 'one_time']) })),
    condition: z.string().nullable().openapi({ description: 'Eligibility condition as stated. `null`: no condition stated.' }),
  })
  .openapi('JobAllowance');

export const JobBonus = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }).openapi({ description: 'The submitter states that no bonus is paid.' }),
    z.object({
      kind: z.literal('offered'),
      description: z.string(),
      previous_year_months: knowable(z.number().positive()).openapi({ description: 'Bonus paid last year in months of monthly base pay, as reported. A reference figure, not a promise.' }),
    }),
  ])
  .openapi('JobBonus');

export const JobCommutingAllowance = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('actual_cost') }).openapi({ description: 'Commuting costs reimbursed in full.' }),
    z.object({ kind: z.literal('capped'), monthly_cap: Money }),
  ])
  .openapi('JobCommutingAllowance', { description: '交通費 (kōtsūhi). `not_applicable` for fully remote work.' });

export const JobOvertime = z
  .object({
    expected_monthly_hours: knowable(z.number().min(0)).openapi({ description: 'Typical overtime hours per month, as reported.' }),
    fixed_overtime: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('none') }),
        z.object({
          kind: z.literal('included_in_base_pay'),
          hours_per_month: z.number().positive(),
          amount: Money,
          excess_paid_separately: z.boolean().openapi({ description: 'Whether the submitter states that overtime beyond `hours_per_month` is paid on top.' }),
        }),
      ])
      .openapi({ description: '固定残業代 (fixed overtime pay): a set amount of overtime pay included in the base pay figure.' }),
  })
  .openapi('JobOvertime');

export const JobHousingSupport = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('company_housing'), employee_monthly_cost: knowable(Money), description: z.string().nullable() }).openapi({ description: '社宅 or 寮: housing provided by the employer.' }),
    z.object({ kind: z.literal('rent_subsidy'), monthly_amount: knowable(Money), conditions: z.string().nullable() }).openapi({ description: '住宅手当. Listed here, not in `allowances`.' }),
  ])
  .openapi('JobHousingSupport');

export const JobCompensation = z
  .object({
    base_pay: knowable(JobBasePay),
    allowances: knowable(z.array(JobAllowance)).openapi({ description: '`known` with an empty list: the submitter states there are no allowances. `unknown`: not stated.' }),
    bonus: knowable(JobBonus),
    commuting_allowance: knowable(JobCommutingAllowance),
    overtime: knowable(JobOvertime),
    housing_support: knowable(JobHousingSupport),
  })
  .openapi('JobCompensation', {
    description: 'Each component as reported by the submitter. livingin.jp does not compute a total or an estimate: an `unknown` component is never treated as zero.',
  });

// ---------------------------------------------------------------------------
// Contract, language, location, schedule
// ---------------------------------------------------------------------------

export const JobContractTerms = z
  .object({
    term: knowable(z.discriminatedUnion('kind', [z.object({ kind: z.literal('indefinite') }), z.object({ kind: z.literal('fixed_term'), months: z.int().min(1) })])),
    renewal: knowable(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('may_be_renewed'), criteria: z.string().nullable() }),
        z.object({ kind: z.literal('not_renewed') }),
      ]),
    ).openapi({ description: '`not_applicable` for an indefinite contract.' }),
    probation: knowable(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('none') }),
        z.object({
          kind: z.literal('probation'),
          months: z.int().min(1),
          conditions_differ: z.boolean().openapi({ description: 'Whether pay or conditions during probation differ from those listed.' }),
          note: z.string().nullable(),
        }),
      ]),
    ),
    start: knowable(z.discriminatedUnion('kind', [z.object({ kind: z.literal('on_date'), date: CalendarDate }), z.object({ kind: z.literal('negotiable') })])),
  })
  .openapi('JobContractTerms');

const LEVEL_ORDER = JobLanguageLevel.options;

export const JobLanguageExpectation = z
  .object({
    lang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/).openapi({ description: 'BCP 47 language tag of the working language, e.g. `ja`, `en`, `vi`.', example: 'ja' }),
    required_level: JobLanguageLevel,
    preferred_level: JobLanguageLevel.nullable().openapi({ description: 'A higher level the employer would welcome. `null`: none stated.' }),
    certificate: z.string().max(60).nullable().openapi({ description: 'Certificate the employer asks for, e.g. "JLPT N2". `null`: no certificate requested.' }),
  })
  .refine((e) => e.preferred_level === null || LEVEL_ORDER.indexOf(e.preferred_level) > LEVEL_ORDER.indexOf(e.required_level), {
    message: 'preferred_level must be higher than required_level',
    path: ['preferred_level'],
  })
  .openapi('JobLanguageExpectation');

const LanguageExpectations = knowable(
  z
    .array(JobLanguageExpectation)
    .min(1)
    .refine((list) => list.some((e) => e.lang === 'ja'), { message: 'A known list always states the Japanese expectation' })
    .refine((list) => new Set(list.map((e) => e.lang)).size === list.length, { message: 'One entry per language' }),
).openapi({ description: 'Employer-reported working-language expectations. When `known`, the list always contains a `ja` entry (which may be `required_level: none`).' });

export const JobLocation = z
  .discriminatedUnion('arrangement', [
    z.object({ arrangement: z.literal('onsite'), workplace: ApproximateArea }),
    z.object({ arrangement: z.literal('hybrid'), workplace: ApproximateArea, onsite_days_per_week: knowable(z.number().min(0).max(7)) }),
    z.object({
      arrangement: z.literal('remote'),
      eligible_area: LocalityRef.openapi({ description: 'Where the worker must live or be based, e.g. `JP` for anywhere in Japan.' }),
    }),
  ])
  .openapi('JobLocation', { description: 'Workplace jurisdiction and coarse area. Never a street address in public payloads.' });

export const JobSchedule = z
  .object({
    pattern: knowable(z.enum(['fixed_hours', 'shifts', 'flextime', 'discretionary'])).openapi({ description: '`discretionary`: 裁量労働制, hours are not fixed by the employer.' }),
    weekly_hours: knowable(z.number().positive().max(80)),
    hours_description: knowable(z.string()).openapi({ description: 'Working hours and breaks as stated, e.g. "Shifts between 07:00 and 23:00, 8 hours including a 1-hour break".' }),
    annual_holidays: knowable(z.int().min(0).max(366)).openapi({ description: '年間休日: days off per year, as reported.' }),
    time_zone: TimeZone.openapi({ description: 'Zone for any clock times in `hours_description`.' }),
  })
  .openapi('JobSchedule');

// ---------------------------------------------------------------------------
// Immigration assistance (reported only)
// ---------------------------------------------------------------------------

export const JobImmigrationSupport = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }).openapi({ description: 'The employer reports that it does not offer help with residence procedures.' }),
    z.object({
      kind: z.literal('offered'),
      support: z
        .array(z.enum(['certificate_of_eligibility', 'change_of_status', 'period_of_stay_extension', 'document_preparation', 'application_fees_covered']))
        .min(1)
        .openapi({ description: 'Kinds of help the employer says it offers with residence procedures.' }),
      note: z.string().nullable(),
    }),
  ])
  .openapi('JobImmigrationSupport');

export const JobImmigrationAssistance = knowable(JobImmigrationSupport)
  .refine((v) => v.status !== 'known' || v.basis === 'reported', { message: 'Immigration assistance is only ever employer-reported', path: ['basis'] })
  .openapi('JobImmigrationAssistance', {
    description:
      'What the employer or agency says about help with residence procedures. When `known`, `basis` is always `reported`: livingin.jp has not checked it. livingin.jp does not guarantee visa sponsorship or any immigration outcome, and this field never means that a person is permitted to take this job; whether a status of residence allows particular work is decided by the immigration authorities.',
  });

// ---------------------------------------------------------------------------
// Provenance, vacancy and handoff
// ---------------------------------------------------------------------------

export const JobRecordSource = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('employer_submission'),
      organization_id: id('organization').openapi({ description: 'The employer or agency that submitted the record.' }),
      submitted_at: Instant,
    }),
    z.object({ kind: z.literal('authorized_feed'), source: SourceRef, external_reference: z.string().nullable().openapi({ description: 'The feed’s own identifier for the vacancy.' }) }),
  ])
  .openapi('JobRecordSource', { description: 'Where this record came from. livingin.jp lists only direct submissions and feeds it is authorized to use.' });

export const JobVacancy = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('open'),
      application_deadline: knowable(CalendarDate).openapi({ description: 'Calendar date in Asia/Tokyo. `not_applicable`: open until filled.' }),
    }),
    z.object({ status: z.literal('closed'), closed_at: Instant, reason: z.enum(['filled', 'deadline_passed', 'closed_by_submitter']) }),
    z.object({ status: z.literal('withdrawn'), withdrawn_at: Instant, reason: z.enum(['withdrawn_by_submitter', 'removed_from_feed']) }),
  ])
  .openapi('JobVacancy', {
    description: 'Last status reported by the submitter. Read it with `freshness`: a stale `open` vacancy may already be filled. `withdrawn`: the record was explicitly taken down and is no longer active.',
  });

export const JobApplyRoute = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('external_handoff'),
      url: z.url(),
      label: z.string().openapi({ example: 'Apply on Example Staffing’s site' }),
      operated_by: z.enum(['employer', 'agency', 'feed_provider']),
      note: z.string().openapi({ description: 'Display text stating that opening the link does not submit an application.' }),
    }),
    z.object({ status: z.literal('none'), reason: z.enum(['vacancy_closed', 'vacancy_withdrawn']) }),
  ])
  .openapi('JobApplyRoute', {
    description: 'Applications are made outside livingin.jp. Opening the handoff does not submit an application, and livingin.jp sends no applicant details to the employer or agency.',
  });

// ---------------------------------------------------------------------------
// Job records
// ---------------------------------------------------------------------------

const dispatchConsistent = (j: { employment_type: string; hiring_arrangement: { kind: string } }) => (j.employment_type === 'dispatch') === (j.hiring_arrangement.kind === 'dispatch');
const dispatchMessage = { message: 'employment_type is dispatch exactly when hiring_arrangement.kind is dispatch', path: ['employment_type'] };

export const JobSummary = z
  .object({
    id: id('job'),
    title: LocalizedText,
    category: JobCategory,
    employment_type: JobEmploymentType,
    hiring_arrangement: JobHiringArrangement,
    location: JobLocation,
    base_pay: knowable(JobBasePay),
    japanese_required_level: knowable(JobLanguageLevel).openapi({ description: 'The `ja` entry’s `required_level`; `unknown` when language expectations are unknown.' }),
    vacancy: JobVacancy,
    freshness: Freshness,
    source_kind: z.enum(['employer_submission', 'authorized_feed']),
    posted_at: Instant,
  })
  .refine(dispatchConsistent, dispatchMessage)
  .openapi('JobSummary', { description: 'Card-sized job record. Contains no quality rating or score.' });

export const Job = z
  .object({
    id: id('job'),
    title: LocalizedText,
    description: LocalizedText,
    category: JobCategory,
    employment_type: JobEmploymentType,
    hiring_arrangement: JobHiringArrangement,
    compensation: JobCompensation,
    contract_terms: JobContractTerms,
    language_expectations: LanguageExpectations,
    location: JobLocation,
    schedule: JobSchedule,
    immigration_assistance: JobImmigrationAssistance,
    source: JobRecordSource,
    freshness: Freshness,
    vacancy: JobVacancy,
    apply_route: JobApplyRoute,
    posted_at: Instant,
    updated_at: Instant,
    viewer: z
      .object({ application_id: id('application').nullable().openapi({ description: 'The viewer’s own private tracking record for this job, if any. Never visible to the employer or agency.' }) })
      .nullable()
      .openapi({ description: '`null` for anonymous viewers. Responses with a non-null `viewer` are private and must not be cached publicly.' }),
  })
  .refine(dispatchConsistent, dispatchMessage)
  .openapi('Job', {
    description:
      'A job record with transparent, separately knowable conditions. Conditions are stated by the employer or agency (directly or through an authorized feed) and are not verified by livingin.jp. No job-quality verdict, score or endorsement is expressed.',
  });

export const JobSearchResult = page(JobSummary)
  .extend({ coverage: Coverage })
  .openapi('JobSearchResult', {
    description: 'Open vacancies only. Coverage is always at least `partial`: livingin.jp lists direct submissions and authorized feeds, not the whole job market, so an empty page does not mean no such jobs exist.',
  });

// ---------------------------------------------------------------------------
// Career workspace: private application tracking
// ---------------------------------------------------------------------------

export const JobApplicationStage = z
  .enum(['saved', 'preparing', 'external_handoff_opened', 'submitted', 'interviewing', 'offer', 'accepted', 'declined', 'rejected', 'withdrawn'])
  .openapi('JobApplicationStage', {
    description:
      'Private tracking stage. `external_handoff_opened`: the member opened the external apply route; this is NOT a submitted application, and livingin.jp cannot see whether one was sent. `submitted`: the member says they applied outside livingin.jp; only ever set by the member. `declined`: the member turned down an offer. `rejected`: the member reports the employer said no. `withdrawn`: the member withdrew. `accepted`, `declined`, `rejected` and `withdrawn` are terminal for reminders, but the member may still change the stage to correct a mistake.',
  });

export const JobApplicationStageChange = z
  .discriminatedUnion('set_by', [
    z.object({ set_by: z.literal('member'), stage: JobApplicationStage, at: Instant }),
    z.object({ set_by: z.literal('system_handoff_click'), stage: z.literal('external_handoff_opened'), at: Instant }).openapi({
      description: 'Recorded when the signed-in member opened this job’s apply handoff from livingin.jp. The system only ever records `external_handoff_opened`, only from `saved` or `preparing`, and never records `submitted` or any later stage.',
    }),
  ])
  .openapi('JobApplicationStageChange');

export const JobApplicationJobSnapshot = z
  .object({
    title: z.string(),
    employer_name: z.string().openapi({ description: 'As the member entered or saw it, e.g. "Undisclosed client (via Example Career Partners)". Not verified and not linked to an organization record.' }),
    url: z.url().nullable().openapi({ description: 'Where the member found the job, if recorded. Never fetched or checked by livingin.jp.' }),
    captured_at: Instant,
  })
  .openapi('JobApplicationJobSnapshot', { description: 'Kept as captured, so later edits, closure or withdrawal of a listing do not rewrite the member’s record.' });

export const JobApplicationNextAction = z
  .object({ description: z.string(), due_on: CalendarDate.nullable().openapi({ description: 'Asia/Tokyo calendar date. `null`: no due date set.' }) })
  .openapi('JobApplicationNextAction');

export const JobApplication = z
  .object({
    id: id('application'),
    revision: z.int().min(1).openapi({ description: 'Send as `If-Match: "<revision>"` when updating.' }),
    job_id: id('job').nullable().openapi({ description: 'The livingin.jp job being tracked. `null` for a job found elsewhere.' }),
    job_snapshot: JobApplicationJobSnapshot,
    stage: JobApplicationStage.openapi({ description: 'Equals the stage of the last `stage_history` entry.' }),
    stage_history: z.array(JobApplicationStageChange).min(1).openapi({ description: 'Oldest first.' }),
    next_action: JobApplicationNextAction.nullable().openapi({ description: '`null`: no next action set.' }),
    notes: z.string().openapi({ description: 'Private notes. Empty string when none.' }),
    created_at: Instant,
    updated_at: Instant,
  })
  .openapi('JobApplication', {
    description: 'A member’s private tracking record for one job. Only ever returned to its owner; never shared with employers, agencies or other members, and never part of a public profile.',
  });

export const JobApplicationPage = page(JobApplication).openapi('JobApplicationPage');

const NextActionInput = z
  .object({ description: z.string().trim().min(1).max(200), due_on: CalendarDate.nullable() })
  .strict()
  .openapi('JobApplicationNextActionInput');

export const JobApplicationCreateInput = z
  .object({
    job_id: id('job').optional().openapi({ description: 'Track a livingin.jp job. Closed and withdrawn jobs can still be tracked.' }),
    title: z.string().trim().min(1).max(200).optional().openapi({ description: 'Required without `job_id`. Defaults to the job’s title.' }),
    employer_name: z.string().trim().min(1).max(200).optional().openapi({ description: 'Required without `job_id`. Defaults to the employer or agency name shown on the job.' }),
    url: z.url().max(2000).optional(),
    stage: JobApplicationStage.default('saved'),
    next_action: NextActionInput.optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict()
  .refine((v) => v.job_id !== undefined || (v.title !== undefined && v.employer_name !== undefined), {
    message: 'Give a job_id, or a title and employer_name for a job found elsewhere',
    path: ['title'],
  })
  .openapi('JobApplicationCreateInput', { description: 'The initial stage is recorded as set by the member.' });

export const JobApplicationPatchInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    employer_name: z.string().trim().min(1).max(200),
    url: z.url().max(2000).nullable(),
    stage: JobApplicationStage,
    next_action: NextActionInput.nullable(),
    notes: z.string().max(5000),
  })
  .partial()
  .strict()
  .openapi('JobApplicationPatchInput', { description: 'Fields to replace. Changing `stage` appends a `stage_history` entry set by the member; any stage may be chosen. `job_id` cannot change.' });

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const etag = { ETag: { description: 'Current revision, e.g. `"3"`.', required: true } };

export const workOperations = [
  defineOperation({
    operationId: 'listJobs',
    module: 'work',
    feature: 'work.jobs',
    method: 'get',
    path: '/v1/jobs',
    summary: 'Search job listings',
    description: `Open vacancies, most recently posted first (stable across pages). Stale records stay listed with \`freshness.state = stale\`. ${HELD_NOTE}`,
    auth: 'optional',
    request: {
      query: PageQuery.extend({
        locality: z.string().regex(/^JP-\d{2}(-\d{3})?$/).optional().openapi({ description: 'Prefecture or municipality code. Matches workplaces in that jurisdiction and remote jobs whose eligible area contains it.' }),
        work_arrangement: JobWorkArrangement.optional(),
        employment_type: JobEmploymentType.optional(),
        japanese_level: JobLanguageLevel.optional().openapi({ description: 'Highest Japanese level the searcher wants to be required. Jobs requiring more are excluded, and so are jobs whose Japanese expectation is unknown (unknown is never treated as `none`).' }),
        q: z.string().max(200).optional().openapi({ description: 'Free text over titles and descriptions, with Japanese/English aliases.' }),
      }),
    },
    responses: { 200: { description: 'A page of job summaries with coverage.', schema: JobSearchResult } },
    requiredScenarios: ['empty'],
  }),
  defineOperation({
    operationId: 'getJob',
    module: 'work',
    feature: 'work.jobs',
    method: 'get',
    path: '/v1/jobs/{job_id}',
    summary: 'Job record',
    description: `Closed and withdrawn records still return 200 so saved links and tracked applications can explain what happened; their apply route is \`none\`. Unknown jobs and records removed for policy reasons return 404. ${HELD_NOTE}`,
    auth: 'optional',
    request: { params: z.object({ job_id: id('job') }) },
    responses: { 200: { description: 'A job record.', schema: Job } },
    requiredScenarios: ['direct_employer', 'stale_vacancy', 'closed', 'withdrawn', 'not_found'],
  }),
  defineOperation({
    operationId: 'listMyApplications',
    module: 'work',
    feature: 'work.career_workspace',
    method: 'get',
    path: '/v1/me/applications',
    summary: 'My tracked applications',
    description: `The signed-in member’s private application tracking, most recently updated first. Each item’s \`revision\` is its If-Match value. ${HELD_NOTE}`,
    auth: 'required',
    request: { query: PageQuery.extend({ stage: JobApplicationStage.optional() }) },
    responses: { 200: { description: 'A page of the member’s tracking records.', schema: JobApplicationPage } },
    requiredScenarios: ['empty'],
  }),
  defineOperation({
    operationId: 'createMyApplication',
    module: 'work',
    feature: 'work.career_workspace',
    method: 'post',
    path: '/v1/me/applications',
    summary: 'Start tracking an application',
    description: `Creates a private tracking record; it never submits anything to an employer or agency. 400 \`validation_failed\` with code \`unknown_job\` when \`job_id\` does not name a job. 409 \`conflict\` when the member already tracks that \`job_id\`. ${HELD_NOTE}`,
    auth: 'required',
    idempotent: true,
    request: { body: JobApplicationCreateInput },
    responses: { 201: { description: 'Tracking record created at revision 1.', schema: JobApplication, headers: etag } },
    errors: ['conflict'],
    requiredScenarios: ['validation_failed', 'already_tracked'],
  }),
  defineOperation({
    operationId: 'updateMyApplication',
    module: 'work',
    feature: 'work.career_workspace',
    method: 'patch',
    path: '/v1/me/applications/{application_id}',
    summary: 'Update a tracked application',
    description: `Returns 404 unless the viewer owns the record. ${HELD_NOTE}`,
    auth: 'required',
    ifMatch: true,
    request: { params: z.object({ application_id: id('application') }), body: JobApplicationPatchInput },
    responses: { 200: { description: 'The record at its new revision.', schema: JobApplication, headers: etag } },
    requiredScenarios: ['not_found', 'revision_conflict'],
  }),
  defineOperation({
    operationId: 'getMyApplication',
    module: 'work',
    feature: 'work.career_workspace',
    method: 'get',
    path: '/v1/me/applications/{application_id}',
    summary: 'A tracked application',
    description: `Returns 404 unless the viewer owns the record. Use after a 412 \`revision_conflict\` to reload the current revision. ${HELD_NOTE}`,
    auth: 'required',
    request: { params: z.object({ application_id: id('application') }) },
    responses: { 200: { description: 'The private application record.', schema: JobApplication, headers: etag } },
    requiredScenarios: ['not_found'],
  }),
  defineOperation({
    operationId: 'deleteMyApplication',
    module: 'work',
    feature: 'work.career_workspace',
    method: 'delete',
    path: '/v1/me/applications/{application_id}',
    summary: 'Delete a tracked application',
    description: `Permanently deletes the private record, its stage history, notes and reminders. Naturally idempotent: deleting an already-deleted record returns 404. ${HELD_NOTE}`,
    auth: 'required',
    request: { params: z.object({ application_id: id('application') }) },
    responses: { 204: { description: 'Deleted.' } },
    requiredScenarios: ['not_found'],
  }),
];
