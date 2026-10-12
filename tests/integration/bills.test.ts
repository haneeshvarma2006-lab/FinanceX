import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import { resetEnvCache } from '@/lib/env';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as bills from '@/modules/finance/bills';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';

/**
 * Bill photos: kept in the store with a record that points at them, refused
 * when they are not a JPEG, never reachable by another account, and gone
 * from storage when deleted or when the account is.
 */

const ctx = { ip: '203.0.113.95', userAgent: 'vitest' };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 0xff, 0xd9]);
let dir: string;

function storedFiles(): string[] {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [relative(dir, join(d, e.name))],
    );
  try {
    return walk(dir);
  } catch {
    return [];
  }
}

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

async function expense(userId: string) {
  const account = await financeRepo.insertAccount(userId, {
    name: 'HDFC',
    kind: 'bank',
    currency: 'INR',
    openingBalanceMinor: 0n,
  });
  const tx = await finance.createTransaction(userId, {
    accountId: account.id,
    occurredOn: '2026-10-11',
    amount: '1638',
    kind: 'expense',
    description: 'Spice Garden',
  });
  if (!tx.ok) throw new Error('setup failed');
  return tx.value;
}

const photo = (transactionId: string | null) => ({
  bytes: JPEG,
  transactionId,
  merchant: 'Spice Garden',
  amountMinor: 163800n,
  currency: 'INR',
  billDate: '2026-10-11',
});

describe('bill photos', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bills-'));
    process.env.BILL_STORAGE = 'local';
    process.env.BILL_STORAGE_DIR = relative(process.cwd(), dir);
    resetEnvCache();
  });
  afterAll(async () => {
    delete process.env.BILL_STORAGE;
    delete process.env.BILL_STORAGE_DIR;
    resetEnvCache();
    rmSync(dir, { recursive: true, force: true });
    await reset();
  });
  // Truncating the database leaves files behind, so each test starts with an
  // empty storage folder too.
  beforeEach(async () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    await reset();
  });

  it('keeps a photo attached to its expense, and deletes it from storage', async () => {
    const user = await makeUser('bills@example.com');
    const tx = await expense(user.id);

    const saved = await bills.saveBillPhoto(user.id, photo(tx.id));
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.value.storageKey).toBe(`bills/${user.id}/${saved.value.id}.jpg`);
    expect(storedFiles()).toEqual([saved.value.storageKey]);

    const map = await financeRepo.billIdsForTransactions(user.id, [tx.id]);
    expect(map.get(tx.id)).toBe(saved.value.id);

    // Deleting the expense keeps the photo, unattached.
    await finance.deleteTransaction(user.id, tx.id);
    expect((await financeRepo.findBill(user.id, saved.value.id))?.transactionId).toBeNull();

    expect((await bills.deleteBillPhoto(user.id, saved.value.id)).ok).toBe(true);
    expect(storedFiles()).toEqual([]);
  });

  it('refuses anything that is not a small JPEG', async () => {
    const user = await makeUser('png@example.com');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    for (const bytes of [
      png,
      new Uint8Array(),
      new Uint8Array(bills.MAX_BILL_BYTES + 1).fill(0xff),
    ]) {
      const result = await bills.saveBillPhoto(user.id, { ...photo(null), bytes });
      expect(result.ok).toBe(false);
    }
    expect(storedFiles()).toEqual([]);
  });

  it("never attaches to, shows or deletes another account's bill", async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const tx = await expense(owner.id);

    expect((await bills.saveBillPhoto(other.id, photo(tx.id))).ok).toBe(false);

    const saved = await bills.saveBillPhoto(owner.id, photo(tx.id));
    if (!saved.ok) throw new Error('save failed');
    expect(await financeRepo.findBill(other.id, saved.value.id)).toBeUndefined();
    expect((await bills.deleteBillPhoto(other.id, saved.value.id)).ok).toBe(false);
    expect(storedFiles()).toHaveLength(1);
  });

  it("removes every photo from storage when the account's photos are cleared", async () => {
    const user = await makeUser('leaver@example.com');
    await bills.saveBillPhoto(user.id, photo(null));
    await bills.saveBillPhoto(user.id, photo(null));
    expect(storedFiles()).toHaveLength(2);
    await bills.deleteAllBillPhotos(user.id);
    expect(storedFiles()).toEqual([]);
  });
});
