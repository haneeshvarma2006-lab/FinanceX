import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { statementImportSchema } from '@/modules/finance/validators';

/**
 * Statement import: rows land as income and expenses in the account's
 * currency, a second import of the same file adds nothing, something typed
 * in by hand is flagged rather than doubled, and nobody can import into an
 * account that is not theirs.
 */

const ctx = { ip: '203.0.113.94', userAgent: 'vitest' };

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
      displayName: 'Importer',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

const ROWS = [
  { occurredOn: '2026-10-01', amountMinor: '8500000', description: 'SALARY OCT' },
  { occurredOn: '2026-10-03', amountMinor: '-45000', description: 'UPI-SWIGGY' },
  { occurredOn: '2026-10-03', amountMinor: '-45000', description: 'UPI-SWIGGY' },
  { occurredOn: '2026-10-05', amountMinor: '-120000', description: 'ELECTRICITY' },
];

const input = (accountId: string, rows = ROWS) =>
  statementImportSchema.parse({ accountId, rows: rows.map((r) => ({ ...r, selected: true })) });

describe('statement import', () => {
  beforeEach(reset);
  afterAll(reset);

  it('imports income and expenses, and a second import of the same file adds nothing', async () => {
    const user = await makeUser('import@example.com');
    const bank = await financeRepo.insertAccount(user.id, {
      name: 'HDFC',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });

    const first = await finance.importStatement(user.id, input(bank.id));
    expect(first).toEqual({ ok: true, value: { inserted: 4, skipped: 0 } });

    const ledger = await financeRepo.listTransactions(user.id, { limit: 10 });
    expect(ledger.map((t) => [t.kind, t.amountMinor, t.currency]).sort()).toEqual(
      [
        ['expense', -120000n, 'INR'],
        ['expense', -45000n, 'INR'],
        ['expense', -45000n, 'INR'],
        ['income', 8500000n, 'INR'],
      ].sort(),
    );
    expect((await financeRepo.accountBalances(user.id)).get(bank.id)).toBe(8290000n);

    const preview = await finance.previewImport(user.id, input(bank.id));
    expect(preview).toEqual({ ok: true, value: Array(4).fill('already-imported') });

    const second = await finance.importStatement(user.id, input(bank.id));
    expect(second).toEqual({ ok: true, value: { inserted: 0, skipped: 4 } });
    expect(await financeRepo.countTransactions(user.id)).toBe(4);
  });

  it('flags a row the user already typed in, once per typed entry', async () => {
    const user = await makeUser('typed@example.com');
    const bank = await financeRepo.insertAccount(user.id, {
      name: 'HDFC',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });
    await finance.createTransaction(user.id, {
      accountId: bank.id,
      occurredOn: '2026-10-03',
      amount: '450',
      kind: 'expense',
      description: 'Swiggy dinner',
    });

    const preview = await finance.previewImport(user.id, input(bank.id));
    // One hand-typed ₹450 explains one of the two identical bank lines, not both.
    expect(preview).toEqual({
      ok: true,
      value: ['new', 'possible-duplicate', 'new', 'new'],
    });

    // Unticked rows are not written, but still anchor the ids of the rows after them.
    const picked = statementImportSchema.parse({
      accountId: bank.id,
      rows: ROWS.map((r, i) => ({ ...r, selected: i !== 1 })),
    });
    expect(await finance.importStatement(user.id, picked)).toEqual({
      ok: true,
      value: { inserted: 3, skipped: 0 },
    });
    const again = await finance.previewImport(user.id, input(bank.id));
    expect(again).toEqual({
      ok: true,
      value: ['already-imported', 'possible-duplicate', 'already-imported', 'already-imported'],
    });
  });

  it("refuses another user's account and rejects malformed rows", async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const bank = await financeRepo.insertAccount(owner.id, {
      name: 'HDFC',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });

    const attempt = await finance.importStatement(other.id, input(bank.id));
    expect(attempt.ok).toBe(false);
    expect((await finance.previewImport(other.id, input(bank.id))).ok).toBe(false);
    expect(await financeRepo.countTransactions(owner.id)).toBe(0);

    for (const bad of [
      { occurredOn: '2026-02-31x', amountMinor: '100', description: 'x' },
      { occurredOn: '2026-10-01', amountMinor: '1.5', description: 'x' },
      { occurredOn: '2026-10-01', amountMinor: '0', description: 'x' },
      { occurredOn: '2026-10-01', amountMinor: '100', description: '' },
    ]) {
      expect(statementImportSchema.safeParse({ accountId: bank.id, rows: [bad] }).success).toBe(
        false,
      );
    }
  });
});
