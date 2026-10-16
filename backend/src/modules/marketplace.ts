import { ApproximateArea, CalendarDate, Coverage, id, Instant, knowable, MediaRef, Money, page, PageQuery, TimeZone } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';
import { ProfileSummary } from './identity';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Day-one categories are household goods only (#37). Regulated categories are not accepted. */
export const ListingCategory = z
  .enum(['furniture', 'appliances', 'kitchen', 'bedding_textiles', 'baby_kids', 'books_media', 'clothing', 'sports_outdoor', 'other_household'])
  .openapi('ListingCategory');

export const ItemCondition = z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).openapi('ItemCondition');

export const ItemAvailability = z
  .enum(['available', 'reserved', 'sold', 'given_away', 'withdrawn'])
  .openapi('ItemAvailability', { description: 'Inventory state, set by the seller. Independent of publication/review state; changing it never requires re-review.' });

export const ItemPrice = z
  .discriminatedUnion('kind', [z.object({ kind: z.literal('sale'), price: Money }), z.object({ kind: z.literal('free') })])
  .openapi('ItemPrice');

export const Dimensions = z
  .object({ width_cm: z.number().positive(), depth_cm: z.number().positive(), height_cm: z.number().positive() })
  .openapi('Dimensions');

export const PickupWindow = z
  .object({ available_from: CalendarDate, available_until: CalendarDate, time_zone: TimeZone })
  .openapi('PickupWindow', { description: 'Calendar dates the seller can hand over items. Exact times are agreed privately in an inquiry.' });

export const ListingItem = z
  .object({
    id: id('listing_item'),
    title: z.string(),
    category: ListingCategory,
    condition: ItemCondition,
    dimensions: knowable(Dimensions),
    price: ItemPrice,
    availability: ItemAvailability,
    photos: z.array(MediaRef),
  })
  .openapi('ListingItem');

const Screening = z
  .object({
    method: z.enum(['automated', 'human', 'automated_and_human']),
    seller_verification: z.enum(['not_verified']).openapi({ description: 'Screening checks the listing content, not the seller. More values may be added if seller verification is introduced.' }),
  })
  .openapi('ListingScreening');

// ---------------------------------------------------------------------------
// Public listing
// ---------------------------------------------------------------------------

export const ListingSummary = z
  .object({
    id: id('listing'),
    kind: z.enum(['single', 'bundle']),
    title: z.string(),
    cover_photo: MediaRef.nullable(),
    price_summary: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('free') }),
      z.object({ kind: z.literal('fixed'), price: Money }),
      z.object({ kind: z.literal('range'), min: Money, max: Money }),
      z.object({ kind: z.literal('mixed_free_and_sale'), max: Money }),
    ]),
    availability_summary: z.enum(['available', 'partially_available', 'reserved', 'unavailable']),
    item_count: z.int().min(1),
    available_item_count: z.int().min(0),
    pickup_area: ApproximateArea,
    published_at: Instant,
    expires_at: Instant,
  })
  .openapi('ListingSummary');

export const Listing = z
  .object({
    id: id('listing'),
    kind: z.enum(['single', 'bundle']).openapi({ description: '`bundle`: a move-out set of individually available items.' }),
    title: z.string(),
    description: z.string(),
    items: z.array(ListingItem).min(1),
    availability_summary: z.enum(['available', 'partially_available', 'reserved', 'unavailable']),
    pickup_area: ApproximateArea,
    pickup_window: PickupWindow,
    seller: ProfileSummary,
    screening: Screening,
    published_revision: z.int().min(1).openapi({ description: 'The approved revision being shown. Later edits are not public until approved.' }),
    published_at: Instant,
    expires_at: Instant,
    viewer: z
      .object({ relation: z.enum(['owner', 'other']), can_inquire: z.boolean(), existing_inquiry_id: id('thread').nullable() })
      .nullable()
      .openapi({ description: '`null` for anonymous viewers.' }),
  })
  .openapi('Listing', { description: 'A published listing as the public sees it. Pickup location is deliberately approximate.' });

export const ListingSearchResult = page(ListingSummary)
  .extend({ coverage: Coverage })
  .openapi('ListingSearchResult', { description: 'Marketplace runs in pilot localities only; other localities return `coverage.status = unsupported` with no items.' });

