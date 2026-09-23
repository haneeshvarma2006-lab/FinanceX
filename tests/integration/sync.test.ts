import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as productivity from '@/modules/productivity/service';
import * as productivityRepo from '@/modules/productivity/repository';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import * as sync from '@/modules/sync/repository';

const ctx = { ip: '203.0.113.99', userAgent: 'vitest' };

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits, change_log');
}

async function makeUser(email = 'sync@example.com') {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Sync',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await getPool().end();
});

describe('change log completeness', () => {
  it('records a create, an update and a delete for the same row', async () => {
    const user = await makeUser();
    const start = await sync.latestCursor(user.id);

    const created = await productivity.createTask(user.id, {
      title: 'Tracked',
      priority: 3,
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    await productivity.completeTask(user.id, created.value.id);
    await productivity.deleteTask(user.id, created.value.id);

    const changes = await sync.changesSince(user.id, start);
    const forTask = changes.filter((c) => c.entityId === created.value.id);

    expect(forTask.map((c) => c.op)).toEqual(['created', 'updated', 'deleted']);
    expect(forTask.every((c) => c.entityType === 'tasks')).toBe(true);
  });

  it('DELETES ARE VISIBLE TO A DELTA READ — the resurrection bug', async () => {
    /**
     * The failure this whole table exists to prevent: a client syncs, a row is
     * hard-deleted on the server, the client syncs again. Without a tombstone
     * the delta is empty, the client still holds the row, and pushes it back.
     */
    const user = await makeUser();

    const created = await productivity.createTask(user.id, {
      title: 'Will be deleted',
      priority: 3,
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    // The client syncs and is now up to date.
    const cursorAfterSync = await sync.latestCursor(user.id);
    expect(await sync.changesSince(user.id, cursorAfterSync)).toEqual([]);

    await productivity.deleteTask(user.id, created.value.id);

    // The row is gone from its own table...
    expect(await productivityRepo.findTask(user.id, created.value.id)).toBeUndefined();

    // ...but the delta still tells the client it was deleted.
    const delta = await sync.changesSince(user.id, cursorAfterSync);
    expect(delta).toHaveLength(1);
    expect(delta[0]?.op).toBe('deleted');
    expect(delta[0]?.entityId).toBe(created.value.id);
  });

  it('cannot be bypassed by writing straight to the table', async () => {
    // The point of a trigger over a repository call: a code path that forgets
    // to log still logs.
    const user = await makeUser();
    const start = await sync.latestCursor(user.id);

    await getPool().query(
      `insert into tasks (id, user_id, title, priority, status, sort_key)
       values ('11111111-1111-1111-1111-111111111111', $1, 'Raw insert', 3, 'todo', 0)`,
      [user.id],
    );
    await getPool().query(`delete from tasks where id = '11111111-1111-1111-1111-111111111111'`);

    const changes = await sync.changesSince(user.id, start);
    expect(changes.map((c) => c.op)).toEqual(['created', 'deleted']);
  });

  it('covers finance and trading tables too', async () => {
    const user = await makeUser();
    const start = await sync.latestCursor(user.id);

    const account = await financeRepo.insertAccount(user.id, {
      name: 'Current',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });
    const tx = await finance.createTransaction(user.id, {
      accountId: account.id,
      occurredOn: '2026-09-21',
      amount: '100.00',
      kind: 'expense',
      description: 'Logged',
    });
    if (!tx.ok) throw new Error('setup failed');
    await finance.deleteTransaction(user.id, tx.value.id);

    const types = new Set((await sync.changesSince(user.id, start)).map((c) => c.entityType));
    expect(types.has('accounts')).toBe(true);
    expect(types.has('transactions')).toBe(true);
  });
});

describe('cursors', () => {
  it('is monotonic and strictly ordered', async () => {
    const user = await makeUser();

    for (let i = 0; i < 5; i += 1) {
      await productivity.createTask(user.id, {
        title: `Task ${i}`,
        priority: 3,
        repeatInterval: 1,
      });
    }

    const changes = await sync.changesSince(user.id, 0n, 100);
    const ids = changes.map((c) => c.id);

    // Strictly increasing: a timestamp cursor could tie and make a client
    // either re-fetch or skip a row.
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
  });

  it('returns only changes after the cursor', async () => {
    const user = await makeUser();

    await productivity.createTask(user.id, { title: 'Before', priority: 3, repeatInterval: 1 });
    const cursor = await sync.latestCursor(user.id);
    await productivity.createTask(user.id, { title: 'After', priority: 3, repeatInterval: 1 });

    const delta = await sync.changesSince(user.id, cursor);
    expect(delta).toHaveLength(1);
  });

  it('bounds the page size', async () => {
    const user = await makeUser();
    for (let i = 0; i < 12; i += 1) {
      await productivity.createTask(user.id, {
        title: `T${i}`,
        priority: 3,
        repeatInterval: 1,
      });
    }

    expect(await sync.changesSince(user.id, 0n, 5)).toHaveLength(5);
    // A caller asking for more than the ceiling gets the ceiling.
    expect((await sync.changesSince(user.id, 0n, 10_000)).length).toBeLessThanOrEqual(
      sync.MAX_CHANGES_PER_PAGE,
    );
  });
});

describe('sync isolation', () => {
  it('never leaks another account changes', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    await productivity.createTask(bob.id, {
      title: 'Bob private',
      priority: 3,
      repeatInterval: 1,
    });

    const aliceChanges = await sync.changesSince(alice.id, 0n, 500);
    expect(aliceChanges.every((c) => c.userId === alice.id)).toBe(true);
    expect(aliceChanges.some((c) => c.entityType === 'tasks')).toBe(false);
  });

  it('one account cursor cannot read another account log', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    await productivity.createTask(bob.id, { title: 'Bob', priority: 3, repeatInterval: 1 });

    // Alice replays from zero and still sees nothing of Bob's.
    const fromZero = await sync.changesSince(alice.id, 0n, 500);
    expect(fromZero.every((c) => c.userId === alice.id)).toBe(true);
  });
});

describe('account deletion', () => {
  it('purges the log without aborting the cascade', async () => {
    /**
     * The cascade that deletes a user fires these triggers, writing a final
     * burst of entries for a user that is disappearing. A foreign key on
     * change_log.user_id would make those inserts fail and roll the deletion
     * back — which is why there is no FK, and why the purge is explicit.
     */
    const user = await makeUser();
    await productivity.createTask(user.id, { title: 'Doomed', priority: 3, repeatInterval: 1 });

    const identityRepo = await import('@/modules/identity/repository');
    await expect(identityRepo.hardDeleteUser(user.id)).resolves.toBeUndefined();

    expect(await sync.changesSince(user.id, 0n, 500)).toEqual([]);

    const { rows } = await getPool().query('select id from users where id = $1', [user.id]);
    expect(rows).toHaveLength(0);
  });

  it('leaves another account log intact', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    await productivity.createTask(bob.id, { title: 'Bob', priority: 3, repeatInterval: 1 });

    const identityRepo = await import('@/modules/identity/repository');
    await identityRepo.hardDeleteUser(alice.id);

    expect((await sync.changesSince(bob.id, 0n, 500)).length).toBeGreaterThan(0);
  });
});

describe('pruning', () => {
  it('trims history and reports the oldest retained cursor', async () => {
    const user = await makeUser();
    for (let i = 0; i < 6; i += 1) {
      await productivity.createTask(user.id, {
        title: `T${i}`,
        priority: 3,
        repeatInterval: 1,
      });
    }

    const all = await sync.changesSince(user.id, 0n, 500);
    const midpoint = all[2]!.id;

    await sync.pruneBefore(user.id, midpoint);

    expect(await sync.oldestCursor(user.id)).toBeGreaterThan(midpoint);
    expect((await sync.changesSince(user.id, 0n, 500)).length).toBe(all.length - 3);
  });
});
