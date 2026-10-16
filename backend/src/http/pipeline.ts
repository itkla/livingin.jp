import type { Context } from 'hono';
import type { z } from 'zod';
import type { FeatureKey } from '../contract/features';
import { documentedStatuses, type Operation } from '../contract/operation';
import { problem, type ErrorCode, type ProblemBody } from '../contract/problem';
import { mockActorFromAuthorization, type Actor } from './actor';
import type { FixtureFile } from './fixtures';
import { fingerprint, type IdempotencyStore, type StoredResponse } from './idempotency';

export const MAX_BODY_BYTES = 1_000_000;

/** Mock scenarios available on every operation, for exercising generic failure states. */
export const GENERIC_SCENARIOS = ['feature_disabled', 'rate_limited', 'internal_error', 'service_unavailable'] as const;

export interface LiveContext {
  c: Context;
  op: Operation;
  actor: Actor | null;
  requestId: string;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}

export interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type LiveHandler = (ctx: LiveContext) => Promise<Reply>;

export interface PipelineOptions {
  mode: 'mock' | 'live';
  fixtures: Map<string, FixtureFile>;
  liveHandlers: Partial<Record<string, LiveHandler>>;
  idempotency: IdempotencyStore;
  /** Live mode only: features switched on for this deployment. */
  enabledFeatures: ReadonlySet<FeatureKey>;
  /** Validate every live response against the contract before sending it (non-production). */
  validateResponses: boolean;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}, contentType = 'application/json'): Reply => ({
  status,
  body,
  headers: { 'Content-Type': contentType, ...headers },
});

export function problemReply(code: ErrorCode, requestId: string, extra: Partial<ProblemBody> = {}, headers: Record<string, string> = {}): Reply {
  const body = problem(code, requestId, extra);
  return json(body.status, body, headers, 'application/problem+json');
}

function preferredScenario(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return /(?:^|[,;\s])example=("?)([A-Za-z0-9_-]+)\1/.exec(header)?.[2];
}

function issuesToFields(location: string, error: z.ZodError) {
  return error.issues.map((i) => ({
    pointer: `/${[location, ...i.path.map(String)].map((s) => s.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`,
    code: i.code,
    message: i.message,
  }));
}

function parseEtag(etag: string | undefined): number | undefined {
  const m = etag && /^(?:W\/)?"(\d+)"$/.exec(etag.trim());
  return m ? Number(m[1]) : undefined;
}

function genericScenarioReply(name: (typeof GENERIC_SCENARIOS)[number], requestId: string): Reply {
  switch (name) {
    case 'feature_disabled':
      return problemReply('feature_disabled', requestId, { detail: 'This feature is not enabled in this deployment.' });
    case 'rate_limited':
      return problemReply('rate_limited', requestId, { retry_after_seconds: 30 }, { 'Retry-After': '30' });
    case 'internal_error':
      return problemReply('internal_error', requestId);
    case 'service_unavailable':
      return problemReply('service_unavailable', requestId, { retry_after_seconds: 60 }, { 'Retry-After': '60' });
  }
}

async function readBody(c: Context, requestId: string): Promise<{ ok: true; value: unknown } | { ok: false; reply: Reply }> {
  const contentType = c.req.header('content-type') ?? '';
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType)) {
    return { ok: false, reply: problemReply('unsupported_media_type', requestId, { detail: 'Send the request body as application/json.' }) };
  }
  const raw = await c.req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return { ok: false, reply: problemReply('payload_too_large', requestId) };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reply: problemReply('malformed_request', requestId, { detail: 'Request body is not valid JSON.' }) };
  }
}

/**
 * The request pipeline shared by mock and live modes. Order: generic mock scenario -> live
 * implementation check -> feature gate -> authentication/roles -> validation -> If-Match ->
 * idempotency -> responder.
 */
