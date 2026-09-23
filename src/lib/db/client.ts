import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '@/lib/env';
import * as finance from '@/modules/finance/schema';
import * as identity from '@/modules/identity/schema';
import * as productivity from '@/modules/productivity/schema';
import * as rules from '@/modules/rules/schema';
import * as sync from '@/modules/sync/schema';
import * as trading from '@/modules/trading/schema';

const schema = { ...identity, ...finance, ...trading, ...productivity, ...rules, ...sync };

declare global {
  // Reuse the pool across hot reloads in development, otherwise every edit
  // leaks a fresh set of connections until Postgres refuses new ones.
  var __nestedFlowPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: getEnv().DATABASE_MAX_CONNECTIONS,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pool: Pool = globalThis.__nestedFlowPool ?? createPool();

if (getEnv().NODE_ENV !== 'production') {
  globalThis.__nestedFlowPool = pool;
}

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Database = typeof db;
export { schema };
