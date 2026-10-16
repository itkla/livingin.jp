import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { createPgDatabase } from './db/client';
import { SqlIdempotencyStore } from './db/idempotency-store';

const config = loadConfig();
const db = config.databaseUrl ? createPgDatabase(config.databaseUrl) : null;
const app = createApp({
  mode: config.mode,
  corsOrigins: config.corsOrigins,
  db,
  ...(config.mode === 'live' && db ? { idempotency: new SqlIdempotencyStore(db) } : {}),
  validateResponses: process.env.NODE_ENV !== 'production',
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`livingin.jp API (${config.mode} mode) listening on http://localhost:${info.port}`);
  console.log(`  contract: http://localhost:${info.port}/openapi.json`);
  if (config.mode === 'mock') console.log('  mock auth: Authorization: Bearer mock:<member|member_b|organizer|operator|restricted>');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void db?.close();
    process.exit(0);
  });
}
