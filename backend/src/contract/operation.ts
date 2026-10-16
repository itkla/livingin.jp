import type { FeatureKey } from './features';
import { ERROR_CODES, type ErrorCode } from './problem';
import type { z } from './zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type ModuleName = 'system' | 'identity' | 'sources' | 'living' | 'community' | 'work' | 'events' | 'marketplace' | 'safety';
export type Role = 'member' | 'operator';

export interface SuccessResponse {
  description: string;
  /** Omit for 204 No Content. */
  schema?: z.ZodType;
  headers?: Record<string, { description: string; required?: boolean }>;
}

export interface Operation {
  operationId: string;
  module: ModuleName;
  /** Activation gate. Omit only for system/meta endpoints that are always on. */
  feature?: FeatureKey;
  method: HttpMethod;
  /** OpenAPI-style path, e.g. `/v1/listings/{listing_id}`. */
  path: string;
  summary: string;
  description?: string;
  /** `optional`: anonymous allowed, but the response may differ for a signed-in viewer. */
  auth: 'none' | 'optional' | 'required';
  /** Roles allowed in addition to authentication. Omit for any signed-in member. */
  roles?: Role[];
  /** Mutation requires an `Idempotency-Key` header and replays the stored response on retry. */
  idempotent?: boolean;
  /**
   * POST used only to send a structured input (e.g. a calculator). Creates and changes nothing,
   * so it needs no Idempotency-Key and may be called anonymously.
   */
  pure?: boolean;
  /** Mutation requires `If-Match: "<revision>"` and fails with 412 on a stale revision. */
  ifMatch?: boolean;
  request?: {
    params?: z.ZodObject;
    query?: z.ZodObject;
    body?: z.ZodType;
  };
  /** Success responses only. Standard error responses are derived from the flags above. */
  responses: Record<number, SuccessResponse>;
  /** Domain-specific error codes beyond the derived ones, e.g. `conflict`. */
  errors?: ErrorCode[];
  /** Fixture scenario names that must exist for this operation (in addition to `default`). */
  requiredScenarios?: string[];
}

export function defineOperation<const T extends Operation>(op: T): T {
  return op;
}

const isMutation = (op: Operation) => op.method !== 'get' && !op.pure;

/** Every error code an operation can return, derived from its declared behaviour. */
export function documentedErrors(op: Operation): ErrorCode[] {
  const codes = new Set<ErrorCode>(['rate_limited', 'internal_error', 'service_unavailable']);
  const req = op.request ?? {};
  if (req.params || req.query || req.body) codes.add('validation_failed');
  if (req.body) ['malformed_request', 'unsupported_media_type', 'payload_too_large'].forEach((c) => codes.add(c as ErrorCode));
  if (op.auth === 'required') codes.add('authentication_required');
  if (op.auth !== 'none' && isMutation(op)) codes.add('account_restricted');
  if (op.roles) codes.add('forbidden');
  if (op.path.includes('{')) codes.add('not_found');
  if (op.feature) codes.add('feature_disabled');
  if (op.idempotent) ['idempotency_key_required', 'idempotency_key_reused', 'idempotency_request_in_progress'].forEach((c) => codes.add(c as ErrorCode));
  if (op.ifMatch) ['precondition_required', 'revision_conflict'].forEach((c) => codes.add(c as ErrorCode));
  for (const c of op.errors ?? []) codes.add(c);
  return [...codes];
}

export function documentedStatuses(op: Operation): number[] {
  const statuses = new Set<number>(Object.keys(op.responses).map(Number));
  for (const code of documentedErrors(op)) statuses.add(ERROR_CODES[code].status);
  return [...statuses].sort((a, b) => a - b);
}

/** `/v1/listings/{listing_id}` -> `/v1/listings/:listing_id` */
export function toHonoPath(path: string): string {
  return path.replace(/\{([a-z_]+)\}/g, ':$1');
}
