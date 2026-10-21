import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import { resetEnvCache } from '@/lib/env';
import * as email from '@/modules/email/service';
import * as emailRepo from '@/modules/email/repository';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { statementImportSchema } from '@/modules/finance/validators';
import { GET as runReminders } from '@/app/api/cron/reminders/route';

/**
 * A statement imported with the categories picked on its preview, the
 * month's insights read back from it, and bill reminder emails: once per due
 * date, only to people who want them, and a daily job nobody else can run.
 */

const ctx = { ip: '203.0.113.97', userAgent: 'vitest' };

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits');
}

async function makeUser(address: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email: address,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Asha Rao',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

async function account(userId: string, currency = 'INR') {
  return financeRepo.insertAccount(userId, {
    name: currency === 'INR' ? 'Savings' : 'Dollar card',
    kind: 'bank',
    currency,
    openingBalanceMinor: 0n,
  });
}

const statement = (accountId: string) =>
  statementImportSchema.parse({
    accountId,
    rows: [
      {
        occurredOn: '2026-10-01',
        amountMinor: '-48600',
        description: 'Swiggy',
        narration: 'UPI-SWIGGY-SWIGGY8@YBL-YESB0YBLUPI-412345678901',
        category: 'Food',
      },
      {
        occurredOn: '2026-10-04',
        amountMinor: '-62000',
        description: 'Zomato',
        narration: 'UPI-ZOMATO-ZOMATO@HDFCBANK',
        category: 'food',
      },
      {
        occurredOn: '2026-10-02',
        amountMinor: '-200000',
        description: 'Hpcl Petrol Pump',
        category: 'Fuel',
      },
      {
        occurredOn: '2026-10-03',
        amountMinor: '8500000',
        description: 'Example Tech Pvt Ltd',
        category: 'Food',
      },
      { occurredOn: '2026-10-07', amountMinor: '-1500000', description: 'Rahul Sample' },
    ],
  });

describe('importing a statement with categories', () => {
  beforeEach(reset);

  it('files each payment under its category, made once, and keeps the bank line', async () => {
    const user = await makeUser('import@example.com');
    const savings = await account(user.id);
    const result = await finance.importStatement(user.id, statement(savings.id));
    expect(result).toMatchObject({ ok: true, value: { inserted: 5, skipped: 0 } });

    const categories = await financeRepo.listCategories(user.id);
    // "Food" and "food" are one category; income gets none.
    expect(categories.map((c) => c.name).sort()).toEqual(['Food', 'Fuel']);
    const food = categories.find((c) => c.name === 'Food')!;

    const rows = await financeRepo.listTransactions(user.id);
    const swiggy = rows.find((r) => r.description === 'Swiggy')!;
    expect(swiggy.categoryId).toBe(food.id);
    expect(swiggy.notes).toBe('UPI-SWIGGY-SWIGGY8@YBL-YESB0YBLUPI-412345678901');
    expect(rows.find((r) => r.kind === 'income')!.categoryId).toBeNull();
    expect(rows.find((r) => r.description === 'Rahul Sample')!.categoryId).toBeNull();

    // The same statement again adds nothing.
    const again = await finance.importStatement(user.id, statement(savings.id));
    expect(again).toMatchObject({ ok: true, value: { inserted: 0, skipped: 5 } });
  });

  it('refuses an import that would make dozens of categories', async () => {
    const user = await makeUser('many@example.com');
    const savings = await account(user.id);
    const rows = Array.from({ length: 41 }, (_, i) => ({
      occurredOn: '2026-10-01',
      amountMinor: `-${100 + i}`,
      description: `Shop ${i}`,
      category: `Category ${i}`,
    }));
    const result = await finance.importStatement(
      user.id,
      statementImportSchema.parse({ accountId: savings.id, rows }),
    );
    expect(result.ok).toBe(false);
    expect(await financeRepo.listCategories(user.id)).toHaveLength(0);
  });

  it("never files into another account's ledger", async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const savings = await account(owner.id);
    const result = await finance.importStatement(other.id, statement(savings.id));
    expect(result.ok).toBe(false);
    expect(await financeRepo.listCategories(other.id)).toHaveLength(0);
  });
});

