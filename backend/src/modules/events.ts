import { ApproximateArea, CalendarDate, Coverage, Freshness, id, Instant, knowable, LocalizedText, Money, page, PageQuery, SourceRef, TimeZone } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';
import { GroupRef } from './community';
import { Organization, ProfileSummary } from './identity';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const LanguageTag = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/).openapi({ description: 'BCP 47 language tag, e.g. `ja`, `en`.', example: 'ja' });
const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).openapi({ description: 'Wall-clock time (HH:MM) in the accompanying time zone.', example: '09:00' });

export const EventSourceKind = z
  .enum(['member', 'group', 'organization', 'imported'])
  .openapi('EventSourceKind', {
    description:
      'Where the record comes from. `member`, `group`, `organization`: created on livingin.jp by that kind of organizer. `imported`: normalized from an external calendar (e.g. a pilot municipality, #44), whatever the organizer is.',
  });

export const EventFormat = z.enum(['in_person', 'online', 'hybrid']).openapi('EventFormat', { description: 'Always matches `location.kind` on the full event.' });

export const EventConfirmation = z
  .enum(['confirmed', 'expected'])
  .openapi('EventConfirmation', {
    description:
      '`confirmed`: the organizer or source announced this specific occurrence. `expected`: projected from a recurring announcement (the series rule). An expected occurrence is not proof that it will happen, and RSVPs open only once it is confirmed. Read together with `status`: a cancelled occurrence can be confirmed (the cancellation was announced).',
  });

export const EventOrganizer = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('member'), profile: ProfileSummary }),
    z.object({ kind: z.literal('group'), group: GroupRef }),
    z.object({ kind: z.literal('organization'), organization: Organization }),
    z.object({
      kind: z.literal('imported'),
      name: z.string().openapi({ description: 'Organizer name as published by the source. Not a livingin.jp organization record and not verified.' }),
      source: SourceRef,
    }),
  ])
  .openapi('EventOrganizer', { description: 'Who runs the event. Separate from provenance: an imported record can name an organization, and the calendar it came from is not necessarily the organizer.' });

export const EventProvenance = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('native'),
      created_by: z.enum(['member', 'group', 'organization']).openapi({ description: 'Which kind of organizer created the record on livingin.jp.' }),
      created_at: Instant,
    }),
    z.object({
      kind: z.literal('imported'),
      source: SourceRef,
      source_record_key: z.string().openapi({ description: 'The source’s own identifier for this record, kept for deduplication and change tracking.' }),
      freshness: Freshness.openapi({ description: '`checked_at` is when livingin.jp last checked the source. `stale` means the source could not be confirmed recently; dates and cancellations may be out of date.' }),
    }),
  ])
  .openapi('EventProvenance', {
    description: 'Where the record came from. Imported records keep their source and are re-checked; conflicting facts from different sources go to review rather than silently overwriting each other.',
  });

export const EventTiming = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('timed'),
      starts_at: Instant,
      ends_at: knowable(Instant).openapi({ description: '`unknown` when the organizer or source gave only a start time. Never invented.' }),
      time_zone: TimeZone,
    }),
    z.object({
      kind: z.literal('all_day'),
      start_date: CalendarDate,
      end_date: CalendarDate.openapi({ description: 'Inclusive. Equal to `start_date` for a one-day event.' }),
      time_zone: TimeZone,
    }),
  ])
  .openapi('EventTiming', { description: 'Instants are UTC; `time_zone` (normally Asia/Tokyo) is the zone the organizer scheduled in. All-day dates are calendar dates, never midnight instants.' });

const Reason = knowable(z.string()).openapi({ description: 'Reason given by the organizer (`reported`) or source (`source_derived`); `unknown` when none was given.' });

