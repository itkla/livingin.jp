import { createHash } from 'node:crypto';

export interface StoredResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

export type BeginResult =
  | { kind: 'new' }
  | { kind: 'replay'; response: StoredResponse }
  | { kind: 'mismatch' }
  | { kind: 'in_progress' };

/**
 * Idempotency-Key storage. A key is scoped to (actor, method, route). The first request with a key
 * claims it; a retry with the same fingerprint replays the stored response; a different
 * fingerprint is rejected (422). 5xx responses release the key so the client can retry.
 */
export interface IdempotencyStore {
  begin(scope: string, key: string, fingerprint: string): Promise<BeginResult>;
  complete(scope: string, key: string, response: StoredResponse): Promise<void>;
  release(scope: string, key: string): Promise<void>;
}

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function fingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256').update(`${method.toUpperCase()} ${path}\n${canonicalJson(body)}`).digest('hex');
}

/** JSON with object keys sorted, so semantically identical bodies fingerprint identically. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return '';
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

interface MemoryEntry {
  fingerprint: string;
  response: StoredResponse | null;
  expiresAt: number;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private entries = new Map<string, MemoryEntry>();
  constructor(private readonly now: () => number = Date.now) {}

  async begin(scope: string, key: string, fp: string): Promise<BeginResult> {
    const k = `${scope}\u0000${key}`;
    const existing = this.entries.get(k);
    if (existing && existing.expiresAt > this.now()) {
      if (existing.fingerprint !== fp) return { kind: 'mismatch' };
      return existing.response ? { kind: 'replay', response: existing.response } : { kind: 'in_progress' };
    }
    this.entries.set(k, { fingerprint: fp, response: null, expiresAt: this.now() + IDEMPOTENCY_TTL_MS });
    return { kind: 'new' };
  }

  async complete(scope: string, key: string, response: StoredResponse): Promise<void> {
    const entry = this.entries.get(`${scope}\u0000${key}`);
    if (entry) entry.response = response;
  }

  async release(scope: string, key: string): Promise<void> {
    this.entries.delete(`${scope}\u0000${key}`);
  }
}
