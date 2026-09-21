import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from './decimal';
import {
  computeStrategyStats,
  computeTradeMetrics,
  equityCurve,
  rMultiple,
  type Execution,
} from './pnl';

const INR = 2;

function exec(side: 'buy' | 'sell', qty: string, price: string, feeMinor = 0n): Execution {
  return { side, quantity: parseDecimal(qty), price: parseDecimal(price), feeMinor };
}

describe('long trades', () => {
  it('computes a simple winning long', () => {
    // Buy 100 @ 250, sell 100 @ 275 → 100 * 25 = ₹2,500 = 250000 paise.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '100', '250'), exec('sell', '100', '275')],
      INR,
    );

    expect(m.realizedPnlMinor).toBe(250000n);
    expect(m.closed).toBe(true);
    expect(formatDecimal(m.averageEntryPrice!)).toBe('250');
    expect(formatDecimal(m.averageExitPrice!)).toBe('275');
  });

  it('computes a losing long as negative', () => {
    // Buy 50 @ 100, sell 50 @ 90 → 50 * -10 = -₹500.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '50', '100'), exec('sell', '50', '90')],
      INR,
    );
    expect(m.realizedPnlMinor).toBe(-50000n);
  });

  it('handles scaling in with a weighted average entry', () => {
    // Buy 100 @ 200 and 100 @ 300 → average 250. Sell 200 @ 275 → 200*25 = ₹5,000.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '100', '200'), exec('buy', '100', '300'), exec('sell', '200', '275')],
      INR,
    );

    expect(formatDecimal(m.averageEntryPrice!)).toBe('250');
    expect(m.realizedPnlMinor).toBe(500000n);
    expect(m.closed).toBe(true);
  });

  it('handles scaling out', () => {
    // Buy 100 @ 100; sell 50 @ 120 and 50 @ 140 → avg exit 130 → 100*30 = ₹3,000.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '100', '100'), exec('sell', '50', '120'), exec('sell', '50', '140')],
      INR,
    );

    expect(formatDecimal(m.averageExitPrice!)).toBe('130');
    expect(m.realizedPnlMinor).toBe(300000n);
  });

  it('leaves a partially closed position open', () => {
    // Buy 100 @ 100, sell 40 @ 150 → only 40 realised: 40 * 50 = ₹2,000.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '100', '100'), exec('sell', '40', '150')],
      INR,
    );

    expect(m.closed).toBe(false);
    expect(formatDecimal(m.openQuantity)).toBe('60');
    expect(m.realizedPnlMinor).toBe(200000n);
  });
});

describe('short trades', () => {
  it('computes a winning short as POSITIVE', () => {
    // Sell 100 @ 275, buy back 100 @ 250. A short profits when price falls.
    const m = computeTradeMetrics(
      'short',
      [exec('sell', '100', '275'), exec('buy', '100', '250')],
      INR,
    );

    // Getting the sign wrong here reports every winning short as a loss.
    expect(m.realizedPnlMinor).toBe(250000n);
    expect(m.closed).toBe(true);
  });

  it('computes a losing short as NEGATIVE', () => {
    // Sell 100 @ 250, buy back 100 @ 275.
    const m = computeTradeMetrics(
      'short',
      [exec('sell', '100', '250'), exec('buy', '100', '275')],
      INR,
    );
    expect(m.realizedPnlMinor).toBe(-250000n);
  });

  it('treats sells as entries and buys as exits', () => {
    const m = computeTradeMetrics(
      'short',
      [exec('sell', '100', '300'), exec('buy', '100', '200')],
      INR,
    );

    expect(formatDecimal(m.averageEntryPrice!)).toBe('300');
    expect(formatDecimal(m.averageExitPrice!)).toBe('200');
    expect(m.realizedPnlMinor).toBe(1000000n); // 100 * 100 = ₹10,000
  });
});

describe('fees', () => {
  it('reduces a winning long', () => {
    // ₹2,500 gross, ₹150 of fees → ₹2,350.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '100', '250', 5000n), exec('sell', '100', '275', 10000n)],
      INR,
    );

    expect(m.feesMinor).toBe(15000n);
    expect(m.realizedPnlMinor).toBe(235000n);
  });

  it('deepens a losing short', () => {
    // -₹2,500 gross, ₹150 fees → -₹2,650. Fees never help, in either direction.
    const m = computeTradeMetrics(
      'short',
      [exec('sell', '100', '250', 5000n), exec('buy', '100', '275', 10000n)],
      INR,
    );

    expect(m.realizedPnlMinor).toBe(-265000n);
  });

  it('can turn a gross win into a net loss', () => {
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '100', '100', 5000n), exec('sell', '100', '100.20', 5000n)],
      INR,
    );

    expect(m.realizedPnlMinor).toBe(-8000n); // ₹20 gross, ₹100 fees
  });

  it('charges no fee on a position with no exits', () => {
    const m = computeTradeMetrics('long', [exec('buy', '100', '250', 5000n)], INR);

    expect(m.closed).toBe(false);
    // Nothing realised yet, so nothing to net the fee against.
    expect(m.realizedPnlMinor).toBe(0n);
    expect(m.feesMinor).toBe(5000n);
  });
});

