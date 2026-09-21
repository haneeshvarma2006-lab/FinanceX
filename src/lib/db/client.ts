import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '@/lib/env';
import * as finance from '@/modules/finance/schema';
import * as identity from '@/modules/identity/schema';
import * as productivity from '@/modules/productivity/schema';
import * as trading from '@/modules/trading/schema';

const schema = { ...identity, ...finance, ...trading, ...productivity };

declare global {
  // Reuse the pool across hot reloads in development, otherwise every edit
  // leaks a fresh set of connections until Postgres refuses new ones.
  var __kylixPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pool: Pool = globalThis.__kylixPool ?? createPool();

if (getEnv().NODE_ENV !== 'production') {
  globalThis.__kylixPool = pool;
}

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Database = typeof db;
export { schema };
