import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareContracts, versionAllowsBreaking, type Change } from '../src/contract/compat';
import { buildOpenApiDocument } from '../src/contract/openapi';
import { allOperations } from '../src/modules';

type Doc = Record<string, any>;
const generated = () => JSON.parse(JSON.stringify(buildOpenApiDocument(allOperations))) as Doc;
const kinds = (changes: Change[], kind: Change['kind']) => changes.filter((c) => c.kind === kind).map((c) => `${c.location}: ${c.message}`);

/** A small hand-written contract so each rule is tested in isolation. */
function fixtureDoc(): Doc {
  return {
    openapi: '3.1.0',
    info: { title: 't', version: '0.1.0' },
    paths: {
      '/v1/things/{id}': {
        get: {
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
            { in: 'query', name: 'lang', required: false, schema: { type: 'string', enum: ['en', 'ja'] } },
          ],
          responses: {
            '200': { description: 'ok', headers: { ETag: { required: true, schema: { type: 'string' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } },
            '404': { description: 'nf' },
          },
        },
        patch: {
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ThingInput' } } } },
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } } },
        },
      },
    },
    components: {
      schemas: {
        Thing: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            state: {
              oneOf: [
                { type: 'object', properties: { status: { type: 'string', enum: ['draft'] } }, required: ['status'] },
                { type: 'object', properties: { status: { type: 'string', enum: ['published'] }, at: { type: 'string' } }, required: ['status', 'at'] },
              ],
            },
            tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } },
          },
          required: ['id', 'title', 'state', 'tags'],
        },
        ThingInput: {
          type: 'object',
          properties: { title: { type: 'string', maxLength: 100 }, kind: { type: 'string', enum: ['x', 'y'] } },
          additionalProperties: false,
        },
      },
    },
  };
}

describe('compareContracts', () => {
  test('identical documents have no changes', () => {
    assert.deepEqual(compareContracts(fixtureDoc(), fixtureDoc()), []);
    assert.deepEqual(compareContracts(generated(), generated()), []);
  });

  test('additive changes are not reported', () => {
    const head = fixtureDoc();
    head.components.schemas.Thing.properties.extra = { type: 'string' };
    head.components.schemas.ThingInput.properties.note = { type: 'string' };
    head.paths['/v1/things/{id}'].get.responses['429'] = { description: 'rl' };
    head.paths['/v1/others'] = { get: { responses: { '200': { description: 'ok' } } } };
    assert.deepEqual(compareContracts(fixtureDoc(), head), []);
  });

  const breakingCases: Array<[string, (d: Doc) => void, RegExp]> = [
    ['operation removed', (d) => delete d.paths['/v1/things/{id}'].patch, /PATCH .* operation removed/],
    ['success status removed', (d) => (d.paths['/v1/things/{id}'].get.responses = { '201': d.paths['/v1/things/{id}'].get.responses['200'] }), /200: success response removed/],
    ['response property removed', (d) => delete d.components.schemas.Thing.properties.title, /\.title: response property removed/],
    ['response property made optional', (d) => (d.components.schemas.Thing.required = ['id', 'state', 'tags']), /\.title: response property is no longer always present/],
    ['response type widened', (d) => (d.components.schemas.Thing.properties.title.type = ['string', 'null']), /may now be of type "null"/],
    ['new required request property', (d) => (d.components.schemas.ThingInput.required = ['title']), /\.title: new required request property/],
    ['request enum value removed', (d) => (d.components.schemas.ThingInput.properties.kind.enum = ['x']), /no longer accepts enum value "y"/],
    ['request constraint tightened', (d) => (d.components.schemas.ThingInput.properties.title.maxLength = 50), /maxLength tightened to 50/],
    ['new required parameter', (d) => d.paths['/v1/things/{id}'].get.parameters.push({ in: 'query', name: 'must', required: true, schema: { type: 'string' } }), /query:must: new required parameter/],
    ['parameter removed', (d) => d.paths['/v1/things/{id}'].get.parameters.pop(), /query:lang: parameter removed/],
    ['response header no longer guaranteed', (d) => delete d.paths['/v1/things/{id}'].get.responses['200'].headers.ETag, /header ETag: response header no longer guaranteed/],
    ['union variant field removed', (d) => delete d.components.schemas.Thing.properties.state.oneOf[1].properties.at, /<status=published>\.at: response property removed/],
    ['new success status', (d) => (d.paths['/v1/things/{id}'].patch.responses['202'] = { description: 'accepted' }), /202: new success status/],
  ];
  for (const [name, mutate, expected] of breakingCases) {
    test(`breaking: ${name}`, () => {
      const head = fixtureDoc();
      mutate(head);
      const breaking = kinds(compareContracts(fixtureDoc(), head), 'breaking');
      assert.ok(breaking.some((m) => expected.test(m)), `expected ${expected}, got:\n${breaking.join('\n') || '(none)'}`);
    });
  }

  test('const discriminators are matched like one-value enums', () => {
    const base = fixtureDoc();
    for (const v of base.components.schemas.Thing.properties.state.oneOf) v.properties.status = { type: 'string', const: v.properties.status.enum[0] };
    const head = JSON.parse(JSON.stringify(base));
    delete head.components.schemas.Thing.properties.state.oneOf[1].properties.at;
    const breaking = kinds(compareContracts(base, head), 'breaking');
    assert.ok(breaking.some((m) => /<status=published>\.at: response property removed/.test(m)), breaking.join('\n'));
  });

  test('notice: new response enum value and new union variant', () => {
    const head = fixtureDoc();
    head.components.schemas.Thing.properties.tags.items.enum = ['a', 'b', 'c'];
    head.components.schemas.Thing.properties.state.oneOf.push({ type: 'object', properties: { status: { type: 'string', enum: ['archived'] } }, required: ['status'] });
    const changes = compareContracts(fixtureDoc(), head);
    assert.deepEqual(kinds(changes, 'breaking'), []);
    const notices = kinds(changes, 'notice');
    assert.ok(notices.some((m) => /enum value "c"/.test(m)));
    assert.ok(notices.some((m) => /gained variant status=archived/.test(m)));
  });

  test('the real contract: removing a publication state field is caught', () => {
    const head = generated();
    const variants = head.components.schemas.PublicationState.oneOf as Doc[];
    const approved = variants.find((v) => v.properties.state.const === 'approved')!;
    delete approved.properties.decision_id;
    approved.required = approved.required.filter((r: string) => r !== 'decision_id');
    const breaking = kinds(compareContracts(generated(), head), 'breaking');
    assert.ok(breaking.some((m) => /state=approved>\.decision_id: response property removed/.test(m)), breaking.join('\n'));
  });
});

describe('versionAllowsBreaking', () => {
  test('below 1.0 a minor bump allows breaking changes', () => {
    assert.equal(versionAllowsBreaking('0.1.0', '0.1.1'), false);
    assert.equal(versionAllowsBreaking('0.1.0', '0.2.0'), true);
    assert.equal(versionAllowsBreaking('0.9.3', '1.0.0'), true);
  });
  test('from 1.0 only a major bump does', () => {
    assert.equal(versionAllowsBreaking('1.2.0', '1.3.0'), false);
    assert.equal(versionAllowsBreaking('1.2.0', '2.0.0'), true);
  });
});
