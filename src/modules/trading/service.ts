import { invalid, notFound, ok, type Result } from '@/lib/result';
import { exponentOf, parseAmount, type Currency } from '@nestedflow/domain/money';
import { formatDecimal, openedSoonAfterLoss, parseDecimal } from '@nestedflow/domain/trading';
import {
  computeStrategyStats,
  computeTradeMetrics,
  equityCurve,
  rMultiple,
} from '@nestedflow/domain/trading';
import * as repo from './repository';
import type { Trade, TradeExecution, TradeNote } from './schema';
import type { ExecutionInput, NoteInput, TradeInput } from './validators';

export async function createTrade(userId: string, input: TradeInput): Promise<Result<Trade>> {
  const account = await repo.findTradingAccount(userId, input.tradingAccountId);
  if (!account) return notFound();

  if (input.strategyId) {
    const strategy = await repo.findStrategy(userId, input.strategyId);
    if (!strategy) return notFound();
  }

  let plannedRiskMinor: bigint | null = null;
  if (input.plannedRisk) {
    try {
      plannedRiskMinor = parseAmount(input.plannedRisk, account.currency as Currency);
    } catch (error) {
      return invalid('plannedRisk', error instanceof Error ? error.message : 'Invalid amount');
    }
    if (plannedRiskMinor < 0n) return invalid('plannedRisk', 'Risk cannot be negative');
  }

  const trade = await repo.insertTrade(userId, {
    tradingAccountId: account.id,
    strategyId: input.strategyId || null,
    symbol: input.symbol,
    assetClass: input.assetClass,
    direction: input.direction,
    currency: account.currency,
    stopPrice: input.stopPrice || null,
    targetPrice: input.targetPrice || null,
    plannedRiskMinor,
    chartUrl: input.chartUrl || null,
  });

  return ok(trade);
}

/**
 * Record a fill and recompute the trade.
 *
 * The aggregates on `trades` are rewritten from the full execution list every
 * time, rather than adjusted incrementally. Incremental updates drift the
 * moment one write fails or an execution is deleted; a full recompute is
 * cheap at this scale and cannot disagree with its own source rows.
 */
export async function addExecution(
  userId: string,
  tradeId: string,
  input: ExecutionInput,
): Promise<Result<{ trade: Trade; execution: TradeExecution }>> {
  const trade = await repo.findTrade(userId, tradeId);
  if (!trade) return notFound();

  if (trade.status === 'cancelled') {
    return invalid('side', 'This trade was cancelled');
  }

  let quantity: bigint;
  let price: bigint;
  try {
    quantity = parseDecimal(input.quantity);
    price = parseDecimal(input.price);
  } catch (error) {
    return invalid('quantity', error instanceof Error ? error.message : 'Invalid number');
  }

  if (quantity <= 0n) return invalid('quantity', 'Quantity must be greater than zero');
  if (price < 0n) return invalid('price', 'Price cannot be negative');

  let feeMinor: bigint;
  try {
    feeMinor = parseAmount(input.fee || '0', trade.currency as Currency);
  } catch (error) {
    return invalid('fee', error instanceof Error ? error.message : 'Invalid fee');
  }
  if (feeMinor < 0n) return invalid('fee', 'Fees cannot be negative');

  const executedAt = new Date(input.executedAt);
  if (Number.isNaN(executedAt.getTime())) {
    return invalid('executedAt', 'That is not a valid date and time');
  }

  const execution = await repo.insertExecution(userId, {
    tradeId,
    side: input.side,
    quantity: formatDecimal(quantity),
    price: formatDecimal(price),
    feeMinor,
    executedAt,
  });

  const updated = await recomputeTrade(userId, tradeId);
  if (!updated) return notFound();

  return { ok: true, value: { trade: updated, execution } };
}

export async function removeExecution(userId: string, executionId: string): Promise<Result<Trade>> {
  const removed = await repo.deleteExecution(userId, executionId);
  if (!removed) return notFound();

  const updated = await recomputeTrade(userId, removed.tradeId);
  if (!updated) return notFound();

  return ok(updated);
}

/** Recompute every derived field on a trade from its executions. */
export async function recomputeTrade(userId: string, tradeId: string): Promise<Trade | undefined> {
  const trade = await repo.findTrade(userId, tradeId);
  if (!trade) return undefined;

  const executions = await repo.listExecutions(userId, tradeId);
  const exponent = exponentOf(trade.currency as Currency);

  const metrics = computeTradeMetrics(
    trade.direction as 'long' | 'short',
    executions.map((e) => ({
      side: e.side as 'buy' | 'sell',
      quantity: parseDecimal(e.quantity),
      price: parseDecimal(e.price),
      feeMinor: e.feeMinor,
    })),
    exponent,
  );

  const first = executions[0];
  const last = executions[executions.length - 1];

  const status = executions.length === 0 ? 'planned' : metrics.closed ? 'closed' : 'open';

  const r =
    metrics.closed && trade.plannedRiskMinor
      ? rMultiple(metrics.realizedPnlMinor, trade.plannedRiskMinor)
      : null;

  return repo.updateTradeAggregates(userId, tradeId, {
    quantity: formatDecimal(metrics.openedQuantity),
    averageEntryPrice:
      metrics.averageEntryPrice === null ? null : formatDecimal(metrics.averageEntryPrice),
    averageExitPrice:
      metrics.averageExitPrice === null ? null : formatDecimal(metrics.averageExitPrice),
    feesMinor: metrics.feesMinor,
    realizedPnlMinor: metrics.realizedPnlMinor,
    rMultiple: r === null ? null : formatDecimal(r),
    status,
    openedAt: first?.executedAt ?? null,
    closedAt: metrics.closed ? (last?.executedAt ?? null) : null,
  });
}

