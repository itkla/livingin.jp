import { ID_PREFIXES, ULID_PATTERN, type IdKind } from '../lib/ids';
import { z } from './zod';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

const ID_EXAMPLE_SUFFIX = '01JA0000000000000000000001';

/** A typed, opaque identifier such as `lst_01JA...`. See docs/api/CONVENTIONS.md#identifiers. */
export function id(kind: IdKind) {
  const prefix = ID_PREFIXES[kind];
  return z
    .string()
    .regex(new RegExp(`^${prefix}_${ULID_PATTERN}$`))
    .openapi({ description: `Opaque ${kind.replace(/_/g, ' ')} identifier (prefix \`${prefix}_\`).`, example: `${prefix}_${ID_EXAMPLE_SUFFIX}` });
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** An instant. RFC 3339 in UTC with a `Z` suffix, e.g. `2026-11-03T01:30:00Z`. */
export const Instant = z.iso
  .datetime()
  .openapi('Instant', { description: 'An instant in time: RFC 3339, UTC, `Z` suffix.', example: '2026-11-03T01:30:00Z' });

/**
 * A calendar date with no time of day, e.g. a filing deadline. It is never converted to a
 * midnight timestamp. Unless stated otherwise it is a date in Asia/Tokyo.
 */
export const CalendarDate = z.iso
  .date()
  .openapi('CalendarDate', { description: 'A calendar date (YYYY-MM-DD) with no time of day. Interpreted in the accompanying time zone, or Asia/Tokyo when none is given.', example: '2026-12-15' });

export const TimeZone = z
  .string()
  .regex(/^(UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/)
  .openapi('TimeZone', { description: 'IANA time zone name.', example: 'Asia/Tokyo' });

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export const Money = z
  .object({
    amount: z.int().openapi({ description: 'Amount in the minor unit of `currency`. JPY has no minor unit, so this is yen.' }),
    currency: z.string().regex(/^[A-Z]{3}$/).openapi({ description: 'ISO 4217 currency code.', example: 'JPY' }),
  })
  .openapi('Money', { description: 'A monetary amount. Never a float. Unknown amounts are expressed with a Knowable wrapper, never as zero.' });

// ---------------------------------------------------------------------------
// Known / unknown / not applicable
// ---------------------------------------------------------------------------

export const AssertionBasis = z
  .enum(['reported', 'verified', 'source_derived'])
  .openapi('AssertionBasis', {
    description:
      '`reported`: stated by the submitter (employer, seller, organizer) and not checked. `verified`: checked by livingin.jp against evidence. `source_derived`: taken from a cited source record.',
  });

/**
 * Distinguishes a known value from "we do not know" and from "this does not apply".
 * A null field is never used to mean any of these.
 */
export function knowable<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('known'), value, basis: AssertionBasis, source_id: id('source').optional() }),
    z.object({ status: z.literal('unknown') }),
    z.object({ status: z.literal('not_applicable') }),
  ]);
}

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------

export const Lang = z.enum(['en', 'ja']).openapi('Lang', { description: 'Content language. More may be added; clients must tolerate unknown values.' });

export const TranslationState = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('original') }),
    z.object({ status: z.literal('reviewed_translation'), source_lang: Lang, reviewed_at: Instant }),
    z.object({ status: z.literal('machine_translation'), source_lang: Lang }),
    z.object({ status: z.literal('stale_translation'), source_lang: Lang, source_revised_at: Instant }),
  ])
  .openapi('TranslationState', {
    description: 'How this text relates to its source language. `stale_translation` means the original changed after this translation was made.',
  });

export const LocalizedText = z
  .object({ lang: Lang, text: z.string(), translation: TranslationState })
  .openapi('LocalizedText', { description: 'Text in the language negotiated with Accept-Language (or the best available), with its translation state.' });

/** A Japanese term with its reading and English gloss, e.g. 在留カード / ざいりゅうカード / residence card. */
export const Term = z
  .object({
    ja: z.string(),
    reading: z.string().optional().openapi({ description: 'Hiragana reading.' }),
    romaji: z.string().optional(),
    en: z.string(),
  })
  .openapi('Term');

