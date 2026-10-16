import { FEATURE_KEYS } from './contract/features';
import { CONTRACT_VERSION } from './contract/version';
import type { Database } from './db/client';
import type { LiveHandler } from './http/pipeline';

export interface LiveDeps {
  db: Database | null;
  mode: 'mock' | 'live';
}

/**
 * Live implementations, keyed by operationId. Only system endpoints exist at P0; every other
 * contracted operation answers 501 `not_implemented` in live mode until its issue ships.
 */
export function createLiveHandlers(deps: LiveDeps): Record<string, LiveHandler> {
  return {
    getHealth: async () => {
      let database: 'ok' | 'error' | 'not_configured' = 'not_configured';
      if (deps.db) {
        try {
          await deps.db.query('select 1');
          database = 'ok';
        } catch {
          database = 'error';
        }
      }
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { status: database === 'error' ? 'degraded' : 'ok', mode: deps.mode, contract_version: CONTRACT_VERSION, checks: { database }, checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') },
      };
    },
    getMeta: async () => ({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contract_version: CONTRACT_VERSION,
        mode: deps.mode,
        features: FEATURE_KEYS.map((key) => ({ key, state: 'disabled', reason: 'Not implemented in the live service yet.', coverage_note: null })),
      },
    }),
  };
}
