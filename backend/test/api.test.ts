import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app';
import { Problem } from '../src/contract/problem';
import { createPgliteDatabase, type Database } from '../src/db/client';
import { migrateUp } from '../src/db/migrate';

const mock = createApp({ mode: 'mock' });
const LISTING = 'lst_01JA0000000000000000000001';
const listingBody = {
  kind: 'single',
  title: 'Wooden desk',
  description: 'Pickup only.',
  items: [{ title: 'Wooden desk', category: 'furniture', condition: 'good', dimensions: null, price: { kind: 'sale', price: { amount: 3000, currency: 'JPY' } }, photo_media_ids: [] }],
  pickup_locality_code: 'JP-13-112',
  pickup_area_label: 'Near Sangenjaya Station',
  pickup_window: { available_from: '2026-11-07', available_until: '2026-11-22', time_zone: 'Asia/Tokyo' },
};

function req(path: string, init: RequestInit & { persona?: string; scenario?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.persona) headers.set('Authorization', `Bearer mock:${init.persona}`);
  if (init.scenario) headers.set('Prefer', `example=${init.scenario}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return mock.request(path, { ...init, headers });
}

/** Test payloads are asserted field by field. */
const json = async (res: Response): Promise<any> => res.json();

async function expectProblem(res: Response, status: number, code: string) {
  assert.equal(res.status, status);
  assert.match(res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  const body = Problem.parse(await json(res));
  assert.equal(body.code, code);
  assert.equal(body.request_id, res.headers.get('x-request-id'));
  return body;
}

describe('mock mode: reads', () => {
  test('anonymous read of a public resource', async () => {
    const res = await req(`/v1/listings/${LISTING}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-livingin-mode'), 'mock');
    assert.ok(res.headers.get('x-request-id'));
    assert.equal((await json(res)).id, LISTING);
  });

  test('Prefer: example=<scenario> selects a fixture scenario', async () => {
    const res = await req(`/v1/listings/${LISTING}`, { scenario: 'bundle_partially_sold' });
    assert.equal((await json(res)).availability_summary, 'partially_available');
  });

  test('unknown scenario is reported with the available names', async () => {
    const body = await expectProblem(await req(`/v1/listings/${LISTING}`, { scenario: 'nope' }), 400, 'malformed_request');
    assert.match(body.detail ?? '', /bundle_partially_sold/);
  });

  test('generic scenarios work on every operation', async () => {
    const res = await req('/v1/listings', { scenario: 'rate_limited' });
    await expectProblem(res, 429, 'rate_limited');
    assert.equal(res.headers.get('retry-after'), '30');
    await expectProblem(await req('/v1/health', { scenario: 'service_unavailable' }), 503, 'service_unavailable');
    await expectProblem(await req('/v1/listings', { scenario: 'feature_disabled' }), 403, 'feature_disabled');
  });

  test('fixture problems carry the live request id', async () => {
    const res = await req(`/v1/listings/${LISTING}`, { scenario: 'not_found', headers: { 'X-Request-Id': 'test-request-0001' } });
    const body = await expectProblem(res, 404, 'not_found');
    assert.equal(body.request_id, 'test-request-0001');
  });

  test('invalid path parameter is a validation problem with a JSON pointer', async () => {
    const body = await expectProblem(await req('/v1/listings/not-an-id'), 400, 'validation_failed');
    assert.equal(body.fields?.[0]?.pointer, '/params/listing_id');
  });

  test('invalid query parameter is a validation problem', async () => {
    const body = await expectProblem(await req('/v1/listings?limit=1000'), 400, 'validation_failed');
    assert.equal(body.fields?.[0]?.pointer, '/query/limit');
  });

  test('unknown routes are problem+json 404s', async () => {
    await expectProblem(await req('/v1/nope'), 404, 'not_found');
  });
});

