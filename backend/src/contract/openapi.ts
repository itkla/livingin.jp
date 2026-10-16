import { CONTRACT_VERSION } from './version';
import { documentedErrors, type Operation } from './operation';
import { ERROR_CODES, type ErrorCode } from './problem';
import { z } from './zod';

type Json = Record<string, any>;

const API_DESCRIPTION = `Backend contract for livingin.jp. This document is generated from the backend's zod schemas
(\`npm run contract:generate\`); do not edit it by hand.

Conventions (identifiers, time, money, unknown values, pagination, errors, idempotency, concurrency,
authentication and the mock server's \`Prefer: example=<scenario>\` header) are specified in
docs/api/CONVENTIONS.md. Fixtures for every operation live in backend/fixtures/.

Every response carries \`X-Request-Id\`. Every error is \`application/problem+json\` (RFC 9457) with a stable
\`code\`. When the backend runs in \`live\` mode, operations whose implementation has not shipped yet return
501 \`not_implemented\`; use the mock server for those.`;

const MODULE_TAGS = [
  { name: 'system', description: 'Service health, contract version and enabled-feature manifest.' },
  { name: 'identity', description: 'Private accounts, public profiles and organizations. These are distinct records.' },
  { name: 'sources', description: 'Source records: provenance, rights and review for maintained information.' },
  { name: 'living', description: 'Guides, reference information, practical tools and the private My Life workspace.' },
  { name: 'community', description: 'Groups, chapters, memberships and conversation.' },
  { name: 'work', description: 'Transparent job information and private application tracking.' },
  { name: 'events', description: 'Event series, occurrences and participation (RSVPs).' },
  { name: 'marketplace', description: 'Local household listings, review/publication and pickup coordination.' },
  { name: 'safety', description: 'Authoritative weather and safety information, preparedness and official resources.' },
];

const COMPONENT_PREFIX = '#/components/schemas/';
const SYNTHETIC_PREFIX = '__operation__';
const FORMATS_WITHOUT_PATTERN = new Set(['date-time', 'date', 'time', 'email', 'uri', 'uuid']);

/** Removes generator noise that carries no contract meaning. */
function tidy(ctx: { jsonSchema: Json }) {
  const s = ctx.jsonSchema;
  if (s.minimum === Number.MIN_SAFE_INTEGER) delete s.minimum;
  if (s.maximum === Number.MAX_SAFE_INTEGER) delete s.maximum;
  // Standard formats are self-describing; zod's equivalent regexes are long and engine-specific.
  if (typeof s.format === 'string' && FORMATS_WITHOUT_PATTERN.has(s.format)) delete s.pattern;
}

function componentId(schema: z.ZodType): string | undefined {
  return (z.globalRegistry._map.get(schema) as { id?: string } | undefined)?.id;
}

