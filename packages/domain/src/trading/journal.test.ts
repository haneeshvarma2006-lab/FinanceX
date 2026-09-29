import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from './decimal';
import { openedSoonAfterLoss, plannedRewardRisk, type JournalTrade } from './journal';

const d = parseDecimal;

describe('plannedRewardRisk', () => {
  it('measures the target in units of the stop distance, long or short', () => {
    expect(formatDecimal(plannedRewardRisk(d('100'), d('98'), d('105'))!, 2)).toBe('2.5');
    expect(formatDecimal(plannedRewardRisk(d('100'), d('102'), d('94'))!, 2)).toBe('3');
  });

  it('is null without a stop, a target, an entry, or any risk', () => {
    expect(plannedRewardRisk(null, d('98'), d('105'))).toBeNull();
    expect(plannedRewardRisk(d('100'), null, d('105'))).toBeNull();
    expect(plannedRewardRisk(d('100'), d('98'), null)).toBeNull();
    expect(plannedRewardRisk(d('100'), d('100'), d('105'))).toBeNull();
  });
});

describe('openedSoonAfterLoss', () => {
  const t = (
    id: string,
    opened: string,
    closed: string | null,
    pnl: bigint,
    accountId = 'a',
  ): JournalTrade => ({
    id,
    accountId,
    openedAt: new Date(opened),
    closedAt: closed ? new Date(closed) : null,
    realizedPnlMinor: pnl,
    status: closed ? 'closed' : 'open',
  });

  it('flags a trade opened within the hour after a loss on the same account', () => {
    const flagged = openedSoonAfterLoss([
      t('loss', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z', -5000n),
      t('quick', '2026-09-01T10:20:00Z', null, 0n),
      t('later', '2026-09-01T12:30:00Z', null, 0n),
      t('other-account', '2026-09-01T10:10:00Z', null, 0n, 'b'),
    ]);
    expect([...flagged]).toEqual(['quick']);
  });

  it('does not flag a trade that followed a win', () => {
    const flagged = openedSoonAfterLoss([
      t('win', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z', 5000n),
      t('next', '2026-09-01T10:05:00Z', null, 0n),
    ]);
    expect(flagged.size).toBe(0);
  });
});
