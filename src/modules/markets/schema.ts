import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';

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

/**
 * "Tell me when gold goes above 4,100." One-shot: an alert fires once, then
 * waits to be set again, so a price hovering at the line does not ring all
 * day. Prices are decimals as text, never floats.
 */
export const priceAlerts = pgTable(
  'price_alerts',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    instrumentId: varchar({ length: 40 }).notNull(),
    /** above | below */
    direction: varchar({ length: 8 }).notNull(),
    target: numeric({ precision: 30, scale: 10 }).notNull(),
    active: boolean().notNull().default(true),
    firedAt: timestamp({ withTimezone: true }),
    firedPrice: numeric({ precision: 30, scale: 10 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_alerts_user_active_idx').on(t.userId, t.active),
    check('price_alerts_direction_check', sql`${t.direction} in ('above','below')`),
    check('price_alerts_target_positive', sql`${t.target} > 0`),
  ],
);

/**
 * What someone holds: 0.05 BTC, 10 g of gold, 20 Reliance shares. Valued at
 * the live price on screen; nothing here is a price.
 */
export const holdings = pgTable(
  'holdings',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    instrumentId: varchar({ length: 40 }).notNull(),
    quantity: numeric({ precision: 30, scale: 10 }).notNull(),
    /** unit | gram | ounce — grams and troy ounces for gold and silver. */
    unit: varchar({ length: 8 }).notNull().default('unit'),
    /** What was paid per unit (or per gram), in the market's currency. */
    averagePrice: numeric({ precision: 30, scale: 10 }),
    note: varchar({ length: 120 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('holdings_user_idx').on(t.userId),
    check('holdings_quantity_positive', sql`${t.quantity} > 0`),
    check('holdings_unit_check', sql`${t.unit} in ('unit','gram','ounce')`),
  ],
);

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
