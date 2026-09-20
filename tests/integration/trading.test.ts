import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as repo from '@/modules/trading/repository';
import * as trading from '@/modules/trading/service';

const ctx = { ip: '203.0.113.60', userAgent: 'vitest' };

async function reset() {
  await pool.query('truncate table users cascade');
  await pool.query('truncate table rate_limits');
}

async function makeTrader(email = 'trader@example.com', environment = 'live') {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1995-04-12',
      acceptedTerms: true,
      displayName: 'Trader',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');

  const account = await repo.insertTradingAccount(result.user.id, {
    name: `Account ${email}`,
    broker: 'Manual',
    currency: 'INR',
    startingBalanceMinor: 10000000n, // ₹100,000
    riskPerTradeBps: 100,
    environment,
  });

  return { user: result.user, account };
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await pool.end();
});

describe('trade lifecycle', () => {
  it('moves planned -> open -> closed as executions arrive', async () => {
    const { user, account } = await makeTrader();

    const created = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'INFY',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!created.ok) throw new Error('trade setup failed');
    expect(created.value.status).toBe('planned');

    const opened = await trading.addExecution(user.id, created.value.id, {
      side: 'buy',
      quantity: '100',
      price: '250',
      fee: '0',
      executedAt: '2026-09-01T10:00:00Z',
    });
    expect(opened.ok && opened.value.trade.status).toBe('open');

    const closed = await trading.addExecution(user.id, created.value.id, {
      side: 'sell',
      quantity: '100',
      price: '275',
      fee: '0',
      executedAt: '2026-09-02T10:00:00Z',
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.value.trade.status).toBe('closed');
    expect(closed.value.trade.realizedPnlMinor).toBe(250000n);
    expect(closed.value.trade.closedAt).not.toBeNull();
  });

  it('derives aggregates from executions rather than user input', async () => {
    const { user, account } = await makeTrader();

    const created = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'TCS',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!created.ok) throw new Error('setup failed');

    // Scale in at two prices, then out at one.
    for (const e of [
      { side: 'buy' as const, quantity: '100', price: '200' },
      { side: 'buy' as const, quantity: '100', price: '300' },
      { side: 'sell' as const, quantity: '200', price: '275' },
    ]) {
      await trading.addExecution(user.id, created.value.id, {
        ...e,
        fee: '0',
        executedAt: '2026-09-01T10:00:00Z',
      });
    }

    const trade = await repo.findTrade(user.id, created.value.id);
    expect(trade?.averageEntryPrice).toBe('250.00000000');
    expect(trade?.averageExitPrice).toBe('275.00000000');
    expect(trade?.realizedPnlMinor).toBe(500000n);
  });

  it('recomputes when an execution is deleted', async () => {
    const { user, account } = await makeTrader();

    const created = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'HDFC',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!created.ok) throw new Error('setup failed');

    await trading.addExecution(user.id, created.value.id, {
      side: 'buy',
      quantity: '100',
      price: '250',
      fee: '0',
      executedAt: '2026-09-01T10:00:00Z',
    });
    const sell = await trading.addExecution(user.id, created.value.id, {
      side: 'sell',
      quantity: '100',
      price: '275',
      fee: '0',
      executedAt: '2026-09-02T10:00:00Z',
    });
    if (!sell.ok) throw new Error('setup failed');

    const after = await trading.removeExecution(user.id, sell.value.execution.id);

    expect(after.ok).toBe(true);
    if (!after.ok) return;
    // Back to an open position with nothing realised.
    expect(after.value.status).toBe('open');
    expect(after.value.realizedPnlMinor).toBe(0n);
    expect(after.value.closedAt).toBeNull();
  });

  it('computes r-multiple from the planned risk', async () => {
    const { user, account } = await makeTrader();

    const created = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'WIPRO',
      assetClass: 'equity',
      direction: 'long',
      plannedRisk: '1000.00',
    });
    if (!created.ok) throw new Error('setup failed');

    await trading.addExecution(user.id, created.value.id, {
      side: 'buy',
      quantity: '100',
      price: '100',
      fee: '0',
      executedAt: '2026-09-01T10:00:00Z',
    });
    const closed = await trading.addExecution(user.id, created.value.id, {
      side: 'sell',
      quantity: '100',
      price: '125',
      fee: '0',
      executedAt: '2026-09-02T10:00:00Z',
    });

    // Made ₹2,500 having risked ₹1,000 → 2.5R.
    expect(closed.ok && closed.value.trade.rMultiple).toBe('2.50000000');
  });
});

describe('validation', () => {
  it('rejects a non-positive quantity', async () => {
    const { user, account } = await makeTrader();
    const created = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'X',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!created.ok) throw new Error('setup failed');

    for (const quantity of ['0', '-5']) {
      const result = await trading.addExecution(user.id, created.value.id, {
        side: 'buy',
        quantity,
        price: '100',
        fee: '0',
        executedAt: '2026-09-01T10:00:00Z',
      });
      expect(result.ok, `${quantity} must be rejected`).toBe(false);
    }
  });

  it('rejects a negative fee', async () => {
    const { user, account } = await makeTrader();
    const created = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'X',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!created.ok) throw new Error('setup failed');

    const result = await trading.addExecution(user.id, created.value.id, {
      side: 'buy',
      quantity: '1',
      price: '100',
      fee: '-10',
      executedAt: '2026-09-01T10:00:00Z',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid execution timestamp', async () => {
    const { user, account } = await makeTrader();
    const created = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'X',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!created.ok) throw new Error('setup failed');

    const result = await trading.addExecution(user.id, created.value.id, {
      side: 'buy',
      quantity: '1',
      price: '100',
      fee: '0',
      executedAt: 'not-a-date',
    });
    expect(result.ok).toBe(false);
  });
});