export const EventStatus = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('scheduled') }),
    z.object({ state: z.literal('cancelled'), cancelled_at: Instant, reason: Reason }),
    z.object({
      state: z.literal('rescheduled'),
      rescheduled_at: Instant,
      moved_to_event_id: id('event').openapi({ description: 'The replacement occurrence. RSVPs do not transfer automatically; participants are notified and RSVP to the new occurrence.' }),
      reason: Reason,
    }),
    z.object({ state: z.literal('postponed'), postponed_at: Instant, reason: Reason }),
  ])
  .openapi('EventStatus', {
    description:
      'Lifecycle of one occurrence. `postponed`: called off for now with no new date yet; it becomes `rescheduled` once a new occurrence is announced. Cancelled and rescheduled occurrences remain readable. Cancellations and reschedules are sent to everyone with an active RSVP and everyone who saved the event through the urgent notification lane — never held in moderation or marketplace batches. Only the organizer (or, for imported events, the source) can cancel; weather alone never cancels an event automatically.',
  });

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export const EventVenue = z
  .object({
    name: z.string(),
    area: ApproximateArea,
    address: knowable(z.string()).openapi({
      description: 'Street address of a public venue (hall, park, café). `not_applicable` for places without one, such as a trail. Member-hosted events never publish a private home address.',
    }),
  })
  .openapi('EventVenue', { description: 'Where the activity itself takes place.' });

export const EventMeetingPoint = z
  .object({ name: z.string(), area: ApproximateArea, details: z.string() })
  .openapi('EventMeetingPoint', { description: 'Where participants gather, when that differs from the venue (e.g. a hike meets at a station but the venue is a trail). The event starts here at the start time.' });

export const EventOnlineAccess = z
  .object({
    platform: z.string().openapi({ description: 'Organizer-stated platform or method, e.g. a video-call service.' }),
    join: z
      .discriminatedUnion('status', [
        z.object({ status: z.literal('available'), url: z.url(), instructions: z.string().nullable() }),
        z.object({ status: z.literal('participants_only') }),
        z.object({ status: z.literal('via_external_registration') }),
      ])
      .openapi({
        description:
          '`available`: shown only to viewers whose RSVP is `going` (responses containing it are private and never publicly cached). `participants_only`: the viewer is not a confirmed participant. `via_external_registration`: the organizer sends access details after registering on their site.',
      }),
  })
  .openapi('EventOnlineAccess');

export const EventLocation = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('in_person'), venue: EventVenue, meeting_point: EventMeetingPoint.nullable().openapi({ description: '`null` when participants meet at the venue.' }) }),
    z.object({ kind: z.literal('online'), online: EventOnlineAccess }),
    z.object({ kind: z.literal('hybrid'), venue: EventVenue, meeting_point: EventMeetingPoint.nullable().openapi({ description: '`null` when participants meet at the venue.' }), online: EventOnlineAccess }),
  ])
  .openapi('EventLocation', { description: 'Venue and meeting point are distinct. Online-only events have no locality.' });

// ---------------------------------------------------------------------------
// Participation, capacity, cost and requirements
// ---------------------------------------------------------------------------

export const EventParticipation = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('rsvp_open') }),
    z.object({ kind: z.literal('rsvp_approval') }),
    z.object({
      kind: z.literal('external_registration'),
      url: z.url().openapi({ description: 'The organizer’s own registration page.' }),
      registration_deadline: knowable(CalendarDate),
      registration_tracking: z.enum(['not_tracked']).openapi({ description: 'livingin.jp never knows whether the viewer registered externally. Saving the event is a bookmark, not a registration or reservation.' }),
      notice: z.string().openapi({ description: 'Safe, human-readable explanation that saving the event is not registering.' }),
    }),
    z.object({ kind: z.literal('no_registration_needed') }),
  ])
  .openapi('EventParticipation', {
    description:
      '`rsvp_open`: joining is immediate while places remain, then the waitlist. `rsvp_approval`: the organizer approves each request. `external_registration`: register with the organizer, not on livingin.jp. `no_registration_needed`: just turn up.',
  });

export const EventCapacity = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('limited'),
      limit: z.int().min(1),
      going_count: z.int().min(0),
      offered_count: z.int().min(0).openapi({ description: 'Places held for waitlisted members who have an unexpired offer.' }),
      waitlist_count: z.int().min(0),
    }),
    z.object({ kind: z.literal('unlimited'), going_count: z.int().min(0) }),
    z.object({
      kind: z.literal('not_tracked'),
      stated_limit: knowable(z.int().min(1)).openapi({ description: 'Capacity stated by the organizer or source, if any. livingin.jp does not know how many places remain.' }),
    }),
  ])
  .openapi('EventCapacity', {
    description: 'Places are allocated atomically: `going_count + offered_count` never exceeds `limit`, and once they reach it new RSVPs join the waitlist. `not_tracked`: attendance is handled outside livingin.jp.',
  });

