import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { marketQuotes, type MarketQuoteRow, type StoredQuote } from './schema';

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
