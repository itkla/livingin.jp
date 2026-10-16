import { id, Instant, Lang, LocalityRef } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';

/** The minimum public identity embedded in other records (authors, hosts, sellers). */
export const ProfileSummary = z
  .object({
    profile_id: id('profile'),
    display_name: z.string(),
  })
  .openapi('ProfileSummary', { description: 'Public identity only. Never contains account, contact or private data.' });

export const PublicProfile = z
  .object({
    id: id('profile'),
    display_name: z.string().min(1).max(60),
    bio: z.string().max(1000).nullable(),
    languages: z.array(z.object({ lang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/), proficiency: z.enum(['native', 'fluent', 'conversational', 'learning']) })).openapi({ description: 'Self-declared and optional. Never inferred.' }),
    joined_at: Instant,
  })
  .openapi('PublicProfile', { description: 'What other people can see about a member. Separate from the private Account.' });

export const Account = z
  .object({
    id: id('account'),
    profile_id: id('profile'),
    email: z.email(),
    status: z.enum(['active', 'restricted', 'deactivated']),
    preferred_lang: Lang,
    followed_localities: z.array(LocalityRef).openapi({ description: 'Optional. Members can browse without choosing any location.' }),
    created_at: Instant,
    revision: z.int().min(1),
  })
  .openapi('Account', { description: 'Private account record. Only ever returned to its owner.' });

export const Session = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('anonymous') }),
    z.object({
      state: z.literal('authenticated'),
      account_id: id('account'),
      profile: ProfileSummary,
      roles: z.array(z.enum(['member', 'operator'])),
      restricted: z.boolean(),
      csrf_token: z.string().openapi({ description: 'Send as X-CSRF-Token on unsafe requests authenticated by the session cookie.' }),
      expires_at: Instant,
    }),
  ])
  .openapi('Session');

export const Organization = z
  .object({
    id: id('organization'),
    kind: z.enum(['municipality', 'public_agency', 'nonprofit', 'business', 'community_group', 'other']),
    name: z.object({ ja: z.string().nullable(), en: z.string().nullable() }),
    verification: z.enum(['unverified', 'verified']).openapi({ description: '`verified`: livingin.jp confirmed the organization controls this record. Not an endorsement.' }),
    website: z.url().nullable(),
    description: z.string().nullable(),
  })
  .openapi('Organization', { description: 'A municipality, agency, nonprofit, business or community group. Accounts act for organizations through role grants; an organization is not an account.' });

export const identityOperations = [
  defineOperation({
    operationId: 'getSession',
    module: 'identity',
    feature: 'identity.accounts',
    method: 'get',
    path: '/v1/session',
    summary: 'Current session',
    description: 'Always 200. Anonymous visitors receive `{ "state": "anonymous" }`.',
    auth: 'optional',
    responses: { 200: { description: 'The current session.', schema: Session } },
    requiredScenarios: ['anonymous', 'restricted'],
  }),
  defineOperation({
    operationId: 'getMyAccount',
    module: 'identity',
    feature: 'identity.accounts',
    method: 'get',
    path: '/v1/me/account',
    summary: 'My private account',
    auth: 'required',
    responses: { 200: { description: 'The signed-in member’s private account.', schema: Account, headers: { ETag: { description: 'Current revision.', required: true } } } },
  }),
  defineOperation({
    operationId: 'getProfile',
    module: 'identity',
    feature: 'identity.accounts',
    method: 'get',
    path: '/v1/profiles/{profile_id}',
    summary: 'Public profile',
    description: 'Deactivated members and profiles hidden from a viewer who blocked or was blocked by them return 404.',
    auth: 'optional',
    request: { params: z.object({ profile_id: id('profile') }) },
    responses: { 200: { description: 'A public profile.', schema: PublicProfile } },
    requiredScenarios: ['not_found'],
  }),
  defineOperation({
    operationId: 'getOrganization',
    module: 'identity',
    feature: 'identity.accounts',
    method: 'get',
    path: '/v1/organizations/{organization_id}',
    summary: 'Organization',
    auth: 'none',
    request: { params: z.object({ organization_id: id('organization') }) },
    responses: { 200: { description: 'An organization.', schema: Organization } },
    requiredScenarios: ['not_found'],
  }),
];