describe('spending insights', () => {
  beforeEach(reset);

  it('adds up one month in one currency: by category, by payee, the biggest payments', async () => {
    const user = await makeUser('insights@example.com');
    const savings = await account(user.id);
    const dollars = await account(user.id, 'USD');
    await finance.importStatement(user.id, statement(savings.id));
    // Spending in dollars is not added to rupees.
    await financeRepo.insertTransaction(user.id, {
      accountId: dollars.id,
      categoryId: null,
      occurredOn: '2026-10-05',
      amountMinor: -9999n,
      currency: 'USD',
      kind: 'expense',
      description: 'Swiggy',
    });

    const totals = await financeRepo.totalsIn(user.id, '2026-10-01', '2026-10-31', 'INR');
    expect(totals).toEqual({ incomeMinor: 8500000n, expenseMinor: 1810600n });

    const byCategory = await financeRepo.spendingByCategoryIn(
      user.id,
      '2026-10-01',
      '2026-10-31',
      'INR',
    );
    const names = new Map((await financeRepo.listCategories(user.id)).map((c) => [c.id, c.name]));
    expect(
      byCategory
        .map((r) => [r.categoryId ? names.get(r.categoryId) : null, r.spentMinor, r.count])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['Food', 110600n, 2],
      ['Fuel', 200000n, 1],
      [null, 1500000n, 1],
    ]);

    const payees = await financeRepo.topPayees(user.id, '2026-10-01', '2026-10-31', 'INR');
    expect(payees[0]).toEqual({ name: 'Rahul Sample', spentMinor: 1500000n, count: 1 });
    expect(payees.find((p) => p.name === 'Swiggy')?.spentMinor).toBe(48600n);

    const largest = await financeRepo.largestExpenses(
      user.id,
      '2026-10-01',
      '2026-10-31',
      'INR',
      2,
    );
    expect(largest.map((t) => t.description)).toEqual(['Rahul Sample', 'Hpcl Petrol Pump']);

    // Another month is its own.
    expect(await financeRepo.totalsIn(user.id, '2026-09-01', '2026-09-30', 'INR')).toEqual({
      incomeMinor: 0n,
      expenseMinor: 0n,
    });
  });
});

describe('bill reminder emails', () => {
  let sent: { to: string; subject: string; text: string }[];
  beforeEach(async () => {
    await reset();
    sent = [];
    email.setTransport(async (message) => {
      sent.push({ to: message.to, subject: message.subject, text: message.text });
    });
  });
  afterEach(() => email.setTransport(undefined));

  async function billDue(userId: string, nextDueOn: string) {
    return financeRepo.insertSubscription(userId, {
      name: 'Netflix',
      amountMinor: 64900n,
      currency: 'INR',
      cadence: 'monthly',
      nextDueOn,
    });
  }

  it('emails once per due date, however often reminders run', async () => {
    const user = await makeUser('bills@example.com');
    await billDue(user.id, '2026-10-23');
    await finance.remindDueBills(user.id, '2026-10-20');
    await finance.remindDueBills(user.id, '2026-10-21');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('bills@example.com');
    expect(sent[0]!.subject).toBe('Netflix (₹649.00) is due in 3 days');
    expect(sent[0]!.text).toContain('Hi Asha,');
    expect(sent[0]!.text).toContain('/finance');

    // Nothing for a bill further off.
    const later = await makeUser('later@example.com');
    await billDue(later.id, '2026-11-20');
    await finance.remindDueBills(later.id, '2026-10-20');
    expect(sent).toHaveLength(1);
  });

  it('sends none to someone who switched bill reminders off', async () => {
    const user = await makeUser('quiet@example.com');
    await emailRepo.setPreference(user.id, 'reminders', false);
    await billDue(user.id, '2026-10-21');
    await finance.remindDueBills(user.id, '2026-10-20');
    expect(sent).toHaveLength(0);
  });
});

describe('the daily reminders job', () => {
  beforeEach(reset);
  afterEach(() => {
    delete process.env.CRON_SECRET;
    resetEnvCache();
    email.setTransport(undefined);
  });

  const call = (authorization?: string) =>
    runReminders(
      new Request('http://localhost/api/cron/reminders', {
        headers: authorization ? { authorization } : {},
      }),
    );

  it('refuses to run until a secret is configured, and then only with it', async () => {
    expect((await call('Bearer anything')).status).toBe(503);

    process.env.CRON_SECRET = 'a-long-random-cron-secret-value';
    resetEnvCache();
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong-secret-of-some-length')).status).toBe(401);
    const ok = await call('Bearer a-long-random-cron-secret-value');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ accounts: 0, reminded: 0 });
  });

  it('reminds people who have not opened the app', async () => {
    process.env.CRON_SECRET = 'a-long-random-cron-secret-value';
    resetEnvCache();
    const sent: string[] = [];
    email.setTransport(async (message) => {
      sent.push(message.subject);
    });
    const user = await makeUser('away@example.com');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await financeRepo.insertSubscription(user.id, {
      name: 'Rent',
      amountMinor: 2500000n,
      currency: 'INR',
      cadence: 'monthly',
      nextDueOn: tomorrow,
    });
    const response = await call('Bearer a-long-random-cron-secret-value');
    expect(await response.json()).toEqual({ accounts: 1, reminded: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^Rent \(₹25,000\.00\) is due /);
  });
});
