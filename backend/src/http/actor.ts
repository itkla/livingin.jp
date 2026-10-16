import type { Role } from '../contract/operation';

export interface Actor {
  account_id: string;
  profile_id: string;
  roles: Role[];
  /** Restricted accounts can read but not mutate (moderation enforcement, #47). */
  restricted: boolean;
}

/**
 * Synthetic identities accepted by the mock server as `Authorization: Bearer mock:<persona>`.
 * IDs match the identity fixtures. The live service never accepts these tokens.
 */
export const MOCK_PERSONAS: Record<string, Actor> = {
  member: { account_id: 'acct_01JA00000000000000000000A1', profile_id: 'prof_01JA00000000000000000000A1', roles: ['member'], restricted: false },
  member_b: { account_id: 'acct_01JA00000000000000000000B2', profile_id: 'prof_01JA00000000000000000000B2', roles: ['member'], restricted: false },
  organizer: { account_id: 'acct_01JA00000000000000000000C3', profile_id: 'prof_01JA00000000000000000000C3', roles: ['member'], restricted: false },
  operator: { account_id: 'acct_01JA00000000000000000000D4', profile_id: 'prof_01JA00000000000000000000D4', roles: ['member', 'operator'], restricted: false },
  restricted: { account_id: 'acct_01JA00000000000000000000E5', profile_id: 'prof_01JA00000000000000000000E5', roles: ['member'], restricted: true },
};

export function mockActorFromAuthorization(header: string | undefined): Actor | null | 'invalid' {
  if (!header) return null;
  const match = /^Bearer mock:([a-z_]+)$/.exec(header.trim());
  if (!match) return 'invalid';
  return MOCK_PERSONAS[match[1]!] ?? 'invalid';
}