describe('mock mode: authentication', () => {
  test('private resources require authentication', async () => {
    await expectProblem(await req(`/v1/me/listings/${LISTING}`), 401, 'authentication_required');
  });

  test('unrecognised credentials are rejected', async () => {
    await expectProblem(await req(`/v1/me/listings/${LISTING}`, { headers: { Authorization: 'Bearer mock:nobody' } }), 401, 'authentication_required');
    await expectProblem(await req(`/v1/me/listings/${LISTING}`, { headers: { Authorization: 'Bearer real-token' } }), 401, 'authentication_required');
  });

  test('a persona can read private resources', async () => {
    const res = await req(`/v1/me/listings/${LISTING}`, { persona: 'member' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('etag'), '"1"');
  });

  test('restricted accounts can read but not mutate', async () => {
    assert.equal((await req(`/v1/me/listings/${LISTING}`, { persona: 'restricted' })).status, 200);
    await expectProblem(
      await req('/v1/me/listings', { method: 'POST', persona: 'restricted', headers: { 'Idempotency-Key': 'k-restricted' }, body: JSON.stringify(listingBody) }),
      403,
      'account_restricted',
    );
  });
});

describe('mock mode: request bodies', () => {
  test('non-JSON bodies are rejected', async () => {
    await expectProblem(
      await req('/v1/me/listings', { method: 'POST', persona: 'member', headers: { 'Content-Type': 'text/plain', 'Idempotency-Key': 'k-ct' }, body: 'hello' }),
      415,
      'unsupported_media_type',
    );
  });

  test('malformed JSON is rejected', async () => {
    await expectProblem(await req('/v1/me/listings', { method: 'POST', persona: 'member', headers: { 'Idempotency-Key': 'k-json' }, body: '{nope' }), 400, 'malformed_request');
  });

  test('schema violations list every field, and unknown fields are rejected', async () => {
    const body = await expectProblem(
      await req('/v1/me/listings', { method: 'POST', persona: 'member', headers: { 'Idempotency-Key': 'k-invalid' }, body: JSON.stringify({ ...listingBody, title: '', surprise: true }) }),
      400,
      'validation_failed',
    );
    const pointers = body.fields!.map((f) => f.pointer);
    assert.ok(pointers.includes('/body/title'));
    assert.ok(body.fields!.some((f) => f.code === 'unrecognized_keys'));
  });
});

describe('mock mode: idempotency', () => {
  test('Idempotency-Key is required on idempotent POSTs', async () => {
    await expectProblem(await req('/v1/me/listings', { method: 'POST', persona: 'member', body: JSON.stringify(listingBody) }), 400, 'idempotency_key_required');
  });

  test('a retry replays the original response; a different body with the same key is rejected', async () => {
    const send = (body: unknown, persona = 'member') =>
      req('/v1/me/listings', { method: 'POST', persona, headers: { 'Idempotency-Key': 'k-replay' }, body: JSON.stringify(body) });
    const first = await send(listingBody);
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('idempotent-replayed'), null);
    const firstBody = await json(first);

    const retry = await send(listingBody);
    assert.equal(retry.status, 201);
    assert.equal(retry.headers.get('idempotent-replayed'), 'true');
    assert.deepEqual(await json(retry), firstBody);

    await expectProblem(await send({ ...listingBody, title: 'Different' }), 422, 'idempotency_key_reused');

    // Keys are scoped per actor.
    const other = await send({ ...listingBody, title: 'Different' }, 'member_b');
    assert.equal(other.status, 201);
    assert.equal(other.headers.get('idempotent-replayed'), null);
  });
});

describe('mock mode: optimistic concurrency', () => {
  const patch = (headers: Record<string, string>) =>
    req(`/v1/me/listings/${LISTING}`, { method: 'PATCH', persona: 'member', headers, body: JSON.stringify({ title: 'Wooden desk with chair' }) });

  test('If-Match is required', async () => {
    await expectProblem(await patch({}), 428, 'precondition_required');
  });

  test('a stale If-Match is a revision conflict naming the current revision', async () => {
    const res = await patch({ 'If-Match': '"1"' });
    const body = await expectProblem(res, 412, 'revision_conflict');
    assert.equal(body.current_revision, 2);
    assert.equal(res.headers.get('etag'), '"2"');
  });

  test('the current If-Match succeeds and returns the new revision', async () => {
    const res = await patch({ 'If-Match': '"2"' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('etag'), '"3"');
    assert.equal((await json(res)).revision, 3);
  });
});

describe('mock mode: no-content responses', () => {
  test('DELETE answers 204 with an empty body', async () => {
    const res = await req('/v1/me/applications/apl_01JA0000000000000000003002', { method: 'DELETE', persona: 'member' });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), '');
  });
});

describe('cross-cutting HTTP behaviour', () => {
  test('CORS allows localhost origins in mock mode and exposes contract headers', async () => {
    const res = await req('/v1/health', { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.match(res.headers.get('access-control-expose-headers') ?? '', /ETag/);
  });

  test('CORS rejects unknown origins', async () => {
    const res = await req('/v1/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  test('responses are not cacheable by default', async () => {
    assert.equal((await req('/v1/health')).headers.get('cache-control'), 'no-store');
  });

  test('the generated contract is served', async () => {
    const res = await req('/openapi.json');
    const doc = await json(res);
    assert.equal(doc.openapi, '3.1.0');
    assert.ok(doc.paths['/v1/listings/{listing_id}']);
  });
});

describe('live mode', () => {
  let db: Database;
  let live: ReturnType<typeof createApp>;
  before(async () => {
    db = await createPgliteDatabase();
    await migrateUp(db);
    live = createApp({ mode: 'live', db, corsOrigins: ['https://app.livingin.example'] });
  });
  after(async () => db.close());

  test('health checks the database', async () => {
    const res = await live.request('/v1/health');
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.status, 'ok');
    assert.equal(body.checks.database, 'ok');
    assert.equal(res.headers.get('x-livingin-mode'), null);
  });

  test('health reports a failing database as degraded', async () => {
    const broken = createApp({ mode: 'live', db: { ...db, query: async () => Promise.reject(new Error('down')) } as Database });
    const body = await json(await broken.request('/v1/health'));
    assert.equal(body.status, 'degraded');
    assert.equal(body.checks.database, 'error');
  });

  test('meta reports every feature disabled until it ships', async () => {
    const body = await json(await live.request('/v1/meta'));
    assert.ok(body.features.length > 0);
    assert.ok(body.features.every((f: { state: string }) => f.state === 'disabled'));
  });

  test('contracted but unimplemented operations answer 501', async () => {
    const res = await live.request(`/v1/listings/${LISTING}`);
    await expectProblem(res, 501, 'not_implemented');
  });

  test('mock personas and scenarios are ignored', async () => {
    const res = await live.request('/v1/health', { headers: { Prefer: 'example=internal_error' } });
    assert.equal(res.status, 200);
  });

  test('CORS allows only configured origins', async () => {
    const ok = await live.request('/v1/health', { headers: { Origin: 'https://app.livingin.example' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.livingin.example');
    const local = await live.request('/v1/health', { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(local.headers.get('access-control-allow-origin'), null);
  });
});