describe('fractional and high-precision instruments', () => {
  it('handles a fractional crypto quantity', () => {
    // Buy 0.5 BTC @ 5,000,000; sell @ 5,200,000 → 0.5 * 200,000 = ₹100,000.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '0.5', '5000000'), exec('sell', '0.5', '5200000')],
      INR,
    );

    expect(m.realizedPnlMinor).toBe(10000000n);
  });

  it('handles a price with eight decimal places', () => {
    // Buy 1,000,000 @ 0.00003421; sell @ 0.00004421 → 1e6 * 0.00001 = ₹10.
    const m = computeTradeMetrics(
      'long',
      [exec('buy', '1000000', '0.00003421'), exec('sell', '1000000', '0.00004421')],
      INR,
    );

    expect(m.realizedPnlMinor).toBe(1000n);
  });
});

describe('r-multiple', () => {
  it('expresses profit in units of risk accepted', () => {
    // Risked ₹1,000, made ₹2,500 → 2.5R.
    expect(formatDecimal(rMultiple(250000n, 100000n)!)).toBe('2.5');
  });

  it('is negative on a loss', () => {
    expect(formatDecimal(rMultiple(-100000n, 100000n)!)).toBe('-1');
  });

  it('is null when no risk was recorded', () => {
    expect(rMultiple(250000n, 0n)).toBeNull();
    expect(rMultiple(250000n, -5n)).toBeNull();
  });
});

describe('strategy statistics', () => {
  it('computes win rate, profit factor and expectancy', () => {
    // Three wins totalling 600, two losses totalling 200.
    const pnls = [30000n, 20000n, 10000n, -15000n, -5000n];
    const stats = computeStrategyStats(pnls);

    expect(stats.trades).toBe(5);
    expect(stats.wins).toBe(3);
    expect(stats.losses).toBe(2);
    expect(stats.winRatePercent).toBe(60);
    expect(stats.grossProfitMinor).toBe(60000n);
    expect(stats.grossLossMinor).toBe(20000n);
    expect(stats.netPnlMinor).toBe(40000n);
    expect(formatDecimal(stats.profitFactor!)).toBe('3');
    expect(stats.expectancyMinor).toBe(8000n);
  });

  it('counts break-even trades separately from wins', () => {
    const stats = computeStrategyStats([0n, 10000n, 0n]);
    expect(stats.breakEven).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.winRatePercent).toBe(33);
  });

  it('has no profit factor when nothing was lost', () => {
    expect(computeStrategyStats([10000n, 20000n]).profitFactor).toBeNull();
  });

  it('is safe on an empty history', () => {
    const stats = computeStrategyStats([]);
    expect(stats.trades).toBe(0);
    expect(stats.winRatePercent).toBe(0);
    expect(stats.expectancyMinor).toBe(0n);
  });
});

describe('equity curve', () => {
  it('tracks cumulative equity and peak-to-trough drawdown', () => {
    // 100000 → 110000 → 90000 → 95000. Peak 110000, trough 90000 → 20000.
    const curve = equityCurve(100000n, [10000n, -20000n, 5000n]);

    expect(curve.points).toEqual([100000n, 110000n, 90000n, 95000n]);
    expect(curve.peakMinor).toBe(110000n);
    expect(curve.maxDrawdownMinor).toBe(20000n);
  });

  it('reports no drawdown on a monotonic climb', () => {
    expect(equityCurve(100000n, [1000n, 2000n, 3000n]).maxDrawdownMinor).toBe(0n);
  });

  it('handles an empty history', () => {
    const curve = equityCurve(100000n, []);
    expect(curve.points).toEqual([100000n]);
    expect(curve.maxDrawdownMinor).toBe(0n);
  });
});

describe('decimal helpers', () => {
  it('round-trips values', () => {
    for (const v of ['0', '1', '0.5', '1234.5678', '0.00000001', '-42.25']) {
      expect(formatDecimal(parseDecimal(v))).toBe(v === '0' ? '0' : v);
    }
  });

  it('rejects more precision than it can hold', () => {
    expect(() => parseDecimal('1.123456789')).toThrow();
  });

  it('rejects nonsense', () => {
    for (const v of ['', 'abc', '1e5', '1.2.3']) {
      expect(() => parseDecimal(v)).toThrow();
    }
  });
});
