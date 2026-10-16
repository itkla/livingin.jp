import { z } from 'zod';
import type { core } from 'zod';

/** Documentation attached to a schema. Emitted as-is into the JSON Schema / OpenAPI output. */
export interface SchemaDocs {
  description?: string;
  example?: unknown;
  examples?: unknown[];
  deprecated?: boolean;
  [key: string]: unknown;
}

declare module 'zod' {
  interface ZodType<out Output = unknown, out Input = unknown, out Internals extends core.$ZodTypeInternals<Output, Input> = core.$ZodTypeInternals<Output, Input>>
    extends core.$ZodType<Output, Input, Internals> {
    /** Document this schema. */
    openapi(docs: SchemaDocs): this;
    /** Document this schema and publish it as the reusable component `#/components/schemas/<name>`. */
    openapi(name: string, docs?: SchemaDocs): this;
  }
}

/**
 * `.openapi()` is a thin layer over zod's native `.meta()`: a name becomes the metadata `id`,
 * which zod's JSON Schema generator turns into a shared `$ref` component. Names must be unique.
 */
function openapi(this: z.ZodType, nameOrDocs: string | SchemaDocs, docs: SchemaDocs = {}): z.ZodType {
  if (typeof nameOrDocs !== 'string') return this.meta(nameOrDocs);
  const existing = z.globalRegistry._idmap.get(nameOrDocs);
  if (existing) throw new Error(`Schema name "${nameOrDocs}" is already used by another schema; component names must be unique.`);
  return this.meta({ ...docs, id: nameOrDocs });
}

// zod copies enumerable ZodType.prototype members onto every schema instance it constructs.
if (!Object.prototype.hasOwnProperty.call(z.ZodType.prototype, 'openapi')) {
  (z.ZodType.prototype as unknown as { openapi: typeof openapi }).openapi = openapi;
}

export { z };
