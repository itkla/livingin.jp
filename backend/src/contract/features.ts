/**
 * Feature keys gate activation independently of code completion (docs/DECISIONS_AND_RISKS.md,
 * "Independent activation decisions"). Each key names the issue that owns it.
 */
export const FEATURES = {
  'identity.accounts': { module: 'identity', issue: 13 },
  'sources.registry': { module: 'sources', issue: 43 },
  'living.guides': { module: 'living', issue: 18 },
  'living.almanac': { module: 'living', issue: 19 },
  'living.tools': { module: 'living', issue: 20 },
  'living.my_life': { module: 'living', issue: 21 },
  'community.groups': { module: 'community', issue: 26 },
  'community.conversation': { module: 'community', issue: 27 },
  'community.requests': { module: 'community', issue: 28 },
  'work.jobs': { module: 'work', issue: 31 },
  'work.career_workspace': { module: 'work', issue: 32 },
  'events.events': { module: 'events', issue: 33 },
  'events.participation': { module: 'events', issue: 34 },
  'marketplace.listings': { module: 'marketplace', issue: 37 },
  'marketplace.review': { module: 'marketplace', issue: 38 },
  'marketplace.coordination': { module: 'marketplace', issue: 39 },
  'safety.preparedness': { module: 'safety', issue: 40 },
  'safety.live_warnings': { module: 'safety', issue: 41 },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as [FeatureKey, ...FeatureKey[]];