export const EventCost = z
  .discriminatedUnion('kind', [z.object({ kind: z.literal('free') }), z.object({ kind: z.literal('fee'), amount: Money, note: z.string().nullable() })])
  .openapi('EventCost', { description: 'Participation cost. Paid to the organizer; livingin.jp handles no payments. Wrapped in a Knowable so unknown is never shown as free.' });

export const EventOrganizerRequirements = z
  .object({
    basis: z.enum(['organizer_provided']).openapi({ description: 'Everything here is stated by the organizer.' }),
    safety_certification: z.enum(['none']).openapi({ description: 'livingin.jp does not assess or certify routes, difficulty, fitness, gear or safety. More values may be added only if such a review is introduced.' }),
    difficulty: knowable(z.string()),
    duration_minutes: knowable(z.int().min(1)),
    fitness: knowable(z.string()),
    gear: knowable(z.array(z.string()).min(1)),
    transport: knowable(z.string()),
    cancellation_policy: knowable(z.string()),
  })
  .openapi('EventOrganizerRequirements', { description: 'Organizer-provided expectations, e.g. for outdoor activities. Not a platform safety certification.' });

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

const eventCore = {
  id: id('event'),
  series_id: id('event_series').nullable().openapi({ description: '`null` for a one-off event.' }),
  title: LocalizedText,
  timing: EventTiming,
  status: EventStatus,
  confirmation: EventConfirmation,
  format: EventFormat,
  source_kind: EventSourceKind,
  organizer: EventOrganizer,
  participation: EventParticipation,
  capacity: EventCapacity,
  cost: knowable(EventCost),
};

export const EventSummary = z
  .object({
    ...eventCore,
    area: ApproximateArea.nullable().openapi({ description: 'Venue area. `null` for online-only events.' }),
  })
  .openapi('EventSummary', { description: 'One occurrence, as listed.' });

const RsvpStateEnum = z.enum(['going', 'pending_approval', 'waitlisted', 'offered', 'declined', 'cancelled']);

export const EventViewer = z
  .object({
    rsvp_state: z.enum(['none', ...RsvpStateEnum.options]).openapi({ description: 'The viewer’s RSVP to this occurrence. Always `none` for external-registration events, even when saved.' }),
    rsvp_id: id('rsvp').nullable().openapi({ description: '`null` exactly when `rsvp_state` is `none`.' }),
    waitlist_position: z.int().min(1).nullable().openapi({ description: 'Set only when `waitlisted`.' }),
    offer_expires_at: Instant.nullable().openapi({ description: 'Set only when `offered`: the place is released to the next person after this.' }),
    saved: z.boolean().openapi({ description: 'Bookmarked. Not an RSVP, and for imported events not a confirmed external registration.' }),
  })
  .superRefine((v, ctx) => {
    if ((v.rsvp_state === 'none') !== (v.rsvp_id === null)) ctx.addIssue({ code: 'custom', path: ['rsvp_id'], message: 'rsvp_id is null exactly when rsvp_state is none' });
    if ((v.rsvp_state === 'waitlisted') !== (v.waitlist_position !== null)) ctx.addIssue({ code: 'custom', path: ['waitlist_position'], message: 'waitlist_position is set only when waitlisted' });
    if ((v.rsvp_state === 'offered') !== (v.offer_expires_at !== null)) ctx.addIssue({ code: 'custom', path: ['offer_expires_at'], message: 'offer_expires_at is set only when offered' });
  })
  .openapi('EventViewer', { description: 'The signed-in viewer’s relationship to this occurrence. Responses that include it are private.' });