export async function addNote(
  userId: string,
  tradeId: string,
  input: NoteInput,
): Promise<Result<TradeNote>> {
  const trade = await repo.findTrade(userId, tradeId);
  if (!trade) return notFound();

  const note = await repo.insertNote(userId, {
    tradeId,
    kind: input.kind,
    body: input.body,
    emotionTag: input.emotionTag || null,
    confidence: input.confidence ?? null,
  });

  return ok(note);
}

/**
 * Performance statistics for an account.
 *
 * Everything returned is computed from the user's own recorded trades. Nothing
 * is simulated or fetched from a market data provider, and nothing here
 * predicts future results — see the disclosure shown alongside it in the UI.
 */
export async function accountPerformance(userId: string, tradingAccountId: string) {
  const account = await repo.findTradingAccount(userId, tradingAccountId);
  if (!account) return undefined;

  const pnls = await repo.closedPnlSeries(userId, tradingAccountId);

  return {
    account,
    stats: computeStrategyStats(pnls),
    curve: equityCurve(account.startingBalanceMinor, pnls),
  };
}

/* --------------------------------------------------------------- journal --- */

export type JournalGroup = {
  key: string;
  label: string;
  trades: number;
  closed: number;
  wins: number;
  netPnlMinor: bigint;
};

/**
 * What the journal says about the trader, from their own records only:
 * results by setup, results by the feeling they tagged, and the trades they
 * opened soon after a loss. Totals are in one currency — the account's — so
 * figures in different currencies are never added together.
 */
export async function journalInsights(userId: string, currency: string, limit = 300) {
  const [trades, strategies] = await Promise.all([
    repo.listTrades(userId, { limit }),
    repo.listStrategies(userId),
  ]);
  const inCurrency = trades.filter((t) => t.currency === currency);
  const notes = await repo.listNotesForTrades(
    userId,
    inCurrency.map((t) => t.id),
  );

  const emotionsByTrade = new Map<string, Set<string>>();
  for (const note of notes) {
    if (!note.emotionTag) continue;
    const set = emotionsByTrade.get(note.tradeId) ?? new Set<string>();
    set.add(note.emotionTag);
    emotionsByTrade.set(note.tradeId, set);
  }

  const setupName = new Map(strategies.map((s) => [s.id, s.name]));
  const bySetup = new Map<string, JournalGroup>();
  const byEmotion = new Map<string, JournalGroup>();

  const add = (map: Map<string, JournalGroup>, key: string, label: string, trade: Trade) => {
    const group = map.get(key) ?? { key, label, trades: 0, closed: 0, wins: 0, netPnlMinor: 0n };
    group.trades += 1;
    if (trade.status === 'closed') {
      group.closed += 1;
      if (trade.realizedPnlMinor > 0n) group.wins += 1;
      group.netPnlMinor += trade.realizedPnlMinor;
    }
    map.set(key, group);
  };

  for (const trade of inCurrency) {
    const key = trade.strategyId ?? 'none';
    add(
      bySetup,
      key,
      trade.strategyId ? (setupName.get(trade.strategyId) ?? 'Setup') : 'No setup',
      trade,
    );
    for (const emotion of emotionsByTrade.get(trade.id) ?? []) {
      add(byEmotion, emotion, emotion, trade);
    }
  }

  const soonAfterLoss = openedSoonAfterLoss(
    inCurrency.map((t) => ({
      id: t.id,
      accountId: t.tradingAccountId,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      realizedPnlMinor: t.realizedPnlMinor,
      status: t.status,
    })),
  );
  const afterLoss = inCurrency.filter((t) => soonAfterLoss.has(t.id));

  const byNet = (a: JournalGroup, b: JournalGroup) =>
    b.netPnlMinor > a.netPnlMinor ? 1 : b.netPnlMinor < a.netPnlMinor ? -1 : 0;

  return {
    setups: [...bySetup.values()].sort(byNet),
    emotions: [...byEmotion.values()].sort(byNet),
    emotionsByTrade,
    notes,
    soonAfterLoss,
    afterLoss: {
      trades: afterLoss.length,
      closed: afterLoss.filter((t) => t.status === 'closed').length,
      netPnlMinor: afterLoss.reduce(
        (sum, t) => (t.status === 'closed' ? sum + t.realizedPnlMinor : sum),
        0n,
      ),
    },
  };
}
