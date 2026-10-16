import assert from 'node:assert/strict';
import { basename, dirname } from 'node:path';
import { describe, test } from 'node:test';
import { documentedErrors, documentedStatuses } from '../src/contract/operation';
import { ERROR_CODES, Problem, type ErrorCode } from '../src/contract/problem';
import { MOCK_PERSONAS } from '../src/http/actor';
import { loadFixtures } from '../src/http/fixtures';
import { ID_PREFIXES, ULID_PATTERN } from '../src/lib/ids';
import { allOperations } from '../src/modules';

const fixtures = loadFixtures();

/** Hosts that are reserved for documentation (RFC 2606/6761), so fixtures cannot point at real services. */
const SYNTHETIC_HOST = /(^|\.)(example|example\.com|example\.org|example\.net|example\.jp)$/;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function* strings(value: unknown, path = ''): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}/${i}`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}/${k}`);
}

function isPage(body: unknown): boolean {
  return !!body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items) && 'next_cursor' in (body as object);
}

describe('operation definitions', () => {
  test('operationIds and method+path pairs are unique', () => {
    const ids = new Set<string>();
    const routes = new Set<string>();
    for (const op of allOperations) {
      assert.ok(!ids.has(op.operationId), `duplicate operationId ${op.operationId}`);
      ids.add(op.operationId);
      const route = `${op.method} ${op.path}`;
      assert.ok(!routes.has(route), `duplicate route ${route}`);
      routes.add(route);
    }
  });

  test('paths are versioned and path parameters match request.params', () => {
    for (const op of allOperations) {
      assert.match(op.path, /^\/v1\//, `${op.operationId} path must start with /v1/`);
      const inPath = [...op.path.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).sort();
      const declared = Object.keys(op.request?.params?.shape ?? {}).sort();
      assert.deepEqual(declared, inPath, `${op.operationId} params must match the path template`);
    }
  });

  test('mutations declare how retries are made safe', () => {
    for (const op of allOperations) {
      if (op.pure) {
        assert.equal(op.method, 'post', `${op.operationId}: only POST can be pure`);
        assert.ok(!op.idempotent && !op.ifMatch, `${op.operationId}: pure operations change nothing, so need no Idempotency-Key or If-Match`);
        continue;
      }
      if (op.method === 'post') assert.ok(op.idempotent, `${op.operationId}: POST operations must be idempotent (Idempotency-Key)`);
      if (op.method === 'patch') assert.ok(op.ifMatch, `${op.operationId}: PATCH operations must use If-Match`);
      if (op.method !== 'get') assert.notEqual(op.auth, 'none', `${op.operationId}: anonymous mutations are not allowed`);
    }
  });

  test('every operation outside system has a feature gate', () => {
    for (const op of allOperations) if (op.module !== 'system') assert.ok(op.feature, `${op.operationId} needs a feature key`);
  });

  test('success responses are 2xx', () => {
    for (const op of allOperations) for (const s of Object.keys(op.responses)) assert.match(s, /^2\d\d$/, `${op.operationId} declares non-2xx success ${s}`);
  });
});

describe('fixtures', () => {
  test('every operation has a fixture file in its module directory, and no fixture is orphaned', () => {
    const known = new Set(allOperations.map((o) => o.operationId));
    for (const op of allOperations) {
      const f = fixtures.get(op.operationId);
      assert.ok(f, `missing fixtures/${op.module}/${op.operationId}.json`);
      assert.equal(basename(dirname(f.file)), op.module, `${op.operationId} fixture must live in fixtures/${op.module}/`);
      assert.equal(basename(f.file), `${op.operationId}.json`);
    }
    for (const id of fixtures.keys()) assert.ok(known.has(id), `fixture ${id} has no operation`);
  });

  for (const op of allOperations) {
    describe(op.operationId, () => {
      const file = fixtures.get(op.operationId);
      if (!file) return;
      const statuses = documentedStatuses(op);
      const errors = documentedErrors(op);

      test('has a 2xx default scenario and all required scenarios', () => {
        const def = file.scenarios.default;
        assert.ok(def, 'missing "default" scenario');
        assert.ok(op.responses[def.status], `default scenario status ${def.status} is not a declared success response`);
        for (const name of op.requiredScenarios ?? []) assert.ok(file.scenarios[name], `missing required scenario "${name}"`);
        if (isPage(def.body)) assert.ok(file.scenarios.empty, 'list operations need an "empty" scenario');
        if (op.ifMatch) assert.match(file.current_etag ?? '', /^"\d+"$/, 'If-Match operations need "current_etag"');
      });

      for (const [name, scenario] of Object.entries(file.scenarios)) {
        test(`scenario "${name}" conforms to the contract`, () => {
          assert.match(name, /^[a-z][a-z0-9_]*$/, 'scenario names are snake_case');
          assert.ok(scenario.summary?.trim(), 'scenario needs a summary');
          assert.ok(statuses.includes(scenario.status), `status ${scenario.status} is not documented for ${op.operationId} (documented: ${statuses.join(', ')})`);
          const success = op.responses[scenario.status];
          if (success) {
            if (success.schema) {
              const r = success.schema.safeParse(scenario.body);
              assert.ok(r.success, r.success ? '' : `body does not match schema:\n${JSON.stringify(r.error.issues, null, 2)}`);
            } else {
              assert.equal(scenario.body, undefined, 'no-content response must not have a body');
            }
            for (const [h, def] of Object.entries(success.headers ?? {})) {
              if (def.required) assert.ok(scenario.headers?.[h], `missing required response header ${h}`);
            }
            if (scenario.headers?.ETag) assert.match(scenario.headers.ETag, /^"\d+"$/, 'ETag must be a quoted revision number');
          } else {
            const r = Problem.safeParse(scenario.body);
            assert.ok(r.success, r.success ? '' : `problem body invalid:\n${JSON.stringify(r.error.issues, null, 2)}`);
            const code = r.data!.code as ErrorCode;
            assert.ok(errors.includes(code), `error code ${code} is not documented for ${op.operationId}`);
            assert.equal(r.data!.status, scenario.status, 'problem.status must equal the scenario status');
            assert.equal(ERROR_CODES[code].status, scenario.status, `${code} must use HTTP ${ERROR_CODES[code].status}`);
            assert.equal(r.data!.type, `urn:livingin:problem:${code}`);
          }
        });

        test(`scenario "${name}" uses synthetic data only`, () => {
          for (const [path, s] of strings(scenario.body)) {
            if (/^https?:\/\//.test(s)) {
              const host = new URL(s).hostname;
              assert.match(host, SYNTHETIC_HOST, `${path}: URL host ${host} is not a reserved example domain`);
            }
            for (const m of s.matchAll(EMAIL)) assert.match(m[1]!, SYNTHETIC_HOST, `${path}: email domain ${m[1]} is not a reserved example domain`);
          }
        });
      }
    });
  }
});

describe('mock personas', () => {
  test('persona identifiers are well-formed', () => {
    for (const [name, p] of Object.entries(MOCK_PERSONAS)) {
      assert.match(p.account_id, new RegExp(`^${ID_PREFIXES.account}_${ULID_PATTERN}$`), `${name} account_id`);
      assert.match(p.profile_id, new RegExp(`^${ID_PREFIXES.profile}_${ULID_PATTERN}$`), `${name} profile_id`);
    }
  });
});