export const Event = z
  .object({
    ...eventCore,
    description: LocalizedText,
    provenance: EventProvenance,
    visibility: z.enum(['public', 'group_members']).openapi({ description: '`group_members`: visible only to members of the hosting group; everyone else receives 404.' }),
    location: EventLocation,
    requirements: EventOrganizerRequirements.nullable().openapi({ description: '`null` when the organizer stated no requirements.' }),
    languages: knowable(z.array(LanguageTag).min(1)).openapi({ description: 'Languages the organizer says will be used.' }),
    accessibility: knowable(z.string()).openapi({ description: 'Organizer- or source-stated accessibility information. Not verified by livingin.jp unless `basis` says so.' }),
    updated_at: Instant,
    viewer: EventViewer.nullable().openapi({ description: '`null` for anonymous viewers.' }),
  })
  .openapi('Event', { description: 'One occurrence: a specific date and place. Part of a series when it recurs.' });

export const EventSearchResult = page(EventSummary)
  .extend({ coverage: Coverage })
  .openapi('EventSearchResult', {
    description:
      'Occurrences, soonest first (ties broken by id, so pages are stable). Member, group and organization events are available everywhere, but imported municipal calendars cover pilot localities only, so `coverage` is `partial` (with limitations) unless the requested locality is a pilot.',
  });

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

export const EventSeriesTimeOfDay = z
  .discriminatedUnion('kind', [z.object({ kind: z.literal('timed'), start_time: LocalTime, end_time: LocalTime }), z.object({ kind: z.literal('all_day') })])
  .openapi('EventSeriesTimeOfDay');

export const EventRecurrence = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('rule'),
      rrule: z
        .string()
        .regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+:-]+)*$/)
        .openapi({ description: 'RFC 5545 RRULE value (without the `RRULE:` prefix), evaluated in `time_zone` from `starts_on`.', example: 'FREQ=MONTHLY;BYDAY=2SU' }),
      starts_on: CalendarDate.openapi({ description: 'Date of the first occurrence (DTSTART).' }),
      time_of_day: EventSeriesTimeOfDay,
      time_zone: TimeZone,
      summary: z.string().openapi({ description: 'Human-readable rule in the negotiated language.' }),
    }),
    z.object({
      kind: z.literal('irregular'),
      time_zone: TimeZone,
      summary: z.string(),
    }),
  ])
  .openapi('EventRecurrence', {
    description: '`rule`: a regular pattern. `irregular`: dates are announced individually and nothing is projected. A rule only produces `expected` occurrences; it never manufactures confirmed ones.',
  });

export const EventSeriesException = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('cancelled'), original_date: CalendarDate, event_id: id('event'), announced_at: Instant, reason: Reason }),
    z.object({
      kind: z.literal('moved'),
      original_date: CalendarDate,
      new_date: CalendarDate,
      event_id: id('event').openapi({ description: 'The original occurrence, now `rescheduled`.' }),
      moved_to_event_id: id('event'),
      announced_at: Instant,
      reason: Reason,
    }),
  ])
  .openapi('EventSeriesException', { description: 'A departure from the recurrence rule for one date. Dates are in the series time zone.' });

export const EventSeriesStatus = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('active') }),
    z.object({ state: z.literal('ended'), ended_on: CalendarDate }),
    z.object({ state: z.literal('cancelled'), cancelled_at: Instant, reason: Reason }),
  ])
  .openapi('EventSeriesStatus', { description: 'Status of the whole series, distinct from any single occurrence. Cancelling the series cancels every future occurrence.' });

export const EventSeries = z
  .object({
    id: id('event_series'),
    title: LocalizedText,
    description: LocalizedText,
    source_kind: EventSourceKind,
    organizer: EventOrganizer,
    provenance: EventProvenance,
    visibility: z.enum(['public', 'group_members']),
    format: EventFormat,
    location: EventLocation.openapi({ description: 'Usual location. An individual occurrence may differ; the occurrence is authoritative.' }),
    participation: EventParticipation,
    cost: knowable(EventCost),
    recurrence: EventRecurrence,
    status: EventSeriesStatus,
    exceptions: z.array(EventSeriesException).openapi({ description: 'Cancelled and moved dates, soonest first. Includes recent past exceptions.' }),
    upcoming_occurrences: z.array(EventSummary).max(12).openapi({ description: 'Next occurrences (up to 12), including cancelled and rescheduled ones so changes stay visible. Each says whether it is `confirmed` or only `expected`.' }),
    updated_at: Instant,
  })
  .openapi('EventSeries', { description: 'A recurring activity. The series describes the pattern; each occurrence is a separate Event.' });

