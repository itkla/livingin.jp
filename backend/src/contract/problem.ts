import { z } from './zod';

/**
 * Stable, machine-readable error codes. Codes are part of the contract: they may be added in a
 * minor version, never renamed or removed. `retryable` is the default for that code.
 */
export const ERROR_CODES = {
  malformed_request: { status: 400, title: 'Malformed request', retryable: false },
  validation_failed: { status: 400, title: 'Validation failed', retryable: false },
  idempotency_key_required: { status: 400, title: 'Idempotency-Key header required', retryable: false },
  authentication_required: { status: 401, title: 'Authentication required', retryable: false },
  forbidden: { status: 403, title: 'Forbidden', retryable: false },
  account_restricted: { status: 403, title: 'Account restricted', retryable: false },
  feature_disabled: { status: 403, title: 'Feature not enabled', retryable: false },
  not_found: { status: 404, title: 'Not found', retryable: false },
  conflict: { status: 409, title: 'Conflict', retryable: false },
  idempotency_request_in_progress: { status: 409, title: 'Request with this Idempotency-Key is still in progress', retryable: true },
  revision_conflict: { status: 412, title: 'Revision conflict', retryable: false },
  payload_too_large: { status: 413, title: 'Payload too large', retryable: false },
  unsupported_media_type: { status: 415, title: 'Unsupported media type', retryable: false },
  idempotency_key_reused: { status: 422, title: 'Idempotency-Key reused with a different request', retryable: false },
  precondition_required: { status: 428, title: 'If-Match header required', retryable: false },
  rate_limited: { status: 429, title: 'Too many requests', retryable: true },
  internal_error: { status: 500, title: 'Internal error', retryable: true },
  not_implemented: { status: 501, title: 'Not implemented', retryable: false },
  service_unavailable: { status: 503, title: 'Service unavailable', retryable: true },
} as const satisfies Record<string, { status: number; title: string; retryable: boolean }>;

export type ErrorCode = keyof typeof ERROR_CODES;
export const ErrorCodeSchema = z
  .enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]])
  .openapi('ErrorCode', { description: 'Stable machine-readable error code. See docs/api/CONVENTIONS.md#errors.' });

export const FieldError = z
  .object({
    pointer: z.string().openapi({ description: 'JSON Pointer (RFC 6901) into the request: `/body/title`, `/query/limit`, `/params/listing_id`, `/headers/if-match`.', example: '/body/title' }),
    code: z.string().openapi({ description: 'Machine-readable reason, e.g. `too_small`, `invalid_type`, `invalid_format`, `unrecognized_keys`.', example: 'too_small' }),
    message: z.string(),
  })
  .openapi('FieldError');

/** RFC 9457 problem details, served as `application/problem+json`. */
export const Problem = z
  .object({
    type: z.string().openapi({ description: '`urn:livingin:problem:<code>`', example: 'urn:livingin:problem:validation_failed' }),
    title: z.string(),
    status: z.int(),
    code: ErrorCodeSchema,
    detail: z.string().optional().openapi({ description: 'Human-readable explanation safe to show to the requester.' }),
    request_id: z.string().openapi({ description: 'Echoes the X-Request-Id response header. Quote it in support requests.' }),
    retryable: z.boolean(),
    retry_after_seconds: z.int().min(0).optional(),
    fields: z.array(FieldError).optional(),
    current_revision: z.int().min(1).optional().openapi({ description: 'Present on `revision_conflict`: the revision the server currently holds.' }),
  })
  .openapi('Problem', { description: 'RFC 9457 problem details.' });

export type ProblemBody = z.infer<typeof Problem>;

export function problem(code: ErrorCode, requestId: string, extra: Partial<Omit<ProblemBody, 'type' | 'code' | 'status' | 'request_id'>> = {}): ProblemBody {
  const def = ERROR_CODES[code];
  return {
    type: `urn:livingin:problem:${code}`,
    title: def.title,
    status: def.status,
    code,
    request_id: requestId,
    retryable: def.retryable,
    ...extra,
  };
}