describe('environment labelling', () => {
  it('keeps paper and live accounts separate', async () => {
    const live = await makeTrader('live@example.com', 'live');
    const paper = await repo.insertTradingAccount(live.user.id, {
      name: 'Paper account',
      broker: null,
      currency: 'INR',
      startingBalanceMinor: 10000000n,
      riskPerTradeBps: 100,
      environment: 'paper',
    });

    expect(live.account.environment).toBe('live');
    expect(paper.environment).toBe('paper');

    // Performance is per-account, so paper results never dilute live ones.
    const livePerf = await trading.accountPerformance(live.user.id, live.account.id);
    const paperPerf = await trading.accountPerformance(live.user.id, paper.id);

    expect(livePerf?.account.environment).toBe('live');
    expect(paperPerf?.account.environment).toBe('paper');
  });

  it('refuses an unknown environment at the database level', async () => {
    const { user } = await makeTrader();
    await expect(
      repo.insertTradingAccount(user.id, {
        name: 'Bogus',
        broker: null,
        currency: 'INR',
        startingBalanceMinor: 0n,
        riskPerTradeBps: 100,
        environment: 'simulated-live',
      }),
    ).rejects.toThrow();
  });
});

describe('performance statistics', () => {
  it('aggregates only closed trades', async () => {
    const { user, account } = await makeTrader();

    // Two closed winners and one still open.
    for (const [symbol, exit] of [
      ['A', '275'],
      ['B', '300'],
    ] as const) {
      const created = await trading.createTrade(user.id, {
        tradingAccountId: account.id,
        symbol,
        assetClass: 'equity',
        direction: 'long',
      });
      if (!created.ok) throw new Error('setup failed');

      await trading.addExecution(user.id, created.value.id, {
        side: 'buy',
        quantity: '100',
        price: '250',
        fee: '0',
        executedAt: '2026-09-01T10:00:00Z',
      });
      await trading.addExecution(user.id, created.value.id, {
        side: 'sell',
        quantity: '100',
        price: exit,
        fee: '0',
        executedAt: '2026-09-02T10:00:00Z',
      });
    }

    const open = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'C',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!open.ok) throw new Error('setup failed');
    await trading.addExecution(user.id, open.value.id, {
      side: 'buy',
      quantity: '100',
      price: '250',
      fee: '0',
      executedAt: '2026-09-03T10:00:00Z',
    });

    const perf = await trading.accountPerformance(user.id, account.id);

    expect(perf?.stats.trades).toBe(2);
    expect(perf?.stats.wins).toBe(2);
    expect(perf?.stats.netPnlMinor).toBe(750000n); // 2500 + 5000
    // Starting balance plus both wins.
    expect(perf?.curve.points.at(-1)).toBe(10750000n);
  });
});

describe('trading isolation', () => {
  it('cannot read or write another account trades', async () => {
    const alice = await makeTrader('alice@example.com');
    const bob = await makeTrader('bob@example.com');

    const bobTrade = await trading.createTrade(bob.user.id, {
      tradingAccountId: bob.account.id,
      symbol: 'SECRET',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!bobTrade.ok) throw new Error('setup failed');

    expect(await repo.findTrade(alice.user.id, bobTrade.value.id)).toBeUndefined();
    expect(await repo.findTradingAccount(alice.user.id, bob.account.id)).toBeUndefined();
    expect(await repo.listTrades(alice.user.id)).toEqual([]);

    // Cannot add an execution to Bob's trade.
    const injected = await trading.addExecution(alice.user.id, bobTrade.value.id, {
      side: 'buy',
      quantity: '1',
      price: '1',
      fee: '0',
      executedAt: '2026-09-01T10:00:00Z',
    });
    expect(injected.ok).toBe(false);

    // Cannot create a trade in Bob's account.
    const hijack = await trading.createTrade(alice.user.id, {
      tradingAccountId: bob.account.id,
      symbol: 'HIJACK',
      assetClass: 'equity',
      direction: 'long',
    });
    expect(hijack.ok).toBe(false);

    // Cannot delete Bob's trade, or read his performance.
    expect(await repo.deleteTrade(alice.user.id, bobTrade.value.id)).toBe(false);
    expect(await trading.accountPerformance(alice.user.id, bob.account.id)).toBeUndefined();
  });

  it('cannot attach another account strategy', async () => {
    const alice = await makeTrader('alice@example.com');
    const bob = await makeTrader('bob@example.com');

    const bobStrategy = await repo.insertStrategy(bob.user.id, {
      name: 'Bob breakout',
      description: null,
      rules: null,
    });

    const result = await trading.createTrade(alice.user.id, {
      tradingAccountId: alice.account.id,
      symbol: 'X',
      assetClass: 'equity',
      direction: 'long',
      strategyId: bobStrategy.id,
    });

    expect(result.ok).toBe(false);
  });
});