function collectRefs(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectRefs(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') out.add(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

/**
 * Converts every named schema plus each operation's inline schemas in one pass of zod's native
 * JSON Schema generator, so all references resolve to shared `#/components/schemas/*`.
 * Inline (unnamed) operation schemas are registered under temporary IDs, then inlined back.
 */
function convertSchemas(operations: Operation[]) {
  const temporary = new Map<z.ZodType, string>();
  const slot = (schema: z.ZodType | undefined, label: string): string | undefined => {
    if (!schema) return undefined;
    const named = componentId(schema);
    if (named) return named;
    const existing = temporary.get(schema);
    if (existing) return existing;
    const id = `${SYNTHETIC_PREFIX}${label}`;
    temporary.set(schema, id);
    return id;
  };

  const slots = operations.map((op) => ({
    params: slot(op.request?.params, `${op.operationId}_params`),
    query: slot(op.request?.query, `${op.operationId}_query`),
    body: slot(op.request?.body, `${op.operationId}_body`),
    responses: Object.fromEntries(Object.entries(op.responses).map(([status, r]) => [status, slot(r.schema, `${op.operationId}_${status}`)])),
  }));

  const saved = new Map<z.ZodType, unknown>();
  for (const [schema, id] of temporary) {
    saved.set(schema, z.globalRegistry._map.get(schema));
    z.globalRegistry.add(schema, { ...(z.globalRegistry._map.get(schema) ?? {}), id });
  }
  let schemas: Record<string, Json>;
  try {
    schemas = (
      z.toJSONSchema(z.globalRegistry, {
        target: 'draft-2020-12',
        io: 'input',
        unrepresentable: 'any',
        uri: (id) => `${COMPONENT_PREFIX}${id}`,
        override: tidy,
      }) as { schemas: Record<string, Json> }
    ).schemas;
  } finally {
    for (const [schema, id] of temporary) {
      z.globalRegistry.remove(schema);
      const meta = saved.get(schema);
      if (meta) z.globalRegistry.add(schema, meta as Json);
      z.globalRegistry._idmap.delete(id);
    }
  }

  const clean = (s: Json): Json => {
    const { $schema: _s, $id: _i, id: _id, ...rest } = s;
    return rest;
  };
  const components: Record<string, Json> = {};
  const inline: Record<string, Json> = {};
  for (const [id, s] of Object.entries(schemas)) (id.startsWith(SYNTHETIC_PREFIX) ? inline : components)[id] = clean(s);

  for (const ref of collectRefs(components, new Set())) {
    if (ref.startsWith(`${COMPONENT_PREFIX}${SYNTHETIC_PREFIX}`)) {
      throw new Error(`A named schema references an unnamed operation schema (${ref}). Give that schema a name with .openapi('Name').`);
    }
  }

  const resolve = (id: string | undefined): Json | undefined => {
    if (!id) return undefined;
    return id.startsWith(SYNTHETIC_PREFIX) ? inline[id] : { $ref: `${COMPONENT_PREFIX}${id}` };
  };
  /** Parameters need the object's properties, whether it was named or inline. */
  const objectSchema = (id: string | undefined): Json | undefined => (id ? (id.startsWith(SYNTHETIC_PREFIX) ? inline[id] : components[id]) : undefined);

  return { components, slots, resolve, objectSchema };
}

function parametersFrom(objectSchema: Json | undefined, location: 'path' | 'query'): Json[] {
  if (!objectSchema?.properties) return [];
  const required = new Set<string>(objectSchema.required ?? []);
  return Object.entries(objectSchema.properties as Record<string, Json>).map(([name, schema]) => {
    const { description, ...rest } = schema;
    return {
      name,
      in: location,
      required: location === 'path' || (required.has(name) && rest.default === undefined),
      ...(description ? { description } : {}),
      schema: rest,
    };
  });
}

export function buildOpenApiDocument(operations: Operation[]) {
  const { components, slots, resolve, objectSchema } = convertSchemas(operations);
  const paths: Record<string, Json> = {};

  operations.forEach((op, i) => {
    const slot = slots[i]!;
    const parameters = [...parametersFrom(objectSchema(slot.params), 'path'), ...parametersFrom(objectSchema(slot.query), 'query')];
    if (op.idempotent) {
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description: 'Client-generated unique key (UUID recommended). Retries with the same key and body replay the original response.',
        schema: { type: 'string', minLength: 1, maxLength: 255 },
      });
    }
    if (op.ifMatch) {
      parameters.push({ name: 'If-Match', in: 'header', required: true, description: 'ETag of the revision being modified, e.g. `"3"`.', schema: { type: 'string', example: '"3"' } });
    }

    const responses: Record<string, Json> = {};
    for (const [status, res] of Object.entries(op.responses)) {
      const schema = resolve(slot.responses[status]);
      responses[status] = {
        description: res.description,
        ...(res.headers
          ? { headers: Object.fromEntries(Object.entries(res.headers).map(([name, h]) => [name, { description: h.description, required: h.required ?? false, schema: { type: 'string' } }])) }
          : {}),
        ...(schema ? { content: { 'application/json': { schema } } } : {}),
      };
    }
    const byStatus = new Map<number, ErrorCode[]>();
    for (const code of documentedErrors(op)) {
      const s = ERROR_CODES[code].status;
      byStatus.set(s, [...(byStatus.get(s) ?? []), code]);
    }
    for (const [status, codes] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
      responses[String(status)] = {
        description: `Problem: ${codes.map((c) => `\`${c}\``).join(', ')}`,
        content: { 'application/problem+json': { schema: { $ref: `${COMPONENT_PREFIX}Problem` } } },
      };
    }

    const flags: string[] = [];
    if (op.feature) flags.push(`Feature gate: \`${op.feature}\`.`);
    if (op.auth === 'optional') flags.push('Anonymous access allowed; the response may include viewer-specific fields when signed in.');
    if (op.roles) flags.push(`Roles: ${op.roles.join(', ')}.`);
    if (op.pure) flags.push('Pure: creates and changes nothing.');
    if (op.idempotent) flags.push('Idempotent with `Idempotency-Key`.');
    if (op.ifMatch) flags.push('Optimistic concurrency with `If-Match`.');

    const body = resolve(slot.body);
    (paths[op.path] ??= {})[op.method] = {
      operationId: op.operationId,
      summary: op.summary,
      description: [op.description, flags.join(' ')].filter(Boolean).join('\n\n'),
      tags: [op.module],
      security: op.auth === 'required' ? [{ session: [] }, { bearer: [] }] : op.auth === 'optional' ? [{}, { session: [] }, { bearer: [] }] : [],
      ...(parameters.length ? { parameters } : {}),
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses,
    };
  });

  return {
    openapi: '3.1.0',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: { title: 'livingin.jp API', version: CONTRACT_VERSION, description: API_DESCRIPTION },
    servers: [{ url: 'http://localhost:8787', description: 'Local backend (mock or live mode)' }],
    tags: MODULE_TAGS,
    paths,
    components: {
      schemas: Object.fromEntries(Object.entries(components).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: '__Host-livingin_session',
          description: 'First-party browser session. Unsafe methods also require the X-CSRF-Token header (see CONVENTIONS.md#authentication).',
        },
        bearer: { type: 'http', scheme: 'bearer', description: 'Non-browser clients and the mock server (`Bearer mock:<persona>`).' },
      },
    },
  };
}
