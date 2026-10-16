import { randomBytes } from 'node:crypto';

/**
 * Resource identifiers are `<prefix>_<ULID>`. The prefix names the record type so that an
 * account ID can never be mistaken for a public profile ID. Clients must treat IDs as opaque.
 */
export const ID_PREFIXES = {
  account: 'acct',
  profile: 'prof',
  organization: 'org',
  source: 'src',
  guide: 'gde',
  almanac_entry: 'alm',
  task: 'tsk',
  group: 'grp',
  chapter: 'chp',
  membership: 'mbr',
  post: 'pst',
  request: 'req',
  job: 'job',
  application: 'apl',
  event_series: 'evs',
  event: 'evt',
  rsvp: 'rsv',
  directory_entry: 'dir',
  listing: 'lst',
  listing_item: 'lsi',
  listing_revision: 'lsr',
  moderation_decision: 'mod',
  thread: 'thr',
  message: 'msg',
  warning: 'wrn',
  safety_resource: 'sfr',
  media: 'med',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ULID_PATTERN = '[0-9A-HJKMNP-TV-Z]{26}';

export function ulid(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let random = '';
  for (let i = 0; i < 16; i++) random += CROCKFORD[bytes[i]! % 32];
  return time + random;
}

export function newId(kind: IdKind, now?: number): string {
  return `${ID_PREFIXES[kind]}_${ulid(now)}`;
}