// ---------------------------------------------------------------------------
// Owner view and publication state
// ---------------------------------------------------------------------------

const ReasonCode = z.object({ code: z.string(), explanation: z.string() });

export const Appeal = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('available'), deadline: Instant }),
    z.object({ status: z.literal('submitted'), submitted_at: Instant }),
    z.object({ status: z.literal('decided'), decided_at: Instant, outcome: z.enum(['upheld', 'overturned']) }),
    z.object({ status: z.literal('expired') }),
  ])
  .openapi('Appeal');

export const PublicationState = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('draft') }),
    z.object({ state: z.literal('submitted'), revision: z.int().min(1), submitted_at: Instant }),
    z.object({
      state: z.literal('screening'),
      revision: z.int().min(1),
      submitted_at: Instant,
      delay: z
        .object({ reason: z.enum(['screening_unavailable', 'high_volume']), since: Instant })
        .nullable()
        .openapi({ description: 'Set when review is delayed, e.g. the screening model is unavailable. Listings never auto-approve on delay.' }),
    }),
    z.object({
      state: z.literal('approved'),
      revision: z.int().min(1),
      decision_id: id('moderation_decision'),
      decided_at: Instant,
      release: z.discriminatedUnion('status', [
        z.object({ status: z.literal('scheduled'), releases_at: Instant }),
        z.object({ status: z.literal('published'), published_at: Instant }),
      ]).openapi({ description: 'Approved listings may wait for the next publication window (up to 30 minutes).' }),
    }),
    z.object({ state: z.literal('held'), revision: z.int().min(1), held_at: Instant, reason: ReasonCode.extend({ code: z.enum(['needs_human_review', 'needs_more_information', 'policy_check']) }) }),
    z.object({ state: z.literal('rejected'), revision: z.int().min(1), decision_id: id('moderation_decision'), decided_at: Instant, reasons: z.array(ReasonCode).min(1), appeal: Appeal }),
  ])
  .openapi('PublicationState', {
    description: 'Review/publication state of the most recently submitted revision. Separate from item availability. A decision applies only to the revision (and media set) it names.',
  });

export const OwnerPhoto = z
  .object({
    media_id: id('media'),
    state: z.enum(['processing', 'ready', 'rejected']),
    url: z.url().nullable().openapi({ description: 'Owner-only, time-limited. `null` until processing finishes.' }),
  })
  .openapi('OwnerPhoto');

export const OwnerListingItem = ListingItem.omit({ photos: true }).extend({ photos: z.array(OwnerPhoto) }).openapi('OwnerListingItem');

export const OwnerListing = z
  .object({
    id: id('listing'),
    revision: z.int().min(1).openapi({ description: 'Latest revision of the seller’s content. Also served as the ETag.' }),
    kind: z.enum(['single', 'bundle']),
    title: z.string(),
    description: z.string(),
    items: z.array(OwnerListingItem).min(1),
    pickup_area: ApproximateArea,
    pickup_window: PickupWindow,
    publication: PublicationState,
    published_revision: z.int().min(1).nullable().openapi({ description: 'Revision currently visible to the public, if any.' }),
    has_unsubmitted_changes: z.boolean().openapi({ description: '`true` when `revision` is newer than the revision under review or published. Those edits are not public and need submitting.' }),
    expires_at: Instant.nullable(),
    created_at: Instant,
    updated_at: Instant,
  })
  .openapi('OwnerListing', { description: 'The seller’s private view of their listing.' });

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const ListingItemInput = z
  .object({
    id: id('listing_item').optional().openapi({ description: 'Omit for a new item; include to keep an existing item.' }),
    title: z.string().trim().min(1).max(100),
    category: ListingCategory,
    condition: ItemCondition,
    dimensions: Dimensions.nullable().openapi({ description: '`null` when the seller does not know.' }),
    price: ItemPrice,
    photo_media_ids: z.array(id('media')).max(8),
  })
  .strict()
  .openapi('ListingItemInput');

