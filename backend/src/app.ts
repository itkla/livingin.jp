import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { buildOpenApiDocument } from './contract/openapi';
import { toHonoPath } from './contract/operation';
import { problem } from './contract/problem';
import type { FeatureKey } from './contract/features';
import type { Database } from './db/client';
import { loadFixtures, type FixtureFile } from './http/fixtures';
import { MemoryIdempotencyStore, type IdempotencyStore } from './http/idempotency';
import { runOperation, type LiveHandler, type PipelineOptions, type Reply } from './http/pipeline';
import { createLiveHandlers } from './live';
import { allOperations } from './modules';

export interface AppOptions {
  mode: 'mock' | 'live';
  corsOrigins?: string[];
  db?: Database | null;
  fixtures?: Map<string, FixtureFile>;
  idempotency?: IdempotencyStore;
  enabledFeatures?: ReadonlySet<FeatureKey>;
  liveHandlers?: Partial<Record<string, LiveHandler>>;
  validateResponses?: boolean;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function send(reply: Reply): Response {
  const headers = new Headers(reply.headers ?? {});
  if (reply.body === undefined) return new Response(null, { status: reply.status, headers });
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers });
}

export function createApp(options: AppOptions) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  const db = options.db ?? null;
  const pipeline: PipelineOptions = {
    mode: options.mode,
    fixtures: options.fixtures ?? (options.mode === 'mock' ? loadFixtures() : new Map()),
    liveHandlers: options.liveHandlers ?? createLiveHandlers({ db, mode: options.mode }),
    idempotency: options.idempotency ?? new MemoryIdempotencyStore(),
    enabledFeatures: options.enabledFeatures ?? new Set(),
    validateResponses: options.validateResponses ?? true,
  };
  const allowed = new Set(options.corsOrigins ?? []);

  app.use('*', async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    c.set('requestId', requestId);
    await next();
    c.res.headers.set('X-Request-Id', requestId);
    if (options.mode === 'mock') c.res.headers.set('X-Livingin-Mode', 'mock');
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  app.use(
    '*',
    cors({
      origin: (origin) => (allowed.has(origin) || (options.mode === 'mock' && LOCAL_ORIGIN.test(origin)) ? origin : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'Idempotency-Key', 'If-Match', 'Prefer', 'X-CSRF-Token', 'X-Request-Id'],
      exposeHeaders: ['ETag', 'X-Request-Id', 'Idempotent-Replayed', 'Retry-After', 'Content-Language', 'X-Livingin-Mode'],
      maxAge: 600,
    }),
  );

  const operations = allOperations;
  let openapi: unknown;
  app.get('/openapi.json', (c) => c.json((openapi ??= buildOpenApiDocument(operations))));
  app.get('/', (c) => c.json({ name: 'livingin.jp API', mode: options.mode, openapi: '/openapi.json', health: '/v1/health' }));

  for (const op of operations) {
    app.on(op.method.toUpperCase(), toHonoPath(op.path), async (c) => send(await runOperation(c, op, pipeline, c.get('requestId'))));
  }

  app.notFound((c) => c.json(problem('not_found', c.get('requestId') ?? randomUUID()), 404, { 'Content-Type': 'application/problem+json' }));
  app.onError((err, c) => {
    console.error(JSON.stringify({ level: 'error', request_id: c.get('requestId'), message: err.message, stack: err.stack }));
    return c.json(problem('internal_error', c.get('requestId') ?? randomUUID()), 500, { 'Content-Type': 'application/problem+json' });
  });

  return app;
}