export async function runOperation(c: Context, op: Operation, opts: PipelineOptions, requestId: string): Promise<Reply> {
  const scenarioName = opts.mode === 'mock' ? preferredScenario(c.req.header('prefer')) : undefined;
  if (scenarioName && (GENERIC_SCENARIOS as readonly string[]).includes(scenarioName)) {
    return genericScenarioReply(scenarioName as (typeof GENERIC_SCENARIOS)[number], requestId);
  }

  const live = opts.liveHandlers[op.operationId];
  if (opts.mode === 'live') {
    if (!live) return problemReply('not_implemented', requestId, { detail: `${op.operationId} is contracted but not implemented in live mode yet. Use the mock server.` });
    if (op.feature && !opts.enabledFeatures.has(op.feature)) return problemReply('feature_disabled', requestId);
  }

  // Authentication. The live service has no session provider yet (ADR 0005), so only the
  // mock server resolves actors.
  let actor: Actor | null = null;
  if (op.auth !== 'none') {
    const resolved = opts.mode === 'mock' ? mockActorFromAuthorization(c.req.header('authorization')) : null;
    if (resolved === 'invalid') return problemReply('authentication_required', requestId, { detail: 'Credentials were not recognised. The mock server accepts `Authorization: Bearer mock:<persona>`.' });
    actor = resolved;
    if (op.auth === 'required' && !actor) return problemReply('authentication_required', requestId);
    if (actor && op.roles && !op.roles.some((r) => actor!.roles.includes(r))) return problemReply('forbidden', requestId);
    if (actor?.restricted && op.method !== 'get' && !op.pure) return problemReply('account_restricted', requestId, { detail: 'This account cannot make changes while a restriction is in effect.' });
  }

  // Validation.
  const req = op.request ?? {};
  const fields: ReturnType<typeof issuesToFields> = [];
  let params: Record<string, unknown> = {};
  let query: Record<string, unknown> = {};
  let body: unknown = undefined;
  if (req.params) {
    const r = req.params.safeParse(c.req.param());
    if (r.success) params = r.data as Record<string, unknown>;
    else fields.push(...issuesToFields('params', r.error));
  }
  if (req.query) {
    const r = req.query.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (r.success) query = r.data as Record<string, unknown>;
    else fields.push(...issuesToFields('query', r.error));
  }
  if (req.body) {
    const read = await readBody(c, requestId);
    if (!read.ok) return read.reply;
    const r = req.body.safeParse(read.value);
    if (r.success) body = r.data;
    else fields.push(...issuesToFields('body', r.error));
  }
  if (fields.length) return problemReply('validation_failed', requestId, { fields });

  const fixture = opts.fixtures.get(op.operationId);

  // Optimistic concurrency.
  if (op.ifMatch) {
    const ifMatch = c.req.header('if-match');
    if (!ifMatch) return problemReply('precondition_required', requestId, { fields: [{ pointer: '/headers/if-match', code: 'required', message: 'Send the ETag of the revision you are changing.' }] });
    if (opts.mode === 'mock') {
      const current = parseEtag(fixture?.current_etag);
      if (current !== undefined && parseEtag(ifMatch) !== current) {
        return problemReply('revision_conflict', requestId, { current_revision: current, detail: 'The resource changed since you loaded it. Reload and reapply your edit.' }, { ETag: `"${current}"` });
      }
    }
  }

  const respond = async (): Promise<Reply> => {
    if (opts.mode === 'live') {
      const reply = await live!({ c, op, actor, requestId, params, query, body });
      if (opts.validateResponses) assertReplyMatchesContract(op, reply);
      return reply;
    }
    return mockReply(op, fixture, scenarioName, requestId);
  };

  if (!op.idempotent) return respond();

  // Idempotency.
  const key = c.req.header('idempotency-key');
  if (!key || key.length > 255) {
    return problemReply('idempotency_key_required', requestId, { fields: [{ pointer: '/headers/idempotency-key', code: 'required', message: 'Send a unique Idempotency-Key (1–255 characters) with this request.' }] });
  }
  const path = new URL(c.req.url).pathname;
  const scope = `${actor?.account_id ?? 'anonymous'} ${op.method.toUpperCase()} ${path}`;
  // The mock scenario is part of the fingerprint so switching scenarios does not look like key reuse.
  const begun = await opts.idempotency.begin(scope, key, fingerprint(op.method, path, { body, scenario: scenarioName ?? null }));
  if (begun.kind === 'mismatch') return problemReply('idempotency_key_reused', requestId);
  if (begun.kind === 'in_progress') return problemReply('idempotency_request_in_progress', requestId, { retry_after_seconds: 1 }, { 'Retry-After': '1' });
  if (begun.kind === 'replay') {
    const stored = begun.response;
    return { status: stored.status, body: stored.body === null ? undefined : JSON.parse(stored.body), headers: { ...stored.headers, 'Idempotent-Replayed': 'true' } };
  }
  try {
    const reply = await respond();
    if (reply.status >= 500) await opts.idempotency.release(scope, key);
    else await opts.idempotency.complete(scope, key, toStored(reply));
    return reply;
  } catch (err) {
    await opts.idempotency.release(scope, key);
    throw err;
  }
}

function toStored(reply: Reply): StoredResponse {
  return { status: reply.status, headers: reply.headers ?? {}, body: reply.body === undefined ? null : JSON.stringify(reply.body) };
}

function mockReply(op: Operation, fixture: FixtureFile | undefined, scenarioName: string | undefined, requestId: string): Reply {
  if (!fixture) return problemReply('not_implemented', requestId, { detail: `No fixture exists for ${op.operationId}.` });
  const name = scenarioName ?? 'default';
  const scenario = fixture.scenarios[name];
  if (!scenario) {
    const available = [...Object.keys(fixture.scenarios), ...GENERIC_SCENARIOS].join(', ');
    return problemReply('malformed_request', requestId, { detail: `Unknown mock scenario "${name}" for ${op.operationId}. Available: ${available}.` });
  }
  const isProblem = scenario.status >= 400;
  const body = isProblem && scenario.body && typeof scenario.body === 'object' ? { ...(scenario.body as object), request_id: requestId } : scenario.body;
  if (scenario.status === 204 || body === undefined) return { status: scenario.status, headers: { ...(scenario.headers ?? {}) } };
  return json(scenario.status, body, scenario.headers ?? {}, isProblem ? 'application/problem+json' : 'application/json');
}

export class ContractViolation extends Error {}

export function assertReplyMatchesContract(op: Operation, reply: Reply): void {
  if (!documentedStatuses(op).includes(reply.status)) throw new ContractViolation(`${op.operationId} returned undocumented status ${reply.status}`);
  const success = op.responses[reply.status];
  if (success?.schema) {
    const r = success.schema.safeParse(reply.body);
    if (!r.success) throw new ContractViolation(`${op.operationId} ${reply.status} body violates contract: ${r.error.message}`);
  }
}
