import { jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/** A price as a provider gave it — numbers for display, never for money. */
export type StoredQuote = {
  price: number;
  changePercent: number | null;
  high: number | null;
  low: number | null;
  marketOpen: boolean | null;
  currency: string | null;
  /** Milliseconds: when the provider says the price is from. */
  at: number;
};

/**
 * The last price fetched for each keyed instrument, shared by everyone.
 *
 * Public market data, not anyone's personal data: no user column, nothing to
 * export or delete per account. It exists because a free data key allows a
 * couple of dozen requests a day, and serverless instances come and go — a
 * cache in memory would forget and spend the allowance again on every cold
 * start. One row per instrument means one request per refresh, for all.
 */
export const marketQuotes = pgTable('market_quotes', {
  /** Instrument id, e.g. `td:XAU/USD`. */
  id: varchar({ length: 40 }).primaryKey(),
  provider: varchar({ length: 20 }).notNull(),
  /** The last good quote. Kept when a later attempt fails. */
  quote: jsonb().$type<StoredQuote>(),
  /** Why the latest attempt gave no price, if it did not. */
  error: varchar({ length: 80 }),
  attemptedAt: timestamp({ withTimezone: true }).notNull(),
  updatedAt: timestamp({ withTimezone: true }),
});

export type MarketQuoteRow = typeof marketQuotes.$inferSelect;
