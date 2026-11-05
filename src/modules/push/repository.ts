import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pushSubscriptions, type PushSubscriptionRow } from './schema';

/** Every function filters on `userId`: no one reaches another account's devices. */

export async function listForUser(userId: string): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(pushSubscriptions.createdAt);
}

export async function countForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return row?.count ?? 0;
}

/**
 * Save a device, or refresh it. An endpoint already saved — this device,
 * subscribed before, perhaps under another account — is moved to this one
 * with its new keys.
 */
export async function upsert(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string | null;
}): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        label: input.label,
        failures: 0,
      },
    });
}

export async function removeEndpoint(userId: string, endpoint: string): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function removeById(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.id, id)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function markDelivered(id: string): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ failures: 0, lastSentAt: new Date() })
    .where(eq(pushSubscriptions.id, id));
}

/** One more failure in a row; returns the new count. */
export async function markFailed(id: string): Promise<number> {
  const [row] = await db
    .update(pushSubscriptions)
    .set({ failures: sql`${pushSubscriptions.failures} + 1` })
    .where(eq(pushSubscriptions.id, id))
    .returning({ failures: pushSubscriptions.failures });
  return row?.failures ?? 0;
}

/** Drop a device the push service says no longer exists. */
export async function removeDead(id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}
