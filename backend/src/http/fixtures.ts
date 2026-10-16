import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FixtureScenario {
  summary: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface FixtureFile {
  operationId: string;
  /** For If-Match operations: the ETag the mock treats as the current revision. */
  current_etag?: string;
  scenarios: Record<string, FixtureScenario>;
}

export const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures', import.meta.url));

/** Loads every `fixtures/<module>/<operationId>.json`, keyed by operationId. */
export function loadFixtures(dir: string = FIXTURES_DIR): Map<string, FixtureFile & { file: string }> {
  const out = new Map<string, FixtureFile & { file: string }>();
  for (const moduleDir of readdirSync(dir)) {
    const full = join(dir, moduleDir);
    if (!statSync(full).isDirectory()) continue;
    for (const name of readdirSync(full)) {
      if (!name.endsWith('.json')) continue;
      const file = join(full, name);
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as FixtureFile;
      if (out.has(parsed.operationId)) throw new Error(`Duplicate fixture for ${parsed.operationId}: ${file}`);
      out.set(parsed.operationId, { ...parsed, file });
    }
  }
  return out;
}
