export interface Config {
  mode: 'mock' | 'live';
  port: number;
  corsOrigins: string[];
  databaseUrl: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.API_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'live') throw new Error(`API_MODE must be "mock" or "live", got "${mode}"`);
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT must be a positive integer, got "${env.PORT}"`);
  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (mode === 'live' && !databaseUrl) throw new Error('DATABASE_URL is required when API_MODE=live');
  return {
    mode,
    port,
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    databaseUrl,
  };
}
