import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { statementImportSchema } from '@/modules/finance/validators';

/**
 * The full ledger against the real database: every filter, search that
 * treats % and _ as plain characters, totals kept apart by currency, one
 * person's ledger never showing another's, and payments that come round
 * monthly turned into bills.
 */

const ctx = { ip: '203.0.113.98', userAgent: 'vitest' };

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
      displayName: 'Ledger Tester',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

async function account(userId: string, name = 'Savings', currency = 'INR') {
  return repo.insertAccount(userId, { name, kind: 'bank', currency, openingBalanceMinor: 0n });
}

async function load(userId: string, accountId: string, rows: [string, string, string, string?][]) {
  const result = await finance.importStatement(
    userId,
    statementImportSchema.parse({
      accountId,
      rows: rows.map(([occurredOn, amountMinor, description, category]) => ({
        occurredOn,
        amountMinor,
        description,
        ...(category ? { category } : {}),
      })),
    }),
  );
  if (!result.ok) throw new Error(result.error.message);
}

describe('the ledger', () => {
  beforeEach(reset);

  it('filters by words, month, category, account and direction', async () => {
    const user = await makeUser('ledger@example.com');
    const savings = await account(user.id);
    const card = await account(user.id, 'Card');
    await load(user.id, savings.id, [
      ['2026-09-01', '-48600', 'Swiggy', 'Food'],
      ['2026-09-02', '-200000', 'Hpcl Petrol Pump', 'Fuel'],
      ['2026-09-03', '8500000', 'Example Tech Salary'],
      ['2026-10-01', '-62000', 'Swiggy', 'Food'],
      ['2026-10-02', '-1500000', 'Ramesh Babu'],
    ]);
    await load(user.id, card.id, [['2026-10-05', '-99900', 'Swiggy One', 'Food']]);

    const names = async (filter: Parameters<typeof repo.searchLedger>[1]) =>
      (await repo.searchLedger(user.id, filter, 50)).map((t) => `${t.occurredOn} ${t.description}`);

    expect(await names({ search: 'swig' })).toEqual([
      '2026-10-05 Swiggy One',
      '2026-10-01 Swiggy',
      '2026-09-01 Swiggy',
    ]);
    expect(await names({ from: '2026-09-01', to: '2026-09-30', direction: 'out' })).toEqual([
      '2026-09-02 Hpcl Petrol Pump',
      '2026-09-01 Swiggy',
    ]);
    expect(await names({ direction: 'in' })).toEqual(['2026-09-03 Example Tech Salary']);
    expect(await names({ categoryId: 'none' })).toEqual(['2026-10-02 Ramesh Babu']);
    expect(await names({ accountId: card.id })).toEqual(['2026-10-05 Swiggy One']);
    const food = (await repo.listCategories(user.id)).find((c) => c.name === 'Food')!;
    expect(await names({ categoryId: food.id, from: '2026-10-01', to: '2026-10-31' })).toEqual([
      '2026-10-05 Swiggy One',
      '2026-10-01 Swiggy',
    ]);

    // Paging.
    expect(await repo.searchLedger(user.id, {}, 2, 4)).toHaveLength(2);

    // Totals for exactly what is filtered.
    expect(await repo.ledgerTotals(user.id, { search: 'swig' })).toEqual({
      count: 3,
      totals: [{ currency: 'INR', outMinor: 210500n, inMinor: 0n }],
    });
  });

  it('searches for % and _ as the characters themselves', async () => {
    const user = await makeUser('wild@example.com');
    const savings = await account(user.id);
    await load(user.id, savings.id, [
      ['2026-09-01', '-100', '50% off sale'],
      ['2026-09-02', '-200', 'Plain shop'],
      ['2026-09-03', '-300', 'snake_case cafe'],
    ]);
    const hits = async (search: string) =>
      (await repo.searchLedger(user.id, { search }, 50)).map((t) => t.description);
    expect(await hits('%')).toEqual(['50% off sale']);
    expect(await hits('_')).toEqual(['snake_case cafe']);
    expect(await hits("'; drop table transactions; --")).toEqual([]);
  });

  it('keeps currencies apart and never shows another account holder', async () => {
    const user = await makeUser('mine@example.com');
    const other = await makeUser('theirs@example.com');
    await load(user.id, (await account(user.id)).id, [['2026-09-01', '-1000', 'Tea']]);
    await load(user.id, (await account(user.id, 'Dollars', 'USD')).id, [
      ['2026-09-01', '-500', 'Coffee'],
    ]);
    await load(other.id, (await account(other.id)).id, [['2026-09-01', '-7000', 'Tea']]);

    const totals = await repo.ledgerTotals(user.id, {});
    expect(totals.count).toBe(2);
    expect(totals.totals.sort((a, b) => a.currency.localeCompare(b.currency))).toEqual([
      { currency: 'INR', outMinor: 1000n, inMinor: 0n },
      { currency: 'USD', outMinor: 500n, inMinor: 0n },
    ]);
    expect(
      (await repo.searchLedger(other.id, { search: 'tea' }, 50)).map((t) => t.amountMinor),
    ).toEqual([-7000n]);
  });
});

