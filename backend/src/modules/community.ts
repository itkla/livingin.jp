import { id, Instant, LocalityRef, page, PageQuery } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';
import { ProfileSummary } from './identity';

// ---------------------------------------------------------------------------
// Group settings. Each is independent of the others (#26): who can find a group, who can see
// its members, who can read its posts and how people join are separate decisions.
// ---------------------------------------------------------------------------

export const GroupKind = z
  .enum(['language', 'background', 'interest', 'life_circumstance', 'location'])
  .openapi('GroupKind', { description: 'What the group is about, chosen by its admins. People choose groups themselves; livingin.jp never infers a person’s language, background or circumstances, and never adds anyone to a group.' });

export const GroupDiscoverability = z
  .enum(['listed', 'unlisted'])
  .openapi('GroupDiscoverability', { description: '`listed`: appears in group discovery and search. `unlisted`: never listed or searchable, and returns 404 to anyone without an active or pending membership. Independent of membership visibility.' });

export const GroupMembershipVisibility = z
  .enum(['public', 'members_only', 'admins_only'])
  .openapi('GroupMembershipVisibility', { description: 'Who can see the member list. `public`: anyone (never allowed for sensitive groups). `members_only`: active members. `admins_only`: admins and moderators. Independent of discoverability.' });

export const GroupPostVisibility = z
  .enum(['public', 'members_only'])
  .openapi('GroupPostVisibility', { description: 'Who can read the group’s posts. Sensitive groups are always `members_only`, because a post reveals its author’s membership.' });

export const GroupJoinPolicy = z
  .enum(['open', 'approval', 'invite_only'])
  .openapi('GroupJoinPolicy', { description: '`open`: joining is immediate. `approval`: an admin reviews each request. `invite_only`: people cannot join or request on their own.' });

export const GroupScope = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('national') }),
    z.object({ kind: z.literal('online') }),
    z.object({ kind: z.literal('local'), locality: LocalityRef }),
  ])
  .openapi('GroupScope', {
    description:
      '`national`: for people anywhere in Japan. `online`: meets online only. `local`: centred on one prefecture or municipality; this describes where the group meets, not where its members live. Location is never required to browse or join.',
  });

export const GroupRole = z.enum(['admin', 'moderator', 'member']).openapi('GroupRole');

export const GroupMemberCount = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('shown'), count: z.int().min(0) }),
    z.object({ status: z.literal('hidden') }),
  ])
  .openapi('GroupMemberCount', {
    description:
      'Number of active members. `hidden` for sensitive groups and for groups whose membership visibility is `admins_only`. A hidden count is not zero. The value is the same for every viewer, so it never reveals the viewer’s own membership.',
  });

export const GroupRef = z
  .object({ id: id('group'), name: z.string() })
  .openapi('GroupRef', { description: 'Minimal reference to a group, e.g. the national group a chapter belongs to.' });

export const GroupSummary = z
  .object({
    id: id('group'),
    name: z.string(),
    tagline: z.string().openapi({ description: 'One-line description written by the admins.' }),
    kind: GroupKind,
    languages: z
      .array(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/))
      .min(1)
      .openapi({ description: 'Languages the group converses in (BCP 47), chosen by its admins. Not a statement about members’ nationality or background.' }),
    scope: GroupScope,
    discoverability: GroupDiscoverability,
    join_policy: GroupJoinPolicy,
    sensitive: z.boolean().openapi({ description: 'See `Group.sensitive`.' }),
    member_count: GroupMemberCount,
    parent: GroupRef.nullable().openapi({ description: 'The group this is a chapter of. `null` for a top-level group.' }),
    chapter_count: z.int().min(0).openapi({ description: 'Number of listed chapters.' }),
  })
  .openapi('GroupSummary', { description: 'A group as shown in discovery results and chapter lists. Contains no member names and no viewer-specific state.' });

export const GroupAdmin = z
  .object({ profile: ProfileSummary, role: z.enum(['admin', 'moderator']) })
  .openapi('GroupAdmin');

export const GroupAdminList = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('shown'), admins: z.array(GroupAdmin).min(1) }),
    z.object({ status: z.literal('hidden') }),
  ])
  .openapi('GroupAdminList', { description: 'The people who run the group. `hidden` in sensitive groups unless the viewer is an active member, because naming them would reveal their membership.' });

export const GroupViewerMembership = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('none') }),
    z.object({ state: z.literal('pending'), membership_id: id('membership'), requested_at: Instant }),
    z.object({ state: z.literal('active'), membership_id: id('membership'), role: GroupRole, joined_at: Instant }),
    z.object({ state: z.literal('removed'), removed_at: Instant }),
    z.object({ state: z.literal('blocked') }),
  ])
  .openapi('GroupViewerMembership', {
    description:
      'The signed-in viewer’s relationship to the group. `pending`: a join request awaits an admin. `removed`: an admin ended the viewer’s membership; they cannot rejoin on their own but may be invited back. `blocked`: the viewer may not join, be invited or post until an admin lifts the block.',
  });

