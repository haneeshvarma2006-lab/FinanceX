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

/**
 * The pool and the client are built on first use, never at import time.
 *
 * This is not a micro-optimisation. `next build` imports every route module to
 * read its configuration, so anything constructed at module scope has to
 * succeed during the build — and building a pool calls `getEnv()`, which
 * requires DATABASE_URL and AUTH_SECRET. That made the whole build depend on
 * production secrets and fail without them, on a step that never needs a
 * database. Deferring construction to the first query keeps the build a pure
 * compile.
 */
let poolInstance: Pool | undefined;

function createPool(): Pool {
  const pool = new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: getEnv().DATABASE_MAX_CONNECTIONS,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  if (getEnv().NODE_ENV !== 'production') {
    globalThis.__nestedFlowPool = pool;
  }

  return pool;
}

export function getPool(): Pool {
  poolInstance ??= globalThis.__nestedFlowPool ?? createPool();
  return poolInstance;
}

function createClient() {
  return drizzle(getPool(), { schema, casing: 'snake_case' });
}

export type Database = ReturnType<typeof createClient>;

let clientInstance: Database | undefined;

function getClient(): Database {
  clientInstance ??= createClient();
  return clientInstance;
}

/**
 * A lazy stand-in for the Drizzle client.
 *
 * Every call site keeps writing `db.select(...)`; the proxy builds the real
 * client the first time anything is read off it. Methods are bound to the
 * client rather than the proxy so Drizzle's own internals see the object they
 * expect.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property) as unknown;
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has(_target, property) {
    return property in getClient();
  },
});

export { schema };
