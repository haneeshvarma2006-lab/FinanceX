import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';

/**
 * Quantities and prices are NUMERIC(24,8), read as strings and handled as
 * scaled bigints (see decimal.ts). They are never read into a JavaScript
 * number, which would silently round a crypto price.
 */
const marketDecimal = (name: string) => numeric(name, { precision: 24, scale: 8, mode: 'string' });

export const tradingAccounts = pgTable(
  'trading_accounts',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar({ length: 120 }).notNull(),
    broker: varchar({ length: 120 }),
    currency: varchar({ length: 3 }).notNull(),
    startingBalanceMinor: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    /** Intended risk per trade, in basis points. 100 = 1%. */
    riskPerTradeBps: smallint().notNull().default(100),

    /**
     * Environment label. A journal mixing paper trades with real ones produces
     * statistics that describe neither, so every account states which it is.
     */
    environment: varchar({ length: 16 }).notNull().default('live'),

    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('trading_accounts_user_id_idx').on(t.userId),
    uniqueIndex('trading_accounts_user_name_key').on(t.userId, t.name),
    check(
      'trading_accounts_environment_check',
      sql`${t.environment} in ('live','paper','backtest')`,
    ),
  ],
);

export const strategies = pgTable(
  'strategies',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar({ length: 120 }).notNull(),
    description: text(),
    rules: text(),

    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('strategies_user_id_idx').on(t.userId),
    uniqueIndex('strategies_user_name_key').on(t.userId, t.name),
  ],
);

/**
 * A trade.
 *
 * `averageEntryPrice`, `averageExitPrice`, `quantity` and `realizedPnlMinor`
 * are DERIVED from trade_executions and recomputed on every execution write.
 * They are stored so lists and statistics do not need to re-aggregate, not
 * because they are independently authoritative.
 */
export const trades = pgTable(
  'trades',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tradingAccountId: varchar({ length: 36 })
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: 'cascade' }),
    strategyId: varchar({ length: 36 }).references(() => strategies.id, {
      onDelete: 'set null',
    }),

    symbol: varchar({ length: 32 }).notNull(),
    /** equity | crypto | forex | futures | option */
    assetClass: varchar({ length: 16 }).notNull().default('equity'),
    /** long | short */
    direction: varchar({ length: 8 }).notNull(),
    /** planned | open | closed | cancelled */
    status: varchar({ length: 16 }).notNull().default('planned'),

    openedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),

    quantity: marketDecimal('quantity').notNull().default('0'),
    averageEntryPrice: marketDecimal('average_entry_price'),
    averageExitPrice: marketDecimal('average_exit_price'),
    stopPrice: marketDecimal('stop_price'),
    targetPrice: marketDecimal('target_price'),

    feesMinor: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    realizedPnlMinor: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    /** Money the user accepted losing on this trade, for the R-multiple. */
    plannedRiskMinor: bigint({ mode: 'bigint' }),
    rMultiple: marketDecimal('r_multiple'),

    currency: varchar({ length: 3 }).notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('trades_user_opened_idx').on(t.userId, t.openedAt),
    index('trades_account_status_idx').on(t.tradingAccountId, t.status),
    index('trades_user_symbol_idx').on(t.userId, t.symbol),
    index('trades_strategy_idx').on(t.strategyId),
    check('trades_direction_check', sql`${t.direction} in ('long','short')`),
    check('trades_status_check', sql`${t.status} in ('planned','open','closed','cancelled')`),
  ],
);

/** The source of truth. Everything on `trades` is derived from these rows. */
export const tradeExecutions = pgTable(
  'trade_executions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tradeId: varchar({ length: 36 })
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),

    /** buy | sell */
    side: varchar({ length: 8 }).notNull(),
    quantity: marketDecimal('quantity').notNull(),
    price: marketDecimal('price').notNull(),
    feeMinor: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    executedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('trade_executions_trade_idx').on(t.tradeId, t.executedAt),
    index('trade_executions_user_idx').on(t.userId),
    check('trade_executions_side_check', sql`${t.side} in ('buy','sell')`),
    check('trade_executions_quantity_positive', sql`${t.quantity} > 0`),
    check('trade_executions_price_nonneg', sql`${t.price} >= 0`),
  ],
);

export const tradeNotes = pgTable(
  'trade_notes',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tradeId: varchar({ length: 36 })
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),

    /** thesis | review | psychology */
    kind: varchar({ length: 16 }).notNull(),
    body: text().notNull(),

    /** Free-text feeling at the time: fear, greed, patience, fomo, calm. */
    emotionTag: varchar({ length: 32 }),
    /** Self-rated 1-5 conviction, for spotting where confidence misleads. */
    confidence: smallint(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('trade_notes_trade_idx').on(t.tradeId, t.createdAt),
    check('trade_notes_kind_check', sql`${t.kind} in ('thesis','review','psychology')`),
    check(
      'trade_notes_confidence_range',
      sql`${t.confidence} is null or (${t.confidence} between 1 and 5)`,
    ),
  ],
);

export type TradingAccount = typeof tradingAccounts.$inferSelect;
export type Strategy = typeof strategies.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type TradeExecution = typeof tradeExecutions.$inferSelect;
export type TradeNote = typeof tradeNotes.$inferSelect;