export const GroupViewer = z
  .object({
    membership: GroupViewerMembership,
    can_join: z.boolean().openapi({ description: '`true` when joinGroup would add the viewer or create a pending request.' }),
    can_view_members: z.boolean(),
    can_view_posts: z.boolean(),
    can_post: z.boolean(),
  })
  .openapi('GroupViewer');

export const Group = z
  .object({
    id: id('group'),
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    kind: GroupKind,
    languages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)).min(1).openapi({ description: 'Languages the group converses in (BCP 47). Japanese speakers are welcome in every group.' }),
    scope: GroupScope,
    discoverability: GroupDiscoverability,
    membership_visibility: GroupMembershipVisibility,
    post_visibility: GroupPostVisibility,
    join_policy: GroupJoinPolicy,
    sensitive: z.boolean().openapi({
      description:
        'Set by the group’s admins or livingin.jp operators because of the group’s topic, never inferred from members. Sensitive groups never expose their members, member count, admins (to non-members) or posts publicly, and their names must not appear in default notification previews, email subjects or other surfaces visible outside the signed-in app.',
    }),
    rules: z.string().nullable().openapi({ description: 'Group rules written by the admins, in addition to the site-wide community guidelines. `null` when the group has none of its own.' }),
    parent: GroupRef.nullable().openapi({ description: 'The group this is a chapter of. `null` for a top-level group.' }),
    chapters: z.array(GroupSummary).openapi({ description: 'Optional sub-groups, e.g. local chapters of a national group. Each chapter is a group with its own settings and memberships. Only chapters the viewer may discover are included; chapters of a sensitive group are sensitive.' }),
    member_count: GroupMemberCount,
    admins: GroupAdminList,
    created_at: Instant,
    viewer: GroupViewer.nullable().openapi({ description: '`null` for anonymous viewers.' }),
  })
  .refine((g) => !g.sensitive || (g.membership_visibility !== 'public' && g.post_visibility === 'members_only'), {
    message: 'Sensitive groups cannot have public members or posts',
    path: ['sensitive'],
  })
  .openapi('Group', { description: 'A group with its independent discoverability, membership-visibility, post-visibility and join settings.' });

export const GroupSearchResult = page(GroupSummary).openapi('GroupSearchResult', { description: 'Listed groups only. Identical for every viewer.' });

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

export const GroupMembership = z
  .object({
    id: id('membership'),
    profile: ProfileSummary,
    role: GroupRole,
    joined_at: Instant,
  })
  .openapi('GroupMembership', { description: 'An active member as shown in a group’s member list. Pending, removed and blocked people never appear.' });

export const GroupMemberPage = page(GroupMembership).openapi('GroupMemberPage');

export const MyGroupMembership = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('active'), id: id('membership'), group: GroupRef, role: GroupRole, joined_at: Instant }),
    z.object({ state: z.literal('pending'), id: id('membership'), group: GroupRef, requested_at: Instant }),
  ])
  .openapi('MyGroupMembership', { description: 'The signed-in member’s own membership. A membership is a separate record from the public profile and from event RSVPs.' });

// ---------------------------------------------------------------------------
// Conversation (#27) and requests (#28)
// ---------------------------------------------------------------------------

export const GroupPostKind = z
  .enum(['discussion', 'question', 'introduction', 'resource', 'request'])
  .openapi('GroupPostKind', { description: '`request`: a wanted item, recommendation or activity interest (#28), gated by the `community.requests` feature.' });

export const GroupPostExperienceBasis = z
  .enum(['personal_experience', 'shared_resource', 'conversation'])
  .openapi('GroupPostExperienceBasis', {
    description:
      '`personal_experience`: the author describes their own situation; it may not apply to anyone else and is not official guidance. `shared_resource`: points to or summarises an external source; the source is authoritative, the summary is not reviewed. `conversation`: an introduction, question, request or chat with no factual claim.',
  });

export const GroupPostExperienceLabel = z
  .object({
    basis: GroupPostExperienceBasis,
    verification: z.enum(['not_verified']).openapi({ description: 'livingin.jp does not check group posts, even ones that link to official sources. More values may be added only if a reviewed process is introduced.' }),
  })
  .openapi('GroupPostExperienceLabel', { description: 'Makes clear what kind of claim a post makes, so a resident’s personal experience is never mistaken for verified or official information. Chosen by the author; moderators may correct it.' });

export const GroupRequestType = z
  .enum(['wanted_item', 'recommendation', 'activity_interest'])
  .openapi('GroupRequestType', { description: '`activity_interest`: the author is gauging interest or availability for an activity, which may later become an event.' });