// ---------------------------------------------------------------------------
// Sources, review and freshness
// ---------------------------------------------------------------------------

export const SourceRef = z
  .object({
    source_id: id('source'),
    title: z.string(),
    publisher: z.string(),
    url: z.url().nullable().openapi({ description: 'Canonical location, when the source is public.' }),
    retrieved_at: Instant,
    authority: z.enum(['official', 'provider', 'community', 'editorial']),
  })
  .openapi('SourceRef', { description: 'Attribution for information derived from a source record.' });

export const ReviewState = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('reviewed'), reviewed_at: Instant, next_review_due: CalendarDate, reviewer_role: z.enum(['editor', 'subject_expert', 'qualified_professional']) }),
    z.object({ status: z.literal('pending_review') }),
    z.object({ status: z.literal('review_overdue'), last_reviewed_at: Instant, review_was_due: CalendarDate }),
  ])
  .openapi('ReviewState', { description: 'Editorial review state of maintained content or rules.' });

export const Freshness = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('current'), checked_at: Instant, stale_after: Instant }),
    z.object({ state: z.literal('stale'), checked_at: Instant, stale_since: Instant, reason: z.string() }),
  ])
  .openapi('Freshness', { description: 'Whether data still satisfies its freshness requirement. Unavailable data is modelled separately and never presented as current.' });

/** Whether the product maintains information for the requested jurisdiction/scenario. */
export const Coverage = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('supported') }),
    z.object({ status: z.literal('partial'), limitations: z.array(z.string()).min(1) }),
    z.object({ status: z.literal('unsupported'), reason_code: z.string(), explanation: z.string() }),
  ])
  .openapi('Coverage', {
    description:
      '`unsupported` means livingin.jp does not maintain this jurisdiction, procedure or scenario. It is different from a supported query that matched nothing (an empty list).',
  });

// ---------------------------------------------------------------------------
// Locality
// ---------------------------------------------------------------------------

export const LocalityRef = z
  .object({
    code: z.string().regex(/^JP(-\d{2}(-\d{3})?)?$/).openapi({ description: '`JP`, a prefecture (`JP-13`) or a municipality (`JP-13-113`). Municipality digits follow the JIS X 0402 code without the check digit.', example: 'JP-13-113' }),
    name: Term,
    level: z.enum(['country', 'prefecture', 'municipality']),
  })
  .openapi('LocalityRef', { description: 'An administrative jurisdiction. Jurisdiction (which rules apply) is distinct from proximity (what is nearby).' });

export const ApproximateArea = z
  .object({
    locality: LocalityRef,
    label: z.string().openapi({ description: 'Coarse, human-readable area such as a neighbourhood or station. Never an exact address.', example: 'Near Sangenjaya Station' }),
  })
  .openapi('ApproximateArea', { description: 'Deliberately coarse public location.' });

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const MediaRef = z
  .object({
    media_id: id('media'),
    url: z.url().openapi({ description: 'Time-limited URL of a processed derivative. Do not persist; re-fetch the resource for a fresh URL.' }),
    width: z.int().min(1),
    height: z.int().min(1),
    alt: z.string().nullable(),
  })
  .openapi('MediaRef', { description: 'A public, processed image. Quarantined or rejected originals are never exposed through this type.' });

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PageQuery = z.object({
  cursor: z.string().max(512).optional().openapi({ description: 'Opaque cursor from a previous `next_cursor`.' }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ description: 'Page size, 1–100.' }),
});

export function page<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    next_cursor: z.string().nullable().openapi({ description: 'Pass as `cursor` to fetch the next page. `null` on the last page.' }),
  });
}

// ---------------------------------------------------------------------------
// Feature activation
// ---------------------------------------------------------------------------

export const ActivationState = z
  .enum(['enabled', 'disabled', 'held'])
  .openapi('ActivationState', { description: '`held`: implemented or contracted, but waiting on a human, legal, source or operating decision before activation.' });