// ---------------------------------------------------------------------------
// RSVPs
// ---------------------------------------------------------------------------

export const RsvpState = RsvpStateEnum.openapi('RsvpState', {
  description:
    '`going`: holds a place. `pending_approval`: waiting for the organizer. `waitlisted`: queued for a place. `offered`: a place is held for this member until `offer_expires_at`; RSVP again to accept it. `declined`: the organizer declined the request. `cancelled`: ended (see `cancelled_by`). An event’s own cancellation is shown on the event, not by changing RSVP states.',
});

const rsvpShape = {
  id: id('rsvp'),
  event_id: id('event'),
  state: RsvpState,
  waitlist_position: z.int().min(1).nullable().openapi({ description: 'Set only when `waitlisted`. 1 is next in line.' }),
  offer_expires_at: Instant.nullable().openapi({ description: 'Set only when `offered`. After this the offer passes to the next waitlisted member and this RSVP becomes `cancelled` with `cancelled_by: offer_expired`.' }),
  cancelled_by: z.enum(['member', 'organizer', 'offer_expired']).nullable().openapi({ description: 'Set only when `cancelled`. `organizer`: the organizer removed the participant.' }),
  created_at: Instant,
  updated_at: Instant,
};

function rsvpConsistency(v: { state: string; waitlist_position: number | null; offer_expires_at: string | null; cancelled_by: string | null }, ctx: z.RefinementCtx) {
  if ((v.state === 'waitlisted') !== (v.waitlist_position !== null)) ctx.addIssue({ code: 'custom', path: ['waitlist_position'], message: 'waitlist_position is set only when waitlisted' });
  if ((v.state === 'offered') !== (v.offer_expires_at !== null)) ctx.addIssue({ code: 'custom', path: ['offer_expires_at'], message: 'offer_expires_at is set only when offered' });
  if ((v.state === 'cancelled') !== (v.cancelled_by !== null)) ctx.addIssue({ code: 'custom', path: ['cancelled_by'], message: 'cancelled_by is set only when cancelled' });
}

export const Rsvp = z
  .object(rsvpShape)
  .superRefine(rsvpConsistency)
  .openapi('Rsvp', { description: 'A member’s participation record for one occurrence. Private to the member and the event’s organizers; attendee lists are never public. Separate from group membership and attendance.' });

export const MyRsvp = z
  .object({ ...rsvpShape, event: EventSummary })
  .superRefine(rsvpConsistency)
  .openapi('MyRsvp', { description: 'One of my RSVPs with the occurrence it belongs to. Check `event.status`: an RSVP to a cancelled event keeps its state.' });

export const MyRsvpPage = page(MyRsvp).openapi('MyRsvpPage', { description: 'My RSVPs, ordered by occurrence start, soonest first.' });

export const RsvpInput = z
  .object({
    message_to_organizer: z.string().trim().min(1).max(500).optional().openapi({ description: 'Optional note for approval-based events. Visible only to the organizers.' }),
  })
  .strict()
  .openapi('RsvpInput');

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const eventParams = z.object({ event_id: id('event') });

