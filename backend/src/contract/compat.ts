/**
 * Detects backward-incompatible changes between two generated OpenAPI 3.1 documents.
 *
 * Policy (docs/api/CONVENTIONS.md#compatibility):
 * - Breaking: removing an operation, success status, response property or request enum value;
 *   making a response property optional; adding a required request property or parameter;
 *   narrowing what a request accepts or widening the types a response can return.
 * - Notice (allowed in a minor version, listed for review): new response enum values and union
 *   variants. Clients must treat unknown enum values with a generic fallback.
 * - Additive changes (new operations, optional fields, error statuses) are not reported.
 */

type Json = Record<string, unknown>;
type Direction = 'request' | 'response';

export interface Change {
  kind: 'breaking' | 'notice';
  location: string;
  message: string;
}

const METHODS = ['get', 'put', 'post', 'patch', 'delete'] as const;

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** `const: x` is a one-value enum. */
const enumOf = (s: Json): unknown[] | null => (Array.isArray(s.enum) ? (s.enum as unknown[]) : 'const' in s ? [s.const] : null);

export function compareContracts(base: Json, head: Json): Change[] {
  const changes: Change[] = [];
  const add = (kind: Change['kind'], location: string, message: string) => changes.push({ kind, location, message });
  const basePaths = (base.paths ?? {}) as Record<string, Json>;
  const headPaths = (head.paths ?? {}) as Record<string, Json>;

  const resolve = (doc: Json, schema: unknown): Json => {
    let s = schema;
    const seen = new Set<string>();
    while (isObj(s) && typeof s.$ref === 'string') {
      if (seen.has(s.$ref)) break;
      seen.add(s.$ref);
      const parts = s.$ref.replace(/^#\//, '').split('/');
      s = parts.reduce<unknown>((acc, p) => (isObj(acc) ? acc[p] : undefined), doc);
    }
    return isObj(s) ? s : {};
  };

  const visiting = new Set<string>();

  const compareSchema = (b: unknown, h: unknown, dir: Direction, loc: string): void => {
    const key = `${dir}|${loc}|${JSON.stringify(b)}|${JSON.stringify(h)}`;
    if (visiting.has(key)) return;
    visiting.add(key);
    const bs = resolve(base, b);
    const hs = resolve(head, h);

    // Unions.
    const bu = (bs.oneOf ?? bs.anyOf) as unknown[] | undefined;
    const hu = (hs.oneOf ?? hs.anyOf) as unknown[] | undefined;
    if (bu || hu) {
      compareUnion(bu ?? [bs], hu ?? [hs], dir, loc);
      return;
    }

    // Types.
    const types = (s: Json) => new Set(([] as unknown[]).concat(s.type ?? []).map(String));
    const bt = types(bs);
    const ht = types(hs);
    if (bt.size && ht.size) {
      if (dir === 'response') {
        for (const t of ht) if (!bt.has(t)) add('breaking', loc, `response may now be of type "${t}"`);
      } else {
        for (const t of bt) if (!ht.has(t)) add('breaking', loc, `request no longer accepts type "${t}"`);
      }
    }

    // Enums.
    const be = enumOf(bs);
    const he = enumOf(hs);
    if (be && he) {
      if (dir === 'request') {
        for (const v of be) if (!he.includes(v)) add('breaking', loc, `request no longer accepts enum value ${JSON.stringify(v)}`);
      } else {
        for (const v of he) if (!be.includes(v)) add('notice', loc, `response may now contain enum value ${JSON.stringify(v)}`);
      }
    } else if (dir === 'request' && !be && he) {
      add('breaking', loc, 'request value is now restricted to an enum');
    }

    // Request constraints may only loosen.
    if (dir === 'request') {
      const tighterMin = (k: string) => typeof hs[k] === 'number' && (typeof bs[k] !== 'number' || (hs[k] as number) > (bs[k] as number));
      const tighterMax = (k: string) => typeof hs[k] === 'number' && (typeof bs[k] !== 'number' || (hs[k] as number) < (bs[k] as number));
      for (const k of ['minLength', 'minimum', 'exclusiveMinimum', 'minItems']) if (tighterMin(k)) add('breaking', loc, `request constraint ${k} tightened to ${hs[k]}`);
      for (const k of ['maxLength', 'maximum', 'exclusiveMaximum', 'maxItems']) if (tighterMax(k)) add('breaking', loc, `request constraint ${k} tightened to ${hs[k]}`);
      if (hs.pattern !== undefined && hs.pattern !== bs.pattern) add('breaking', loc, `request pattern changed to ${hs.pattern}`);
    }

    // Objects.
    const bp = (bs.properties ?? {}) as Json;
    const hp = (hs.properties ?? {}) as Json;
    const br = new Set((bs.required ?? []) as string[]);
    const hr = new Set((hs.required ?? []) as string[]);
    if (bs.properties || hs.properties) {
      for (const name of Object.keys(bp)) {
        if (!(name in hp)) {
          if (dir === 'response') add('breaking', `${loc}.${name}`, 'response property removed');
          else if (hs.additionalProperties === false) add('breaking', `${loc}.${name}`, 'request property removed from a strict object');
          continue;
        }
        if (dir === 'response' && br.has(name) && !hr.has(name)) add('breaking', `${loc}.${name}`, 'response property is no longer always present');
        compareSchema(bp[name], hp[name], dir, `${loc}.${name}`);
      }
      if (dir === 'request') {
        for (const name of hr) if (!br.has(name)) add('breaking', `${loc}.${name}`, 'new required request property');
        if (bs.additionalProperties !== false && hs.additionalProperties === false) add('breaking', loc, 'request object no longer accepts unknown properties');
      }
    }

    // Arrays.
    if (bs.items || hs.items) compareSchema(bs.items, hs.items, dir, `${loc}[]`);
  };

  /** Variants are matched by a discriminator: a property whose schema is a single-value enum. */
  const discriminatorKey = (doc: Json, variants: Json[]): string | null => {
    const first = variants[0];
    if (!first?.properties) return null;
    for (const prop of Object.keys(first.properties as Json)) {
      const values = variants.map((v) => variantValue(doc, v, prop));
      if (values.every((x) => x !== null) && new Set(values).size === values.length) return prop;
    }
    return null;
  };

  const variantValue = (doc: Json, v: Json, prop: string): string | null => {
    const values = enumOf(resolve(doc, (v.properties as Json | undefined)?.[prop]));
    return values?.length === 1 ? String(values[0]) : null;
  };

  const compareUnion = (bu: unknown[], hu: unknown[], dir: Direction, loc: string) => {
    const bv = bu.map((v) => resolve(base, v));
    const hv = hu.map((v) => resolve(head, v));
    const nonNull = (vs: Json[]) => vs.filter((v) => v.type !== 'null');
    const prop = discriminatorKey(base, nonNull(bv));
    if (prop) {
      const bMap = new Map(nonNull(bv).map((v) => [variantValue(base, v, prop), v]));
      const hMap = new Map(nonNull(hv).map((v) => [variantValue(head, v, prop), v]));
      for (const [value, v] of bMap) {
        const match = hMap.get(value);
        if (!match) {
          if (dir === 'request') add('breaking', loc, `request no longer accepts variant ${prop}=${value}`);
          continue;
        }
        compareSchema(v, match, dir, `${loc}<${prop}=${value}>`);
      }
      for (const value of hMap.keys()) if (!bMap.has(value)) add('notice', loc, `${dir} gained variant ${prop}=${value}`);
    } else if (bv.length === hv.length) {
      bv.forEach((v, i) => compareSchema(v, hv[i], dir, `${loc}<${i}>`));
    } else if (JSON.stringify(bv) !== JSON.stringify(hv)) {
      add('breaking', loc, 'union changed shape; review manually');
    }
    const nullable = (vs: Json[]) => vs.some((v) => v.type === 'null');
    if (dir === 'response' && !nullable(bv) && nullable(hv)) add('breaking', loc, 'response may now be null');
    if (dir === 'request' && nullable(bv) && !nullable(hv)) add('breaking', loc, 'request no longer accepts null');
  };

  for (const [path, bItem] of Object.entries(basePaths)) {
    for (const method of METHODS) {
      const bOp = bItem[method] as Json | undefined;
      if (!bOp) continue;
      const hOp = headPaths[path]?.[method] as Json | undefined;
      const loc = `${method.toUpperCase()} ${path}`;
      if (!hOp) {
        add('breaking', loc, 'operation removed');
        continue;
      }

      const params = (op: Json) => new Map(((op.parameters ?? []) as Json[]).map((p) => [`${p.in}:${p.name}`, p]));
      const bParams = params(bOp);
      const hParams = params(hOp);
      for (const [k, p] of hParams) {
        const old = bParams.get(k);
        if (p.required && !old?.required) add('breaking', `${loc} ${k}`, 'new required parameter');
        if (old) compareSchema(old.schema, p.schema, 'request', `${loc} ${k}`);
      }
      for (const k of bParams.keys()) if (!hParams.has(k)) add('breaking', `${loc} ${k}`, 'parameter removed');

      const body = (op: Json) => (op.requestBody as Json | undefined);
      const bBody = body(bOp);
      const hBody = body(hOp);
      if (hBody?.required && !bBody) add('breaking', `${loc} body`, 'request body is now required');
      const jsonSchema = (b: Json | undefined) => ((b?.content as Json | undefined)?.['application/json'] as Json | undefined)?.schema;
      if (bBody && hBody) compareSchema(jsonSchema(bBody), jsonSchema(hBody), 'request', `${loc} body`);

      const bRes = (bOp.responses ?? {}) as Record<string, Json>;
      const hRes = (hOp.responses ?? {}) as Record<string, Json>;
      for (const [status, res] of Object.entries(bRes)) {
        if (!/^2/.test(status)) continue;
        const hr = hRes[status];
        if (!hr) {
          add('breaking', `${loc} ${status}`, 'success response removed');
          continue;
        }
        const bh = (res.headers ?? {}) as Record<string, Json>;
        const hh = (hr.headers ?? {}) as Record<string, Json>;
        for (const [name, h] of Object.entries(bh)) if (h.required && !hh[name]?.required) add('breaking', `${loc} ${status} header ${name}`, 'response header no longer guaranteed');
        compareSchema(jsonSchema(res), jsonSchema(hr), 'response', `${loc} ${status}`);
      }
      for (const status of Object.keys(hRes)) if (/^2/.test(status) && !bRes[status]) add('breaking', `${loc} ${status}`, 'new success status on an existing operation');
    }
  }
  return changes;
}

/** Whether `head` bumps the version component that a breaking change requires. */
export function versionAllowsBreaking(baseVersion: string, headVersion: string): boolean {
  const parse = (v: string) => v.split(/[.-]/).slice(0, 3).map(Number) as [number, number, number];
  const [bM, bm] = parse(baseVersion);
  const [hM, hm] = parse(headVersion);
  if (bM === 0) return hM > 0 || hm > bm;
  return hM > bM;
}