export const GroupRequest = z
  .object({
    request_type: GroupRequestType,
    resolution: z
      .discriminatedUnion('status', [
        z.object({ status: z.literal('open') }),
        z.object({ status: z.literal('resolved'), resolved_at: Instant, note: z.string().nullable().openapi({ description: 'Optional note from the author on how the request was resolved.' }) }),
      ])
      .openapi({ description: 'Set by the request’s author (or a group moderator). Resolution is self-reported.' }),
    linked_event_id: id('event')
      .nullable()
      .openapi({
        description:
          'The event created from this request, if any. Creating an event never RSVPs, invites or names the people who replied or expressed interest: each participant explicitly chooses to RSVP to the event themselves.',
      }),
  })
  .openapi('GroupRequest', { description: 'The request block of a `request` post (#28).' });

const postFields = {
  id: id('post'),
  group_id: id('group'),
  author: ProfileSummary,
  title: z.string(),
  body: z.string().openapi({ description: 'Plain text. Clients must not render it as HTML.' }),
  pinned: z.boolean().openapi({ description: 'Pinned by a group admin, e.g. a resource list.' }),
  experience_label: GroupPostExperienceLabel,
  reply_count: z.int().min(0),
  created_at: Instant,
};

const ordinaryPostKind = z.enum(['discussion', 'question', 'introduction', 'resource']);

export const GroupPost = z
  .discriminatedUnion('kind', [
    z.object({ ...postFields, kind: ordinaryPostKind }),
    z.object({ ...postFields, kind: z.literal('request'), request: GroupRequest }),
  ])
  .openapi('GroupPost', { description: 'A published post as group readers see it. Request posts carry a `request` block.' });

export const GroupPostPage = page(GroupPost).openapi('GroupPostPage');

export const GroupPostPublication = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('published'), published_at: Instant }),
    z.object({
      state: z.literal('pending_review'),
      submitted_at: Instant,
      reviewer: z.enum(['group_moderators', 'automated_screening']).openapi({ description: '`group_moderators`: the group reviews posts (e.g. from new members) before they appear. `automated_screening`: screening has not finished.' }),
    }),
    z.object({
      state: z.literal('held'),
      held_at: Instant,
      reason: z.object({ code: z.enum(['needs_human_review', 'possible_personal_information', 'policy_check']), explanation: z.string() }),
    }),
  ])
  .openapi('GroupPostPublication', { description: 'Whether other members can see the post yet. `pending_review` and `held` posts are visible only to the author and group moderators; no publication is implied.' });

export const AuthorGroupPost = z
  .discriminatedUnion('kind', [
    z.object({ ...postFields, kind: ordinaryPostKind, publication: GroupPostPublication }),
    z.object({ ...postFields, kind: z.literal('request'), request: GroupRequest, publication: GroupPostPublication }),
  ])
  .openapi('AuthorGroupPost', { description: 'The author’s private view of their post, including publication state.' });

export const GroupPostInput = z
  .object({
    kind: GroupPostKind,
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(10000),
    experience_label: GroupPostExperienceBasis,
    request: z
      .object({ request_type: GroupRequestType })
      .strict()
      .optional()
      .openapi({ description: 'Required when `kind` is `request`; not allowed otherwise.' }),
  })
  .strict()
  .refine((v) => (v.kind === 'request') === (v.request !== undefined), { message: '`request` is required for request posts and not allowed otherwise', path: ['request'] })
  .openapi('GroupPostInput', { description: 'Pinning is done by admins separately and cannot be set here.' });

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const groupParams = z.object({ group_id: id('group') });

