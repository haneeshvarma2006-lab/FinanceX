import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import * as marketsRepo from '@/modules/markets/repository';
import { checkAlerts } from '@/modules/markets/alert-service';
import { listNotifications } from '@/modules/productivity/repository';

/**
 * Budgets, recurring bills and price alerts against the real database:
 * one budget per category, a bill paid once per due date with its expense
 * recorded, one reminder per due date, and an alert that fires exactly once.
 */

const ctx = { ip: '203.0.113.96', userAgent: 'vitest' };

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
      displayName: 'Saver',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

async function account(userId: string) {
  return financeRepo.insertAccount(userId, {
    name: 'HDFC',
    kind: 'bank',
    currency: 'INR',
    openingBalanceMinor: 0n,
  });
}

describe('budgets', () => {
  beforeEach(reset);

  it('makes the category if needed, and setting it again changes the limit', async () => {
    const user = await makeUser('budget@example.com');
    const first = await finance.setMonthlyBudget(
      user.id,
      { category: 'food', amount: '8000' },
      '2026-10-18',
      'INR',
    );
    expect(first.ok).toBe(true);
    const again = await finance.setMonthlyBudget(
      user.id,
      { category: 'Food', amount: '9500.50' },
      '2026-10-20',
      'INR',
    );
    expect(again.ok).toBe(true);

    const budgets = await financeRepo.listBudgets(user.id);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]!.amountMinor).toBe(950050n);
    expect(budgets[0]!.startsOn).toBe('2026-10-01');
    const categories = await financeRepo.listCategories(user.id);
    expect(categories.map((c) => c.name)).toEqual(['food']);
  });

  it('refuses a limit that is not a positive amount', async () => {
    const user = await makeUser('budget2@example.com');
    const zero = await finance.setMonthlyBudget(
      user.id,
      { category: 'Fuel', amount: '0' },
      '2026-10-18',
      'INR',
    );
    expect(zero.ok).toBe(false);
    const blank = await finance.setMonthlyBudget(
      user.id,
      { category: '  ', amount: '100' },
      '2026-10-18',
      'INR',
    );
    expect(blank.ok).toBe(false);
  });
});

describe('recurring bills', () => {
  beforeEach(reset);

  it('Paid records the expense and moves to the next due date, once', async () => {
    const user = await makeUser('bills@example.com');
    const acct = await account(user.id);
    const added = await finance.addRecurring(
      user.id,
      {
        name: 'Netflix',
        amount: '649',
        cadence: 'monthly',
        nextDueOn: '2026-10-20',
        accountId: acct.id,
      },
      'INR',
    );
    if (!added.ok) throw new Error('add failed');

    const paid = await finance.payRecurring(user.id, added.value.id, '2026-10-19');
    expect(paid).toEqual({ ok: true, value: { recorded: true, nextDueOn: '2026-11-20' } });

    const txs = await financeRepo.listTransactions(user.id, { limit: 10 });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      description: 'Netflix',
      amountMinor: -64900n,
      occurredOn: '2026-10-19',
    });

    const bill = await financeRepo.findSubscription(user.id, added.value.id);
    expect(bill?.nextDueOn).toBe('2026-11-20');
    expect(bill?.lastChargedOn).toBe('2026-10-19');
  });

  it('without an account, Paid only moves the date', async () => {
    const user = await makeUser('bills2@example.com');
    const added = await finance.addRecurring(
      user.id,
      { name: 'Rent', amount: '25000', cadence: 'monthly', nextDueOn: '2026-10-31' },
      'INR',
    );
    if (!added.ok) throw new Error('add failed');
    const paid = await finance.payRecurring(user.id, added.value.id, '2026-10-30');
    expect(paid).toEqual({ ok: true, value: { recorded: false, nextDueOn: '2026-11-30' } });
    expect(await financeRepo.listTransactions(user.id, { limit: 5 })).toHaveLength(0);
  });

  it('another user cannot pay or see your bill', async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const added = await finance.addRecurring(
      owner.id,
      { name: 'Gym', amount: '1500', cadence: 'monthly', nextDueOn: '2026-10-20' },
      'INR',
    );
    if (!added.ok) throw new Error('add failed');
    expect((await finance.payRecurring(other.id, added.value.id, '2026-10-19')).ok).toBe(false);
    expect(await financeRepo.findSubscription(other.id, added.value.id)).toBeUndefined();
  });

  it('reminds once per due date, three days ahead', async () => {
    const user = await makeUser('remind@example.com');
    await finance.addRecurring(
      user.id,
      { name: 'Phone', amount: '299', cadence: 'monthly', nextDueOn: '2026-10-21' },
      'INR',
    );
    await finance.addRecurring(
      user.id,
      { name: 'Insurance', amount: '12000', cadence: 'yearly', nextDueOn: '2027-03-01' },
      'INR',
    );
    expect(await finance.remindDueBills(user.id, '2026-10-17')).toBe(0);
    expect(await finance.remindDueBills(user.id, '2026-10-18')).toBe(1);
    expect(await finance.remindDueBills(user.id, '2026-10-19')).toBe(0);

    const notes = await listNotifications(user.id, { limit: 10 });
    expect(notes.map((n) => n.title)).toEqual(['Phone: due in 3 days']);
  });
});

describe('price alerts', () => {
  beforeEach(reset);

  it('fires once when the price crosses, with a notification', async () => {
    const user = await makeUser('alerts@example.com');
    const alert = await marketsRepo.insertAlert(user.id, {
      instrumentId: 'bn:BTCUSDT',
      direction: 'above',
      target: '70000',
    });

    expect(await checkAlerts(user.id, new Map([['bn:BTCUSDT', 69999.99]]))).toEqual([]);

    const fired = await checkAlerts(user.id, new Map([['bn:BTCUSDT', 70012.5]]));
    expect(fired).toHaveLength(1);
    expect(fired[0]!.title).toMatch(/^Bitcoin is above 70,000/);

    // Fired alerts are done until set again.
    expect(await checkAlerts(user.id, new Map([['bn:BTCUSDT', 71000]]))).toEqual([]);
    const [row] = await marketsRepo.listAlerts(user.id);
    expect(row).toMatchObject({ id: alert.id, active: false });
    expect(Number(row!.firedPrice)).toBe(70012.5);

    const notes = await listNotifications(user.id, { limit: 10 });
    expect(notes.filter((n) => n.kind === 'price_alert')).toHaveLength(1);

    expect(await marketsRepo.rearmAlert(user.id, alert.id)).toBe(true);
    expect(await checkAlerts(user.id, new Map([['bn:BTCUSDT', 70500]]))).toHaveLength(1);
  });

  it('never touches another user’s alerts', async () => {
    const owner = await makeUser('a1@example.com');
    const other = await makeUser('a2@example.com');
    const alert = await marketsRepo.insertAlert(owner.id, {
      instrumentId: 'bn:ETHUSDT',
      direction: 'below',
      target: '3000',
    });
    expect(await checkAlerts(other.id, new Map([['bn:ETHUSDT', 2500]]))).toEqual([]);
    expect(await marketsRepo.deleteAlert(other.id, alert.id)).toBe(false);
    expect((await marketsRepo.listActiveAlerts(owner.id))[0]?.id).toBe(alert.id);
  });
});