describe('changing one payment’s category', () => {
  beforeEach(reset);

  it('moves it, makes the category if needed, and clears it again', async () => {
    const user = await makeUser('recat@example.com');
    await load(user.id, (await account(user.id)).id, [
      ['2026-09-01', '-48600', 'Swiggy'],
      ['2026-09-02', '100000', 'Refund'],
    ]);
    const [refund, swiggy] = await repo.searchLedger(user.id, {}, 10);

    const moved = await finance.setTransactionCategory(user.id, swiggy!.id, 'Food');
    expect(moved.ok).toBe(true);
    const food = (await repo.listCategories(user.id)).find((c) => c.name === 'Food')!;
    expect((await repo.findTransaction(user.id, swiggy!.id))?.categoryId).toBe(food.id);

    expect((await finance.setTransactionCategory(user.id, swiggy!.id, null)).ok).toBe(true);
    expect((await repo.findTransaction(user.id, swiggy!.id))?.categoryId).toBeNull();

    // Money in has no spending category; someone else's payment is not found.
    expect((await finance.setTransactionCategory(user.id, refund!.id, 'Food')).ok).toBe(false);
    const other = await makeUser('notmine@example.com');
    expect((await finance.setTransactionCategory(other.id, swiggy!.id, 'Food')).ok).toBe(false);
    expect((await repo.findTransaction(user.id, swiggy!.id))?.categoryId).toBeNull();
  });
});

describe('payments that come round monthly', () => {
  beforeEach(reset);

  it('are found, tracked as a bill in one step, and then no longer suggested', async () => {
    const user = await makeUser('monthly@example.com');
    const savings = await account(user.id);
    await load(user.id, savings.id, [
      ['2026-07-05', '-1500000', 'Ramesh Babu', 'Rent'],
      ['2026-08-05', '-1500000', 'Ramesh Babu', 'Rent'],
      ['2026-09-05', '-1500000', 'Ramesh Bab', 'Rent'],
      // Lunch at the same place every month is still not a bill.
      ['2026-07-14', '-50000', 'Hotel Sagar', 'Food'],
      ['2026-08-14', '-50000', 'Hotel Sagar', 'Food'],
      ['2026-09-14', '-50000', 'Hotel Sagar', 'Food'],
      ['2026-09-10', '-45000', 'Ravi Mart'],
      ['2026-09-20', '-91000', 'Ravi Mart'],
      ['2026-10-01', '-30000', 'Ravi Mart'],
    ]);

    const found = await finance.monthlyCandidates(user.id, '2026-10-24');
    expect(found.map((f) => [f.name, f.amountMinor, f.nextDueOn])).toEqual([
      ['Ramesh Babu', 1500000n, '2026-11-05'],
    ]);

    const tracked = await finance.trackMonthly(user.id, found[0]!.key, '2026-10-24', 'INR');
    expect(tracked.ok).toBe(true);
    const [bill] = await repo.listSubscriptions(user.id);
    const rent = (await repo.listCategories(user.id)).find((c) => c.name === 'Rent')!;
    expect(bill).toMatchObject({
      name: 'Ramesh Babu',
      amountMinor: 1500000n,
      cadence: 'monthly',
      nextDueOn: '2026-11-05',
      accountId: savings.id,
      categoryId: rent.id,
    });

    expect(await finance.monthlyCandidates(user.id, '2026-10-24')).toEqual([]);
    // Tracking it again, or someone else tracking it, does nothing.
    expect((await finance.trackMonthly(user.id, found[0]!.key, '2026-10-24', 'INR')).ok).toBe(
      false,
    );
    const other = await makeUser('copycat@example.com');
    expect((await finance.trackMonthly(other.id, found[0]!.key, '2026-10-24', 'INR')).ok).toBe(
      false,
    );
    expect(await repo.listSubscriptions(other.id)).toEqual([]);
  });

  it('adds up spending per month for the trend', async () => {
    const user = await makeUser('trend@example.com');
    await load(user.id, (await account(user.id)).id, [
      ['2026-08-05', '-1000', 'A'],
      ['2026-08-25', '-2000', 'B'],
      ['2026-10-01', '-500', 'C'],
      ['2026-10-02', '9000', 'Salary'],
    ]);
    expect(await repo.monthlySpending(user.id, '2026-05-01', '2026-10-31', 'INR')).toEqual([
      { month: '2026-08', spentMinor: 3000n },
      { month: '2026-10', spentMinor: 500n },
    ]);
  });
});