export const communityOperations = [
  defineOperation({
    operationId: 'listGroups',
    module: 'community',
    feature: 'community.groups',
    method: 'get',
    path: '/v1/groups',
    summary: 'Discover groups',
    description:
      'Listed groups only: unlisted groups never appear, even to their members. Results are identical for every viewer and never include member names, so search cannot reveal anyone’s membership; sensitive groups appear with a hidden member count. livingin.jp does not suggest or assign groups from inferred traits. Sorted by relevance when `q` is given, otherwise by name; cursors are stable.',
    auth: 'optional',
    request: {
      query: PageQuery.extend({
        q: z.string().max(200).optional().openapi({ description: 'Matches group name, tagline and description only, never member names or posts.' }),
        kind: GroupKind.optional(),
        locality: z
          .string()
          .regex(/^JP-\d{2}(-\d{3})?$/)
          .optional()
          .openapi({ description: 'Prefecture or municipality code. Returns only `local` groups (including chapters) in that jurisdiction. Omit to browse national, online and local groups without choosing a location.' }),
      }),
    },
    responses: { 200: { description: 'A page of listed groups.', schema: GroupSearchResult } },
    requiredScenarios: ['empty'],
  }),
  defineOperation({
    operationId: 'getGroup',
    module: 'community',
    feature: 'community.groups',
    method: 'get',
    path: '/v1/groups/{group_id}',
    summary: 'Group',
    description:
      'An unlisted group returns 404 to anyone without an active or pending membership, indistinguishable from a group that does not exist. Sensitive groups never expose members, member count or (to non-members) admins, and clients must not show their names in default notification previews.',
    auth: 'optional',
    request: { params: groupParams },
    responses: { 200: { description: 'A group, with the viewer’s membership state when signed in.', schema: Group } },
    requiredScenarios: ['approval_required', 'unlisted_member_view', 'sensitive', 'removed_member_view', 'blocked_viewer', 'not_found'],
  }),
  defineOperation({
    operationId: 'listGroupMembers',
    module: 'community',
    feature: 'community.groups',
    method: 'get',
    path: '/v1/groups/{group_id}/members',
    summary: 'Group members',
    description:
      'Active members only: admins and moderators first, then by `joined_at` (stable cursor). Access follows `membership_visibility`; anyone else receives 403 `forbidden` (members of sensitive groups are never public). An unlisted group returns 404 to non-members. Members who blocked the viewer, or whom the viewer blocked, are omitted.',
    auth: 'optional',
    request: { params: groupParams, query: PageQuery.extend({ role: GroupRole.optional() }) },
    responses: { 200: { description: 'A page of active members.', schema: GroupMemberPage } },
    errors: ['forbidden'],
    requiredScenarios: ['empty', 'forbidden', 'not_found'],
  }),
  defineOperation({
    operationId: 'joinGroup',
    module: 'community',
    feature: 'community.groups',
    method: 'post',
    path: '/v1/groups/{group_id}/memberships',
    summary: 'Join or request to join a group',
    description:
      'Open groups: 201 with an `active` membership. Approval groups: 202 with a `pending` membership for an admin to review. If the viewer already has an active or pending membership it is returned unchanged; a second membership is never created. 403 `forbidden` for invite-only groups and for viewers removed or blocked from the group. An unlisted group returns 404 to non-members. For sensitive groups, notifications about the request never name the group in their default preview.',
    auth: 'required',
    idempotent: true,
    request: { params: groupParams },
    responses: {
      201: { description: 'Joined an open group.', schema: MyGroupMembership },
      202: { description: 'Join request recorded for an approval group; not yet a member.', schema: MyGroupMembership },
    },
    errors: ['forbidden'],
    requiredScenarios: ['pending_approval', 'forbidden', 'not_found'],
  }),
  defineOperation({
    operationId: 'listGroupPosts',
    module: 'community',
    feature: 'community.conversation',
    method: 'get',
    path: '/v1/groups/{group_id}/posts',
    summary: 'Group conversation',
    description:
      'Published posts only, pinned first, then newest first (stable cursor). Access follows `post_visibility`: members-only content returns 403 `forbidden` to anonymous viewers and non-members; an unlisted group returns 404 to non-members. Posts by members the viewer has blocked, or who blocked the viewer, are omitted. Posts are residents’ contributions and are never verified by livingin.jp; see `experience_label`. Request posts appear only while `community.requests` is enabled.',
    auth: 'optional',
    request: {
      params: groupParams,
      query: PageQuery.extend({
        kind: GroupPostKind.optional(),
        pinned: z.enum(['true', 'false']).optional().openapi({ description: '`true`: pinned posts only. `false`: unpinned posts only.' }),
      }),
    },
    responses: { 200: { description: 'A page of published posts.', schema: GroupPostPage } },
    errors: ['forbidden'],
    requiredScenarios: ['empty', 'forbidden', 'not_found'],
  }),
  defineOperation({
    operationId: 'createGroupPost',
    module: 'community',
    feature: 'community.conversation',
    method: 'post',
    path: '/v1/groups/{group_id}/posts',
    summary: 'Post in a group',
    description:
      'Active members only; anyone else receives 403 `forbidden` (an unlisted group returns 404 to non-members). Returns the author’s view with `publication`: `published`, `pending_review` (the group reviews posts first, or screening has not finished) or `held` (a moderator must decide). A `request` post also requires the `community.requests` feature (403 `feature_disabled` otherwise). Notifications about posts in sensitive groups never name the group or quote the post in default previews.',
    auth: 'required',
    idempotent: true,
    request: { params: groupParams, body: GroupPostInput },
    responses: { 201: { description: 'Post created. Check `publication` before treating it as visible to others.', schema: AuthorGroupPost } },
    errors: ['forbidden'],
    requiredScenarios: ['pending_review', 'held', 'forbidden', 'not_found'],
  }),
];
