import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  holdings,
  marketQuotes,
  priceAlerts,
  type Holding,
  type MarketQuoteRow,
  type PriceAlert,
  type StoredQuote,
} from './schema';

export async function findQuotes(ids: readonly string[]): Promise<Map<string, MarketQuoteRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(marketQuotes)
    .where(inArray(marketQuotes.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Record an attempt: a new price replaces the old; a failure keeps it. */
export async function saveAttempt(
  id: string,
  provider: string,
  result: { quote: StoredQuote } | { error: string },
  now: Date,
): Promise<void> {
  const success = 'quote' in result;
  await db
    .insert(marketQuotes)
    .values({
      id,
      provider,
      quote: success ? result.quote : null,
      error: success ? null : result.error.slice(0, 80),
      attemptedAt: now,
      updatedAt: success ? now : null,
    })
    .onConflictDoUpdate({
      target: marketQuotes.id,
      set: success
        ? { provider, quote: result.quote, error: null, attemptedAt: now, updatedAt: now }
        : { provider, error: result.error.slice(0, 80), attemptedAt: now },
    });
}

/* ---------------------------------------------------------- price alerts --- */

export async function listAlerts(userId: string): Promise<PriceAlert[]> {
  return db
    .select()
    .from(priceAlerts)
    .where(eq(priceAlerts.userId, userId))
    .orderBy(desc(priceAlerts.active), desc(priceAlerts.createdAt));
}

export async function listActiveAlerts(userId: string): Promise<PriceAlert[]> {
  return db
    .select()
    .from(priceAlerts)
    .where(and(eq(priceAlerts.userId, userId), eq(priceAlerts.active, true)))
    .orderBy(asc(priceAlerts.createdAt));
}

export async function countActiveAlerts(userId: string): Promise<number> {
  return (await listActiveAlerts(userId)).length;
}

export async function insertAlert(
  userId: string,
  input: { instrumentId: string; direction: 'above' | 'below'; target: string },
): Promise<PriceAlert> {
  const [row] = await db
    .insert(priceAlerts)
    .values({ userId, ...input })
    .returning();
  if (!row) throw new Error('Alert insert returned no row');
  return row;
}

export async function deleteAlert(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(priceAlerts)
    .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)))
    .returning({ id: priceAlerts.id });
  return rows.length > 0;
}

/**
 * Fire an alert — only if it is still armed, so two tabs seeing the same
 * price at once cannot fire it twice.
 */
export async function fireAlert(
  userId: string,
  id: string,
  price: string,
  now: Date,
): Promise<PriceAlert | undefined> {
  const [row] = await db
    .update(priceAlerts)
    .set({ active: false, firedAt: now, firedPrice: price })
    .where(
      and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId), eq(priceAlerts.active, true)),
    )
    .returning();
  return row;
}

export async function rearmAlert(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(priceAlerts)
    .set({ active: true, firedAt: null, firedPrice: null })
    .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)))
    .returning({ id: priceAlerts.id });
  return rows.length > 0;
}

/* -------------------------------------------------------------- holdings --- */

export async function listHoldings(userId: string): Promise<Holding[]> {
  return db
    .select()
    .from(holdings)
    .where(eq(holdings.userId, userId))
    .orderBy(asc(holdings.createdAt));
}

export async function insertHolding(
  userId: string,
  input: {
    instrumentId: string;
    quantity: string;
    unit: 'unit' | 'gram' | 'ounce';
    averagePrice: string | null;
    note: string | null;
  },
): Promise<Holding> {
  const [row] = await db
    .insert(holdings)
    .values({ userId, ...input })
    .returning();
  if (!row) throw new Error('Holding insert returned no row');
  return row;
}

export async function deleteHolding(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(holdings)
    .where(and(eq(holdings.id, id), eq(holdings.userId, userId)))
    .returning({ id: holdings.id });
  return rows.length > 0;
}
