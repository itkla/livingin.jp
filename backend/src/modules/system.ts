import { ActivationState, Instant } from '../contract/common';
import { FEATURE_KEYS } from '../contract/features';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';

export const Health = z
  .object({
    status: z.enum(['ok', 'degraded']),
    mode: z.enum(['mock', 'live']),
    contract_version: z.string(),
    checks: z.object({
      database: z.enum(['ok', 'error', 'not_configured']),
    }),
    checked_at: Instant,
  })
  .openapi('Health');

export const FeatureState = z
  .object({
    key: z.enum(FEATURE_KEYS),
    state: ActivationState,
    reason: z.string().nullable().openapi({ description: 'Why the feature is disabled or held, when it is.' }),
    coverage_note: z.string().nullable().openapi({ description: 'Enabled scope limits, e.g. pilot localities only.' }),
  })
  .openapi('FeatureState');

export const Meta = z
  .object({
    contract_version: z.string(),
    mode: z.enum(['mock', 'live']),
    features: z.array(FeatureState).openapi({ description: 'Enabled-feature manifest. Clients should hide features that are not `enabled`.' }),
  })
  .openapi('Meta');

export const systemOperations = [
  defineOperation({
    operationId: 'getHealth',
    module: 'system',
    method: 'get',
    path: '/v1/health',
    summary: 'Service health',
    auth: 'none',
    responses: { 200: { description: 'Service is reachable. `degraded` means a dependency check failed.', schema: Health } },
  }),
  defineOperation({
    operationId: 'getMeta',
    module: 'system',
    method: 'get',
    path: '/v1/meta',
    summary: 'Contract version and enabled-feature manifest',
    auth: 'none',
    responses: { 200: { description: 'Contract version and feature activation states.', schema: Meta } },
    requiredScenarios: ['p1_alpha'],
  }),
];
