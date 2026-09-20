import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { sum } from '@/lib/money';

const ctx = { ip: '203.0.113.40', userAgent: 'vitest' };

async function reset() {
  await pool.query('truncate table users cascade');
  await pool.query('truncate table rate_limits');
}

async function makeUser(email: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1995-04-12',
      acceptedTerms: true,
      displayName: email.split('@')[0]!,
    }),
    ctx,
  );
  if (!result.ok) throw new Error(`setup failed for ${email}`);
  return result.user;
}

async function setup() {
  const user = await makeUser('owner@example.com');
  const current = await repo.insertAccount(user.id, {
    name: 'Current',
    kind: 'bank',
    currency: 'INR',
    openingBalanceMinor: 0n,
  });
  const savings = await repo.insertAccount(user.id, {
    name: 'Savings',
    kind: 'bank',
    currency: 'INR',
    openingBalanceMinor: 0n,
  });
  const groceries = await repo.insertCategory(user.id, { name: 'Groceries', kind: 'expense' });
  const salary = await repo.insertCategory(user.id, { name: 'Salary', kind: 'income' });

  return { user, current, savings, groceries, salary };
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await pool.end();
});

describe('transaction amounts', () => {
  it('stores an expense as a negative amount and income as positive', async () => {
    const { user, current, groceries, salary } = await setup();

    const expense = await finance.createTransaction(user.id, {
      accountId: current.id,
      categoryId: groceries.id,
      occurredOn: '2026-09-01',
      amount: '1234.56',
      kind: 'expense',
      description: 'Weekly shop',
    });
    const income = await finance.createTransaction(user.id, {
      accountId: current.id,
      categoryId: salary.id,
      occurredOn: '2026-09-01',
      amount: '85000.00',
      kind: 'income',
      description: 'Salary',
    });

    expect(expense.ok && expense.value.amountMinor).toBe(-123456n);
    expect(income.ok && income.value.amountMinor).toBe(8500000n);
  });

  it('refuses a zero or negative amount', async () => {
    const { user, current } = await setup();

    for (const amount of ['0', '0.00', '-50']) {
      const result = await finance.createTransaction(user.id, {
        accountId: current.id,
        occurredOn: '2026-09-01',
        amount,
        kind: 'expense',
        description: 'Bad',
      });
      expect(result.ok, `${amount} must be rejected`).toBe(false);
    }
  });

  it('refuses an amount with more precision than the currency has', async () => {
    const { user, current } = await setup();

    const result = await finance.createTransaction(user.id, {
      accountId: current.id,
      occurredOn: '2026-09-01',
      amount: '10.567',
      kind: 'expense',
      description: 'Too precise',
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid') {
      expect(result.error.field).toBe('amount');
    }
  });

  it('refuses a category of the wrong kind', async () => {
    const { user, current, salary } = await setup();

    const result = await finance.createTransaction(user.id, {
      accountId: current.id,
      categoryId: salary.id, // an income category on an expense
      occurredOn: '2026-09-01',
      amount: '100',
      kind: 'expense',
      description: 'Mismatched',
    });

    expect(result.ok).toBe(false);
  });
});

describe('transfers', () => {
  it('writes two balanced legs that sum to zero', async () => {
    const { user, current, savings } = await setup();

    const result = await finance.createTransfer(user.id, {
      fromAccountId: current.id,
      toAccountId: savings.id,
      occurredOn: '2026-09-02',
      amount: '10000.00',
      description: 'To savings',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.from.amountMinor).toBe(-1000000n);
    expect(result.value.to.amountMinor).toBe(1000000n);
    expect(sum([result.value.from.amountMinor, result.value.to.amountMinor])).toBe(0n);
    expect(result.value.from.transferGroupId).toBe(result.value.to.transferGroupId);
  });

  it('is EXCLUDED from income and expense totals', async () => {
    const { user, current, savings, groceries, salary } = await setup();

    await finance.createTransaction(user.id, {
      accountId: current.id,
      categoryId: salary.id,
      occurredOn: '2026-09-01',
      amount: '85000.00',
      kind: 'income',
      description: 'Salary',
    });
    await finance.createTransaction(user.id, {
      accountId: current.id,
      categoryId: groceries.id,
      occurredOn: '2026-09-03',
      amount: '5000.00',
      kind: 'expense',
      description: 'Shop',
    });
    await finance.createTransfer(user.id, {
      fromAccountId: current.id,
      toAccountId: savings.id,
      occurredOn: '2026-09-04',
      amount: '20000.00',
      description: 'To savings',
    });

    const totals = await repo.periodTotals(user.id, '2026-09-01', '2026-09-30');

    // Without the transfer filter these would read 105000 and 25000.
    expect(totals.incomeMinor).toBe(8500000n);
    expect(totals.expenseMinor).toBe(500000n);
  });

  it('refuses a transfer between different currencies', async () => {
    const { user, current } = await setup();
    const usd = await repo.insertAccount(user.id, {
      name: 'USD account',
      kind: 'bank',
      currency: 'USD',
      openingBalanceMinor: 0n,
    });

    const result = await finance.createTransfer(user.id, {
      fromAccountId: current.id,
      toAccountId: usd.id,
      occurredOn: '2026-09-02',
      amount: '100.00',
      description: 'Cross currency',
    });

    expect(result.ok).toBe(false);
  });

  it('deletes both legs when either is deleted', async () => {
    const { user, current, savings } = await setup();

    const transfer = await finance.createTransfer(user.id, {
      fromAccountId: current.id,
      toAccountId: savings.id,
      occurredOn: '2026-09-02',
      amount: '500.00',
      description: 'Move',
    });
    if (!transfer.ok) throw new Error('setup failed');

    await finance.deleteTransaction(user.id, transfer.value.from.id);

    // Deleting one leg must not leave the ledger unbalanced.
    expect(await repo.countTransactions(user.id)).toBe(0);
  });
});

describe('derived balances', () => {
  it('equals opening balance plus the ledger', async () => {
    const user = await makeUser('balances@example.com');
    const account = await repo.insertAccount(user.id, {
      name: 'Wallet',
      kind: 'cash',
      currency: 'INR',
      openingBalanceMinor: 100000n, // ₹1,000
    });

    await finance.createTransaction(user.id, {
      accountId: account.id,
      occurredOn: '2026-09-01',
      amount: '250.50',
      kind: 'expense',
      description: 'Lunch',
    });
    await finance.createTransaction(user.id, {
      accountId: account.id,
      occurredOn: '2026-09-02',
      amount: '500.00',
      kind: 'income',
      description: 'Refund',
    });

    const balances = await repo.accountBalances(user.id);
    // 100000 - 25050 + 50000
    expect(balances.get(account.id)).toBe(124950n);
  });

  it('reports the opening balance for an account with no transactions', async () => {
    const user = await makeUser('empty@example.com');
    const account = await repo.insertAccount(user.id, {
      name: 'Untouched',
      kind: 'cash',
      currency: 'INR',
      openingBalanceMinor: 7500n,
    });

    expect((await repo.accountBalances(user.id)).get(account.id)).toBe(7500n);
  });

  it('stays exact across many small amounts', async () => {
    const user = await makeUser('precision@example.com');
    const account = await repo.insertAccount(user.id, {
      name: 'Precision',
      kind: 'cash',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });

    // 100 x ₹0.10. Floating point would drift here.
    for (let i = 0; i < 100; i += 1) {
      await finance.createTransaction(user.id, {
        accountId: account.id,
        occurredOn: '2026-09-01',
        amount: '0.10',
        kind: 'income',
        description: `Drip ${i}`,
      });
    }

    expect((await repo.accountBalances(user.id)).get(account.id)).toBe(1000n);
  });
});

describe('budgets', () => {
  it('computes progress and flags an overspend', async () => {
    const { user, current, groceries } = await setup();

    await repo.insertBudget(user.id, {
      categoryId: groceries.id,
      period: 'monthly',
      amountMinor: 500000n, // ₹5,000
      currency: 'INR',
      startsOn: '2026-09-01',
    });

    await finance.createTransaction(user.id, {
      accountId: current.id,
      categoryId: groceries.id,
      occurredOn: '2026-09-10',
      amount: '5500.00',
      kind: 'expense',
      description: 'Big shop',
    });

    const progress = await finance.budgetProgress(user.id, '2026-09-01', '2026-09-30');

    expect(progress).toHaveLength(1);
    expect(progress[0]?.spentMinor).toBe(550000n);
    expect(progress[0]?.remainingMinor).toBe(-50000n);
    expect(progress[0]?.overBudget).toBe(true);
  });

  it('excludes spend outside the period', async () => {
    const { user, current, groceries } = await setup();

    await repo.insertBudget(user.id, {
      categoryId: groceries.id,
      period: 'monthly',
      amountMinor: 500000n,
      currency: 'INR',
      startsOn: '2026-09-01',
    });

    await finance.createTransaction(user.id, {
      accountId: current.id,
      categoryId: groceries.id,
      occurredOn: '2026-08-31',
      amount: '9000.00',
      kind: 'expense',
      description: 'Last month',
    });

    const progress = await finance.budgetProgress(user.id, '2026-09-01', '2026-09-30');
    expect(progress[0]?.spentMinor).toBe(0n);
    expect(progress[0]?.overBudget).toBe(false);
  });
});

describe('revision history', () => {
  it('records create, update and delete with before and after', async () => {
    const { user, current } = await setup();

    const created = await finance.createTransaction(user.id, {
      accountId: current.id,
      occurredOn: '2026-09-01',
      amount: '100.00',
      kind: 'expense',
      description: 'Original',
    });
    if (!created.ok) throw new Error('setup failed');

    await finance.updateTransaction(user.id, created.value.id, {
      accountId: current.id,
      occurredOn: '2026-09-01',
      amount: '150.00',
      kind: 'expense',
      description: 'Corrected',
    });
    await finance.deleteTransaction(user.id, created.value.id);

    const revisions = await repo.listRevisions(user.id, 'transaction', created.value.id);
    expect(revisions.map((r) => r.action)).toEqual(['deleted', 'updated', 'created']);

    const updated = revisions.find((r) => r.action === 'updated');
    expect(updated?.before).toMatchObject({ description: 'Original', amountMinor: '-10000' });
    expect(updated?.after).toMatchObject({ description: 'Corrected', amountMinor: '-15000' });
  });
});