export const ListingDraftInput = z
  .object({
    kind: z.enum(['single', 'bundle']),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(4000),
    items: z.array(ListingItemInput).min(1).max(30),
    pickup_locality_code: z.string().regex(/^JP-\d{2}-\d{3}$/).openapi({ description: 'Municipality code. Must be a marketplace pilot locality.' }),
    pickup_area_label: z.string().trim().min(1).max(60).openapi({ description: 'Coarse public label, e.g. a station or neighbourhood. Never a street address.' }),
    pickup_window: PickupWindow,
  })
  .strict()
  .refine((v) => v.kind === 'bundle' || v.items.length === 1, { message: 'A single listing has exactly one item', path: ['items'] })
  .openapi('ListingDraftInput');

export const ListingPatchInput = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().max(4000),
    items: z.array(ListingItemInput).min(1).max(30),
    pickup_area_label: z.string().trim().min(1).max(60),
    pickup_window: PickupWindow,
  })
  .partial()
  .strict()
  .openapi('ListingPatchInput', { description: 'Fields to replace. `items` replaces the whole item list. Any change creates a new revision that must be submitted again.' });

export const ItemAvailabilityInput = z
  .object({ availability: z.enum(['available', 'reserved', 'sold', 'given_away', 'withdrawn']) })
  .strict()
  .openapi('ItemAvailabilityInput');

// ---------------------------------------------------------------------------
// Coordination
// ---------------------------------------------------------------------------

export const PickupProposal = z
  .object({
    proposed_by: ProfileSummary,
    starts_at: Instant,
    ends_at: Instant,
    time_zone: TimeZone,
    meeting_point: z.string().openapi({ description: 'Private to the two participants. Never shown publicly or in notification previews.' }),
    status: z.enum(['proposed', 'accepted', 'declined', 'withdrawn']),
  })
  .openapi('PickupProposal');

export const InquiryMessage = z
  .object({
    id: id('message'),
    author: ProfileSummary,
    body: z.string(),
    sent_at: Instant,
  })
  .openapi('InquiryMessage');

export const Inquiry = z
  .object({
    id: id('thread'),
    listing_id: id('listing'),
    item_ids: z.array(id('listing_item')).min(1),
    seller: ProfileSummary,
    buyer: ProfileSummary,
    state: z.enum(['open', 'reserved', 'completed', 'closed']).openapi({ description: '`completed` is reported by the participants; livingin.jp does not handle payment or verify handover.' }),
    pickup_proposal: PickupProposal.nullable(),
    messages: z.array(InquiryMessage),
    created_at: Instant,
  })
  .openapi('Inquiry', { description: 'Private coordination between a buyer and seller about specific items.' });

export const InquiryInput = z
  .object({
    item_ids: z.array(id('listing_item')).min(1).max(30),
    message: z.string().trim().min(1).max(2000),
  })
  .strict()
  .openapi('InquiryInput');

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const listingParams = z.object({ listing_id: id('listing') });
const etag = { ETag: { description: 'Current revision, e.g. `"3"`.', required: true } };

