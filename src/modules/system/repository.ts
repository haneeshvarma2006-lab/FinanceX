import { getPool } from '@/lib/db/client';

/**
 * Queries about the deployment itself, not about any user.
 *
 * Kept in a repository like every other query so the rule "only repositories
 * touch the database" has no exceptions to argue about. Neither query reads
 * user data, which is why neither takes a userId.
 */

export async function ping(): Promise<void> {
  await getPool().query('select 1');
}

/** Throws with Postgres code 3F000 or 42P01 when migrations were never run. */
export async function appliedMigrationCount(): Promise<number> {
  const { rows } = await getPool().query<{ applied: number }>(
    'select count(*)::int as applied from drizzle.__drizzle_migrations',
  );
  return rows[0]?.applied ?? 0;
}
