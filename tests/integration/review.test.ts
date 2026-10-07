import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import * as productivity from '@/modules/productivity/service';
import { taskSchema } from '@/modules/productivity/validators';
import * as rulesRepo from '@/modules/rules/repository';
import * as tradingRepo from '@/modules/trading/repository';
import * as trading from '@/modules/trading/service';
import { noteSchema as tradeNoteSchema } from '@/modules/trading/validators';
import { RULE_TEMPLATES } from '@/modules/review/analysis';
import { reviewWeek } from '@/modules/review/service';
import { buildWealth } from '@/modules/dashboard/wealth';

/**
 * The weekly review and the wealth dashboard, from real rows: the week is
 * the user's own Monday to Sunday, money stays in one currency, and the one
 * thing to fix is the costliest pattern actually in the records.
 */

const ctx = { ip: '203.0.113.93', userAgent: 'vitest' };
const WEEK = { start: '2026-09-28', end: '2026-10-04' };

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits');
}

async function makeUser(email: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Reviewer',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

async function losingTrade(userId: string, accountId: string, day: string, feeling?: string) {
  const trade = await trading.createTrade(userId, {
    tradingAccountId: accountId,
    symbol: 'NIFTY',
    assetClass: 'equity',
    direction: 'long',
  });
  if (!trade.ok) throw new Error('trade setup failed');
  for (const [side, price, hour] of [
    ['buy', '100', '04'],
    ['sell', '90', '05'],
  ] as const) {
    await trading.addExecution(userId, trade.value.id, {
      side,
      quantity: '10',
      price,
      fee: '0',
      executedAt: `${day}T${hour}:00:00Z`,
    });
  }
  if (feeling) {
    await trading.addNote(
      userId,
      trade.value.id,
      tradeNoteSchema.parse({ kind: 'psychology', body: 'Chased it.', emotionTag: feeling }),
    );
  }
}

describe('weekly review', () => {
  beforeEach(reset);
  afterAll(reset);

  it('counts the week from the records and names the costliest pattern', async () => {
    const user = await makeUser('review@example.com');

    const tradingAccount = await tradingRepo.insertTradingAccount(user.id, {
      name: 'Main',
      broker: null,
      currency: 'INR',
      startingBalanceMinor: 0n,
      riskPerTradeBps: 100,
      environment: 'live',
    });
    await losingTrade(user.id, tradingAccount.id, '2026-09-29', 'fomo');
    await losingTrade(user.id, tradingAccount.id, '2026-09-29');
    await losingTrade(user.id, tradingAccount.id, '2026-09-29');
    // Closed the week before: not this week's.
    await losingTrade(user.id, tradingAccount.id, '2026-09-20');

    const bank = await financeRepo.insertAccount(user.id, {
      name: 'Bank',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 5000000n,
    });
    for (const [kind, amount, day] of [
      ['income', '10000', '2026-09-28'],
      ['expense', '12000', '2026-09-30'],
      ['expense', '999', '2026-10-06'], // next week
    ] as const) {
      const r = await finance.createTransaction(user.id, {
        accountId: bank.id,
        occurredOn: day,
        amount,
        kind,
        description: kind,
      });
      if (!r.ok) throw new Error('transaction setup failed');
    }

    for (const title of ['a', 'b', 'c', 'd']) {
      const t = await productivity.createTask(
        user.id,
        taskSchema.parse({ title, scheduledFor: '2026-09-30' }),
      );
      if (!t.ok) throw new Error('task setup failed');
      if (title === 'a') await productivity.completeTask(user.id, t.value.id);
    }

    const { facts, review } = await reviewWeek(user, WEEK, '2026-10-05');

    expect(facts.trading).toMatchObject({
      closed: 3,
      wins: 0,
      netPnlMinor: -30000n,
      worstStreak: { count: 3, day: '2026-09-29' },
    });
    expect(facts.trading?.costly).toEqual([{ emotion: 'fomo', trades: 1, netPnlMinor: -10000n }]);
    expect(facts.money).toMatchObject({ incomeMinor: 1000000n, expenseMinor: 1200000n });
    expect(facts.tasks).toMatchObject({ planned: 4, plannedDone: 1 });

    expect(review.mistake?.key).toBe('losing-streak');
    // The starter rule fires at 3 losses; "after 2" is stricter, so it is still offered.
    expect(review.mistake?.suggestion).toMatchObject({
      kind: 'rule',
      template: 'reduce-risk-after-losses',
    });

    const template = RULE_TEMPLATES['reduce-risk-after-losses'];
    await rulesRepo.insertRule(user.id, {
      name: template.name,
      triggerType: template.triggerType,
      triggerConfig: { ...template.triggerConfig },
      actionType: template.actionType,
      actionConfig: { ...template.actionConfig },
    });
    const again = await reviewWeek(user, WEEK, '2026-10-05');
    expect(again.review.mistake?.suggestion.kind).toBe('covered');
  });

  it("never counts another user's records", async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const bank = await financeRepo.insertAccount(owner.id, {
      name: 'Bank',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });
    await finance.createTransaction(owner.id, {
      accountId: bank.id,
      occurredOn: '2026-09-30',
      amount: '500',
      kind: 'expense',
      description: 'Lunch',
    });

    const { facts, review } = await reviewWeek(other, WEEK, '2026-10-05');
    expect(facts.money).toBeNull();
    expect(facts.trading).toBeNull();
    expect(review.mistake).toBeNull();
  });
});

describe('wealth', () => {
  beforeEach(reset);

  it('derives net worth and its monthly trend from the ledger, in one currency', async () => {
    const user = await makeUser('wealth@example.com');
    const bank = await financeRepo.insertAccount(user.id, {
      name: 'Bank',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 10000000n, // ₹1,00,000
    });
    // A dollar account must never be added to rupees.
    await financeRepo.insertAccount(user.id, {
      name: 'US broker',
      kind: 'broker',
      currency: 'USD',
      openingBalanceMinor: 50000n,
    });
    for (const [kind, amount, day] of [
      ['income', '50000', '2026-08-01'],
      ['expense', '20000', '2026-09-10'],
      ['income', '40000', '2026-10-01'],
      ['expense', '10000', '2026-10-03'],
    ] as const) {
      await finance.createTransaction(user.id, {
        accountId: bank.id,
        occurredOn: day,
        amount,
        kind,
        description: kind,
      });
    }

    const wealth = await buildWealth(user, '2026-10-05');
    expect(wealth.currency).toBe('INR');
    expect(wealth.netWorth?.minor).toBe(16000000n);
    expect(wealth.netWorth?.trend.map((p) => [p.month, p.minor])).toEqual([
      ['2026-08', 15000000n],
      ['2026-09', 13000000n],
      ['2026-10', 16000000n],
    ]);
    // October so far: kept 30,000 of 40,000.
    expect(wealth.savingsRate).toMatchObject({ percent: 75 });
    expect(wealth.goals).toBeNull();
    expect(wealth.trading).toBeNull();
  });
});