export const marketplaceOperations = [
  defineOperation({
    operationId: 'listListings',
    module: 'marketplace',
    feature: 'marketplace.listings',
    method: 'get',
    path: '/v1/listings',
    summary: 'Search published listings',
    auth: 'optional',
    request: {
      query: PageQuery.extend({
        locality: z.string().regex(/^JP-\d{2}(-\d{3})?$/).optional().openapi({ description: 'Prefecture or municipality code.' }),
        q: z.string().max(200).optional(),
        category: ListingCategory.optional(),
        price: z.enum(['free', 'sale']).optional(),
      }),
    },
    responses: { 200: { description: 'A page of published listings with coverage for the requested locality.', schema: ListingSearchResult } },
    requiredScenarios: ['empty', 'unsupported_locality'],
  }),
  defineOperation({
    operationId: 'getListing',
    module: 'marketplace',
    feature: 'marketplace.listings',
    method: 'get',
    path: '/v1/listings/{listing_id}',
    summary: 'Published listing',
    description: 'Unpublished, rejected and expired listings, and listings by members the viewer has blocked, return 404.',
    auth: 'optional',
    request: { params: listingParams },
    responses: { 200: { description: 'A published listing.', schema: Listing } },
    requiredScenarios: ['bundle_partially_sold', 'not_found'],
  }),
  defineOperation({
    operationId: 'createListing',
    module: 'marketplace',
    feature: 'marketplace.listings',
    method: 'post',
    path: '/v1/me/listings',
    summary: 'Create a listing draft',
    auth: 'required',
    idempotent: true,
    request: { body: ListingDraftInput },
    responses: { 201: { description: 'Draft created at revision 1. Not visible to anyone else until submitted and approved.', schema: OwnerListing, headers: { ...etag, Location: { description: 'URL of the owner listing.', required: true } } } },
    requiredScenarios: ['validation_failed'],
  }),
  defineOperation({
    operationId: 'getMyListing',
    module: 'marketplace',
    feature: 'marketplace.listings',
    method: 'get',
    path: '/v1/me/listings/{listing_id}',
    summary: 'My listing (owner view)',
    description: 'Returns 404 unless the viewer owns the listing.',
    auth: 'required',
    request: { params: listingParams },
    responses: { 200: { description: 'The owner’s view, including publication state.', schema: OwnerListing, headers: etag } },
    requiredScenarios: ['submitted', 'screening', 'screening_delayed', 'approved_scheduled', 'held', 'rejected', 'edited_during_review', 'edited_after_publication', 'not_found'],
  }),
  defineOperation({
    operationId: 'updateMyListing',
    module: 'marketplace',
    feature: 'marketplace.listings',
    method: 'patch',
    path: '/v1/me/listings/{listing_id}',
    summary: 'Edit my listing',
    description: 'Creates a new revision. If an earlier revision is published, it stays public until the new revision is submitted and approved; approval never carries over to edited content.',
    auth: 'required',
    ifMatch: true,
    request: { params: listingParams, body: ListingPatchInput },
    responses: { 200: { description: 'The listing at its new revision.', schema: OwnerListing, headers: etag } },
    requiredScenarios: ['not_found'],
  }),
  defineOperation({
    operationId: 'submitMyListing',
    module: 'marketplace',
    feature: 'marketplace.review',
    method: 'post',
    path: '/v1/me/listings/{listing_id}/submissions',
    summary: 'Submit my listing for review',
    description: 'Submits exactly the revision named by If-Match. Submitting a newer revision supersedes any review in progress for an older one.',
    auth: 'required',
    idempotent: true,
    ifMatch: true,
    request: { params: listingParams },
    responses: { 202: { description: 'Accepted for review. Poll the owner listing for the outcome.', schema: OwnerListing, headers: etag } },
    errors: ['conflict'],
    requiredScenarios: ['already_submitted', 'not_found'],
  }),
  defineOperation({
    operationId: 'setMyListingItemAvailability',
    module: 'marketplace',
    feature: 'marketplace.listings',
    method: 'put',
    path: '/v1/me/listings/{listing_id}/items/{item_id}/availability',
    summary: 'Set an item’s availability',
    description: 'Inventory only: does not create a revision or affect review. Naturally idempotent.',
    auth: 'required',
    request: { params: listingParams.extend({ item_id: id('listing_item') }), body: ItemAvailabilityInput },
    responses: { 200: { description: 'The listing with the updated item.', schema: OwnerListing, headers: etag } },
    requiredScenarios: ['not_found'],
  }),
  defineOperation({
    operationId: 'createInquiry',
    module: 'marketplace',
    feature: 'marketplace.coordination',
    method: 'post',
    path: '/v1/listings/{listing_id}/inquiries',
    summary: 'Ask the seller about items',
    description: 'Opens (or returns the existing) private thread with the seller. 409 `conflict` when none of the requested items are still available; 403 `forbidden` when either party has blocked the other or the viewer is the seller.',
    auth: 'required',
    idempotent: true,
    request: { params: listingParams, body: InquiryInput },
    responses: { 201: { description: 'Inquiry thread opened.', schema: Inquiry } },
    errors: ['conflict', 'forbidden'],
    requiredScenarios: ['items_unavailable', 'blocked', 'not_found'],
  }),
  defineOperation({
    operationId: 'getInquiry',
    module: 'marketplace',
    feature: 'marketplace.coordination',
    method: 'get',
    path: '/v1/me/inquiries/{thread_id}',
    summary: 'Inquiry thread',
    description: 'Only the two participants (and operators handling a report) can read a thread; anyone else receives 404.',
    auth: 'required',
    request: { params: z.object({ thread_id: id('thread') }) },
    responses: { 200: { description: 'A private inquiry thread.', schema: Inquiry } },
    requiredScenarios: ['pickup_proposed', 'not_found'],
  }),
];