export const eventsOperations = [
  defineOperation({
    operationId: 'listEvents',
    module: 'events',
    feature: 'events.events',
    method: 'get',
    path: '/v1/events',
    summary: 'Browse event occurrences',
    description:
      'Returns occurrences (not series) overlapping the date range, including cancelled, postponed and rescheduled ones marked by `status` so people who saw them can tell they changed. Group-only events appear only for members of the hosting group. Expected (projected) occurrences are included and labelled. New or changed events can take up to a minute to appear here; `getEvent` is authoritative.',
    auth: 'optional',
    request: {
      query: PageQuery.extend({
        locality: z.string().regex(/^JP-\d{2}(-\d{3})?$/).optional().openapi({ description: 'Prefecture or municipality whose venues to include (jurisdiction of the venue, not proximity). Online-only events have no locality and are excluded when this is set.' }),
        from: CalendarDate.optional().openapi({ description: 'First date to include, in Asia/Tokyo. Defaults to today.' }),
        to: CalendarDate.optional().openapi({ description: 'Last date to include (inclusive), in Asia/Tokyo. Must not be before `from`; at most 366 days after it.' }),
        group_id: id('group').optional(),
        format: EventFormat.optional(),
        source_kind: EventSourceKind.optional(),
      }),
    },
    responses: { 200: { description: 'A page of occurrences with coverage for imported calendars.', schema: EventSearchResult } },
    requiredScenarios: ['empty'],
  }),
  defineOperation({
    operationId: 'getEventSeries',
    module: 'events',
    feature: 'events.events',
    method: 'get',
    path: '/v1/event-series/{series_id}',
    summary: 'Event series',
    description: 'A recurring activity with its rule, exceptions and upcoming occurrences. Group-only series return 404 to non-members.',
    auth: 'optional',
    request: { params: z.object({ series_id: id('event_series') }) },
    responses: { 200: { description: 'An event series.', schema: EventSeries } },
    requiredScenarios: ['member_series', 'not_found'],
  }),
  defineOperation({
    operationId: 'getEvent',
    module: 'events',
    feature: 'events.events',
    method: 'get',
    path: '/v1/events/{event_id}',
    summary: 'Event occurrence',
    description:
      'Cancelled and rescheduled occurrences stay readable. Group-only events, and events by members the viewer has blocked, return 404. Responses for signed-in viewers carry `viewer` (and, for confirmed participants, online join details) and are private, never publicly cached. Cancellations reach participants through the urgent notification lane, not moderation batches.',
    auth: 'optional',
    request: { params: eventParams },
    responses: { 200: { description: 'One occurrence.', schema: Event } },
    requiredScenarios: ['full_waitlist', 'cancelled', 'rescheduled', 'imported_external_registration', 'online', 'not_found'],
  }),
  defineOperation({
    operationId: 'createRsvp',
    module: 'events',
    feature: 'events.participation',
    method: 'post',
    path: '/v1/events/{event_id}/rsvps',
    summary: 'RSVP to an occurrence',
    description:
      'Capacity is allocated atomically, so concurrent requests cannot overbook the last place. A full event returns 201 with `state: waitlisted` — not an error. Approval-based events return `pending_approval`. If the viewer already has a going, pending or waitlisted RSVP it is returned unchanged with 200; if they hold an unexpired offer, this accepts it (200, `going`). 409 `conflict` when the occurrence uses external registration (register with the organizer; saving is not registering), is cancelled, postponed or rescheduled, is only `expected`, has started, or the organizer declined this member’s earlier request.',
    auth: 'required',
    idempotent: true,
    request: { params: eventParams, body: RsvpInput },
    responses: {
      200: { description: 'Existing RSVP returned, or a waitlist offer accepted.', schema: Rsvp },
      201: { description: 'RSVP created: `going`, `pending_approval` or `waitlisted`.', schema: Rsvp },
    },
    errors: ['conflict'],
    requiredScenarios: ['pending_approval', 'waitlisted', 'external_registration_only', 'event_cancelled', 'not_found'],
  }),
  defineOperation({
    operationId: 'cancelMyRsvp',
    module: 'events',
    feature: 'events.participation',
    method: 'delete',
    path: '/v1/me/rsvps/{rsvp_id}',
    summary: 'Cancel my RSVP',
    description:
      'Cancels a going, pending, waitlisted or offered RSVP. A released place is offered atomically to the first waitlisted member. Naturally idempotent: repeating the request returns the same cancelled RSVP. Returns 404 unless the RSVP is the viewer’s own.',
    auth: 'required',
    request: { params: z.object({ rsvp_id: id('rsvp') }) },
    responses: { 200: { description: 'The cancelled RSVP.', schema: Rsvp } },
    requiredScenarios: ['not_found'],
  }),
  defineOperation({
    operationId: 'listMyRsvps',
    module: 'events',
    feature: 'events.participation',
    method: 'get',
    path: '/v1/me/rsvps',
    summary: 'My RSVPs',
    description: 'The signed-in member’s RSVPs, each with its occurrence. Saved (bookmarked) events are not RSVPs and are not listed here.',
    auth: 'required',
    request: { query: PageQuery.extend({ state: RsvpState.optional() }) },
    responses: { 200: { description: 'A page of my RSVPs.', schema: MyRsvpPage } },
    requiredScenarios: ['empty'],
  }),
];
