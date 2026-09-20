import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  strategies,
  tradeExecutions,
  tradeNotes,
  tradingAccounts,
  trades,
  type Strategy,
  type Trade,
  type TradeExecution,
  type TradeNote,
  type TradingAccount,
} from './schema';

/** As in finance: every function takes and filters on `userId`. */

/* ---------------------------------------------------- trading accounts --- */

export async function listTradingAccounts(userId: string): Promise<TradingAccount[]> {
  return db
    .select()
    .from(tradingAccounts)
    .where(and(eq(tradingAccounts.userId, userId), isNull(tradingAccounts.archivedAt)))
    .orderBy(asc(tradingAccounts.name));
}

export async function findTradingAccount(
  userId: string,
  id: string,
): Promise<TradingAccount | undefined> {
  const [row] = await db
    .select()
    .from(tradingAccounts)
    .where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)))
    .limit(1);

  return row;
}

export async function insertTradingAccount(
  userId: string,
  input: {
    name: string;
    broker: string | null;
    currency: string;
    startingBalanceMinor: bigint;
    riskPerTradeBps: number;
    environment: string;
  },
): Promise<TradingAccount> {
  const [row] = await db
    .insert(tradingAccounts)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Trading account insert returned no row');
  return row;
}

/* ------------------------------------------------------------ strategies --- */

export async function listStrategies(userId: string): Promise<Strategy[]> {
  return db
    .select()
    .from(strategies)
    .where(and(eq(strategies.userId, userId), isNull(strategies.archivedAt)))
    .orderBy(asc(strategies.name));
}

export async function findStrategy(userId: string, id: string): Promise<Strategy | undefined> {
  const [row] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
    .limit(1);

  return row;
}

export async function insertStrategy(
  userId: string,
  input: { name: string; description: string | null; rules: string | null },
): Promise<Strategy> {
  const [row] = await db
    .insert(strategies)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Strategy insert returned no row');
  return row;
}

/* ---------------------------------------------------------------- trades --- */

export type TradeFilter = {
  tradingAccountId?: string;
  strategyId?: string;
  status?: string;
  symbol?: string;
  limit?: number;
  offset?: number;
};

export async function listTrades(userId: string, filter: TradeFilter = {}): Promise<Trade[]> {
  const conditions = [eq(trades.userId, userId)];

  if (filter.tradingAccountId) {
    conditions.push(eq(trades.tradingAccountId, filter.tradingAccountId));
  }
  if (filter.strategyId) conditions.push(eq(trades.strategyId, filter.strategyId));
  if (filter.status) conditions.push(eq(trades.status, filter.status));
  if (filter.symbol) conditions.push(eq(trades.symbol, filter.symbol));

  return db
    .select()
    .from(trades)
    .where(and(...conditions))
    .orderBy(desc(trades.openedAt), desc(trades.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500))
    .offset(filter.offset ?? 0);
}

export async function findTrade(userId: string, id: string): Promise<Trade | undefined> {
  const [row] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .limit(1);

  return row;
}

export async function insertTrade(
  userId: string,
  input: {
    tradingAccountId: string;
    strategyId: string | null;
    symbol: string;
    assetClass: string;
    direction: string;
    currency: string;
    stopPrice: string | null;
    targetPrice: string | null;
    plannedRiskMinor: bigint | null;
  },
): Promise<Trade> {
  const [row] = await db
    .insert(trades)
    .values({ userId, ...input, status: 'planned' })
    .returning();

  if (!row) throw new Error('Trade insert returned no row');
  return row;
}

/** Writes the derived aggregates back after an execution changes. */
export async function updateTradeAggregates(
  userId: string,
  tradeId: string,
  input: {
    quantity: string;
    averageEntryPrice: string | null;
    averageExitPrice: string | null;
    feesMinor: bigint;
    realizedPnlMinor: bigint;
    rMultiple: string | null;
    status: string;
    openedAt: Date | null;
    closedAt: Date | null;
  },
): Promise<Trade | undefined> {
  const [row] = await db
    .update(trades)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))
    .returning();

  return row;
}

export async function deleteTrade(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .returning({ id: trades.id });

  return rows.length > 0;
}

/** Realised P&L of closed trades, oldest first — the equity curve input. */
export async function closedPnlSeries(
  userId: string,
  tradingAccountId?: string,
): Promise<bigint[]> {
  const conditions = [eq(trades.userId, userId), eq(trades.status, 'closed')];
  if (tradingAccountId) conditions.push(eq(trades.tradingAccountId, tradingAccountId));

  const rows = await db
    .select({ pnl: sql<string>`${trades.realizedPnlMinor}::text` })
    .from(trades)
    .where(and(...conditions))
    .orderBy(asc(trades.closedAt));

  return rows.map((r) => BigInt(r.pnl));
}

/* ------------------------------------------------------------ executions --- */

export async function listExecutions(userId: string, tradeId: string): Promise<TradeExecution[]> {
  return db
    .select()
    .from(tradeExecutions)
    .where(and(eq(tradeExecutions.userId, userId), eq(tradeExecutions.tradeId, tradeId)))
    .orderBy(asc(tradeExecutions.executedAt), asc(tradeExecutions.createdAt));
}

export async function insertExecution(
  userId: string,
  input: {
    tradeId: string;
    side: string;
    quantity: string;
    price: string;
    feeMinor: bigint;
    executedAt: Date;
  },
): Promise<TradeExecution> {
  const [row] = await db
    .insert(tradeExecutions)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Execution insert returned no row');
  return row;
}

export async function deleteExecution(
  userId: string,
  id: string,
): Promise<TradeExecution | undefined> {
  const [row] = await db
    .delete(tradeExecutions)
    .where(and(eq(tradeExecutions.id, id), eq(tradeExecutions.userId, userId)))
    .returning();

  return row;
}

/* ----------------------------------------------------------------- notes --- */

export async function listNotes(userId: string, tradeId: string): Promise<TradeNote[]> {
  return db
    .select()
    .from(tradeNotes)
    .where(and(eq(tradeNotes.userId, userId), eq(tradeNotes.tradeId, tradeId)))
    .orderBy(desc(tradeNotes.createdAt));
}

export async function insertNote(
  userId: string,
  input: {
    tradeId: string;
    kind: string;
    body: string;
    emotionTag: string | null;
    confidence: number | null;
  },
): Promise<TradeNote> {
  const [row] = await db
    .insert(tradeNotes)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Note insert returned no row');
  return row;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(tradeNotes)
    .where(and(eq(tradeNotes.id, id), eq(tradeNotes.userId, userId)))
    .returning({ id: tradeNotes.id });

  return rows.length > 0;
}
