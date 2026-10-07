import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as repo from '@/modules/decisions/repository';
import { decisionReviewSchema, decisionSchema } from '@/modules/decisions/validators';
import * as productivity from '@/modules/productivity/service';
import { taskSchema } from '@/modules/productivity/validators';

/**
 * The decision journal and task categories: decisions are logged, become
 * due on their review day, are judged and can be judged again — and none of
 * it reaches across users. Task categories survive a recurring task's
 * successor.
 */

const ctx = { ip: '203.0.113.92', userAgent: 'vitest' };

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
      displayName: 'Decider',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

const decision = (input: Record<string, unknown>) => decisionSchema.parse(input);

describe('decisions', () => {
  beforeEach(reset);
  afterAll(reset);

  it('normalises blanks and rejects bad confidence or verdict', () => {
    expect(
      decision({ title: ' Buy the index fund ', reasoning: ' ', confidence: '', reviewOn: '' }),
    ).toEqual({
      title: 'Buy the index fund',
      area: 'life',
      reasoning: null,
      confidence: null,
      reviewOn: null,
    });
    expect(decisionSchema.safeParse({ title: 'x', confidence: '9' }).success).toBe(false);
    expect(decisionReviewSchema.safeParse({ id: 'a', verdict: 'maybe' }).success).toBe(false);
  });

  it('becomes due on its review day, is judged, and can be reopened', async () => {
    const user = await makeUser('decider@example.com');
    const made = await repo.createDecision(
      user.id,
      decision({
        title: 'Cut position size',
        area: 'trading',
        confidence: '4',
        reviewOn: '2026-10-20',
      }),
    );
    expect(made.confidence).toBe(4);

    expect(await repo.listDueDecisions(user.id, '2026-10-19')).toEqual([]);
    expect((await repo.listDueDecisions(user.id, '2026-10-20')).map((d) => d.id)).toEqual([
      made.id,
    ]);

    const reviewed = await repo.reviewDecision(
      user.id,
      decisionReviewSchema.parse({ id: made.id, verdict: 'right', outcome: 'Drawdown halved' }),
    );
    expect(reviewed?.verdict).toBe('right');
    expect(reviewed?.reviewedAt).not.toBeNull();
    // Judged decisions are no longer due.
    expect(await repo.listDueDecisions(user.id, '2026-12-01')).toEqual([]);

    const counts = await repo.countDecisionsBetween(
      user.id,
      new Date(Date.now() - 60_000),
      new Date(Date.now() + 60_000),
    );
    expect(counts).toEqual({ made: 1, reviewed: 1, right: 1, wrong: 0 });

    expect(await repo.reopenDecision(user.id, made.id)).toBe(true);
    const [again] = await repo.listDecisions(user.id);
    expect(again?.verdict).toBeNull();
    expect(again?.outcome).toBeNull();
  });

  it("never reads, judges or deletes another user's decision", async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const mine = await repo.createDecision(
      owner.id,
      decision({ title: 'Private', reviewOn: '2026-01-01' }),
    );

    expect(await repo.listDecisions(other.id)).toEqual([]);
    expect(await repo.listDueDecisions(other.id, '2027-01-01')).toEqual([]);
    expect(
      await repo.reviewDecision(
        other.id,
        decisionReviewSchema.parse({ id: mine.id, verdict: 'wrong' }),
      ),
    ).toBeUndefined();
    expect(await repo.reopenDecision(other.id, mine.id)).toBe(false);
    expect(await repo.deleteDecision(other.id, mine.id)).toBe(false);
    expect((await repo.listDecisions(owner.id))[0]?.verdict).toBeNull();
  });
});

describe('task categories', () => {
  beforeEach(reset);

  it('stores the quick-add category and carries it to the next occurrence', async () => {
    const user = await makeUser('gym@example.com');
    const created = await productivity.createTask(
      user.id,
      taskSchema.parse({ title: 'Gym', category: 'gym', repeat: 'daily' }),
    );
    if (!created.ok) throw new Error('create failed');
    expect(created.value.category).toBe('gym');

    const done = await productivity.completeTask(user.id, created.value.id);
    if (!done.ok) throw new Error('complete failed');
    expect(done.value.nextOccurrence?.category).toBe('gym');

    expect(taskSchema.safeParse({ title: 'x', category: 'napping' }).success).toBe(false);
  });
});
