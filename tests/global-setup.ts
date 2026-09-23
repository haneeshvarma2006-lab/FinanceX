import { config } from 'dotenv';

config({ path: '.env.test', override: true });

/**
 * Migrate the test database once per run, then start from a clean slate.
 * Imports happen inside the function so the env above is already in place.
 */
export default async function setup(): Promise<void> {
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { db, getPool } = await import('../src/lib/db/client');

  await migrate(db, { migrationsFolder: './db/migrations' });
  await getPool().query('truncate table audit_log, sessions, rate_limits, users cascade');
  await getPool().end();
}
