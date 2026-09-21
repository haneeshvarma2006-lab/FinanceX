import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { changeLog, type ChangeLogEntry } from './schema';

/**
 * Delta reads for a syncing client. Scoped by `userId` like every other
 * repository — a sync cursor must never be able to reach another account.
 */

export const MAX_CHANGES_PER_PAGE = 500;

export async function changesSince(
  userId: string,
  cursor: bigint,
  limit = 200,
): Promise<ChangeLogEntry[]> {
  return db
    .select()
    .from(changeLog)
    .where(and(eq(changeLog.userId, userId), gt(changeLog.id, cursor)))
    .orderBy(asc(changeLog.id))
    .limit(Math.min(limit, MAX_CHANGES_PER_PAGE));
}

/** The newest cursor for this user — what a fresh client starts from. */
export async function latestCursor(userId: string): Promise<bigint> {
  const [row] = await db
    .select({ max: sql<string>`coalesce(max(${changeLog.id}), 0)::text` })
    .from(changeLog)
    .where(eq(changeLog.userId, userId));

  return BigInt(row?.max ?? '0');
}

/**
 * Purge a user's log.
 *
 * Called from the account-deletion path. `change_log.user_id` deliberately has
 * no foreign key — the cascade that deletes a user's rows fires these very
 * triggers, and a FK would make those inserts fail and abort the deletion — so
 * the rows are removed explicitly instead.
 */
export async function deleteLogForUser(userId: string): Promise<number> {
  const rows = await db
    .delete(changeLog)
    .where(eq(changeLog.userId, userId))
    .returning({ id: changeLog.id });

  return rows.length;
}

/**
 * Trim history a client can no longer need.
 *
 * A client whose cursor is older than the oldest retained entry must do a full
 * resync rather than a delta — which is why the sync endpoint reports when a
 * cursor has fallen out of the window instead of silently returning a partial
 * delta.
 */
export async function pruneBefore(userId: string, cursor: bigint): Promise<number> {
  const rows = await db
    .delete(changeLog)
    .where(and(eq(changeLog.userId, userId), sql`${changeLog.id} <= ${cursor}`))
    .returning({ id: changeLog.id });

  return rows.length;
}

/** The oldest entry still retained, for deciding whether a cursor is usable. */
export async function oldestCursor(userId: string): Promise<bigint> {
  const [row] = await db
    .select({ min: sql<string>`coalesce(min(${changeLog.id}), 0)::text` })
    .from(changeLog)
    .where(eq(changeLog.userId, userId));

  return BigInt(row?.min ?? '0');
}
