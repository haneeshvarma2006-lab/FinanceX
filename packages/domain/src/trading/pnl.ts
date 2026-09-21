import { absDecimal, divDecimal, mulDecimal, notionalMinor } from './decimal';

/**
 * Realised profit and loss from a trade's executions.
 *
 * Executions are the source of truth. A journal that assumes one entry and one
 * exit cannot represent scaling in, scaling out, or a partial fill — which is
 * most of real trading — so entry price, exit price and P&L are all derived
 * here rather than typed in by the user.
 */

export type Side = 'buy' | 'sell';
export type Direction = 'long' | 'short';

export type Execution = {
  side: Side;
  /** Scaled by 10^8. */
  quantity: bigint;
  /** Scaled by 10^8. */
  price: bigint;
  /** Already in the currency's minor units. */
  feeMinor: bigint;
};

export type TradeMetrics = {
  /** Total quantity opened, scaled by 10^8. */
  openedQuantity: bigint;
  /** Total quantity closed, scaled by 10^8. */
  closedQuantity: bigint;
  /** Quantity still open, scaled by 10^8. */
  openQuantity: bigint;
  /** Weighted average entry price, scaled by 10^8. Null with no entries. */
  averageEntryPrice: bigint | null;
  /** Weighted average exit price, scaled by 10^8. Null with no exits. */
  averageExitPrice: bigint | null;
  /** Total fees across every execution, in minor units. */
  feesMinor: bigint;
  /** Realised P&L on the closed portion, net of fees, in minor units. */
  realizedPnlMinor: bigint;
  /** True once the position is flat. */
  closed: boolean;
};

/**
 * For a long, entries are buys and exits are sells. For a short it is the
 * other way round — which is exactly the detail that, when got wrong, silently
 * reports every winning short as a loss.
 */
function entrySide(direction: Direction): Side {
  return direction === 'long' ? 'buy' : 'sell';
}

export function computeTradeMetrics(
  direction: Direction,
  executions: readonly Execution[],
  currencyExponent: number,
): TradeMetrics {
  const entry = entrySide(direction);

  let openedQuantity = 0n;
  let closedQuantity = 0n;
  let entryNotional = 0n; // scaled^2 accumulator, via weighted sum
  let exitNotional = 0n;
  let feesMinor = 0n;

  for (const execution of executions) {
    const quantity = absDecimal(execution.quantity);
    feesMinor += execution.feeMinor;

    if (execution.side === entry) {
      openedQuantity += quantity;
      entryNotional += mulDecimal(quantity, execution.price);
    } else {
      closedQuantity += quantity;
      exitNotional += mulDecimal(quantity, execution.price);
    }
  }

  const averageEntryPrice = openedQuantity > 0n ? divDecimal(entryNotional, openedQuantity) : null;
  const averageExitPrice = closedQuantity > 0n ? divDecimal(exitNotional, closedQuantity) : null;

  // Only the matched quantity has realised anything. Closing more than was
  // opened is a data error, not a bigger profit, so the matched amount is
  // capped at the smaller of the two.
  const matched = closedQuantity < openedQuantity ? closedQuantity : openedQuantity;

  let realizedPnlMinor = 0n;

  if (matched > 0n && averageEntryPrice !== null && averageExitPrice !== null) {
    // Long profits when exit > entry; short profits when entry > exit.
    const perUnit =
      direction === 'long'
        ? averageExitPrice - averageEntryPrice
        : averageEntryPrice - averageExitPrice;

    realizedPnlMinor = notionalMinor(matched, perUnit, currencyExponent);
  }

  // Fees always reduce the result, for longs and shorts alike.
  if (matched > 0n) realizedPnlMinor -= feesMinor;

  const openQuantity = openedQuantity - closedQuantity;

  return {
    openedQuantity,
    closedQuantity,
    openQuantity: openQuantity > 0n ? openQuantity : 0n,
    averageEntryPrice,
    averageExitPrice,
    feesMinor,
    realizedPnlMinor,
    closed: openedQuantity > 0n && openQuantity <= 0n,
  };
}

/**
 * R-multiple: profit expressed in units of the risk originally accepted.
 *
 * This is the number that makes risk discipline measurable — a trader with a
 * 40% win rate and an average of +2R is doing better than one at 60% and +0.3R.
 * Returned scaled by 10^8, or null when no risk was recorded.
 */
export function rMultiple(realizedPnlMinor: bigint, plannedRiskMinor: bigint): bigint | null {
  if (plannedRiskMinor <= 0n) return null;
  return divDecimal(realizedPnlMinor * 10n ** 8n, plannedRiskMinor * 10n ** 8n);
}

export type StrategyStats = {
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  /** Percentage 0-100, rounded. For display only. */
  winRatePercent: number;
  grossProfitMinor: bigint;
  grossLossMinor: bigint;
  netPnlMinor: bigint;
  /** Gross profit divided by gross loss, scaled by 10^8. Null when no losses. */
  profitFactor: bigint | null;
  /** Average P&L per trade in minor units. */
  expectancyMinor: bigint;
};

/**
 * Aggregate statistics over closed trades.
 *
 * Every figure here is computed from the user's own recorded trades. None of
 * it is simulated, backfilled, or sourced from a market data provider, and it
 * says nothing about what any future trade will do.
 */
export function computeStrategyStats(realizedPnls: readonly bigint[]): StrategyStats {
  let wins = 0;
  let losses = 0;
  let breakEven = 0;
  let grossProfitMinor = 0n;
  let grossLossMinor = 0n;

  for (const pnl of realizedPnls) {
    if (pnl > 0n) {
      wins += 1;
      grossProfitMinor += pnl;
    } else if (pnl < 0n) {
      losses += 1;
      grossLossMinor += -pnl;
    } else {
      breakEven += 1;
    }
  }

  const trades = realizedPnls.length;
  const netPnlMinor = grossProfitMinor - grossLossMinor;

  return {
    trades,
    wins,
    losses,
    breakEven,
    winRatePercent: trades === 0 ? 0 : Math.round((wins / trades) * 100),
    grossProfitMinor,
    grossLossMinor,
    netPnlMinor,
    profitFactor:
      grossLossMinor === 0n
        ? null
        : divDecimal(grossProfitMinor * 10n ** 8n, grossLossMinor * 10n ** 8n),
    expectancyMinor: trades === 0 ? 0n : netPnlMinor / BigInt(trades),
  };
}

/**
 * Equity curve and maximum drawdown from closed trades, in order.
 *
 * Drawdown is measured peak-to-trough on the cumulative curve, which is the
 * figure that actually describes how bad it felt to hold the account.
 */
export function equityCurve(
  startingBalanceMinor: bigint,
  realizedPnls: readonly bigint[],
): { points: bigint[]; maxDrawdownMinor: bigint; peakMinor: bigint } {
  const points: bigint[] = [startingBalanceMinor];
  let equity = startingBalanceMinor;
  let peak = startingBalanceMinor;
  let maxDrawdown = 0n;

  for (const pnl of realizedPnls) {
    equity += pnl;
    points.push(equity);

    if (equity > peak) peak = equity;

    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return { points, maxDrawdownMinor: maxDrawdown, peakMinor: peak };
}
