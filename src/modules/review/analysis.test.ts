import { describe, expect, it } from 'vitest';
import {
  analyseWeek,
  daysElapsed,
  shiftWeek,
  weekContaining,
  worstLosingStreak,
  type WeekFacts,
} from './analysis';

const quiet: WeekFacts = {
  locale: 'en-IN',
  tasks: { completed: 0, planned: 0, plannedDone: 0, overdueOpen: 0, byCategory: {} },
  habits: [],
  money: null,
  trading: null,
  notesWritten: 0,
  decisions: { made: 0, reviewed: 0, right: 0, wrong: 0 },
  rules: [],
};

const trading = (over: Partial<NonNullable<WeekFacts['trading']>> = {}) => ({
  currency: 'INR' as const,
  closed: 4,
  wins: 1,
  netPnlMinor: -500000n,
  worstStreak: { count: 3, day: '2026-10-06' },
  biggestLoss: { symbol: 'NIFTY', pnlMinor: -300000n },
  costly: [],
  ...over,
});

describe('weeks', () => {
  it('runs Monday to Sunday, across month and year ends', () => {
    expect(weekContaining('2026-10-07')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(weekContaining('2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(weekContaining('2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(weekContaining('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
    expect(shiftWeek({ start: '2026-10-05', end: '2026-10-11' }, -1)).toEqual({
      start: '2026-09-28',
      end: '2026-10-04',
    });
  });

  it('counts the days of the week that have happened', () => {
    const week = { start: '2026-10-05', end: '2026-10-11' };
    expect(daysElapsed(week, '2026-10-05')).toBe(1);
    expect(daysElapsed(week, '2026-10-07')).toBe(3);
    expect(daysElapsed(week, '2026-10-20')).toBe(7);
  });
});

describe('worstLosingStreak', () => {
  it('finds the longest run of consecutive losses and the day it ended', () => {
    expect(
      worstLosingStreak([
        { pnlMinor: -1n, day: '2026-10-05' },
        { pnlMinor: 5n, day: '2026-10-05' },
        { pnlMinor: -1n, day: '2026-10-06' },
        { pnlMinor: -1n, day: '2026-10-06' },
        { pnlMinor: -1n, day: '2026-10-07' },
        { pnlMinor: 2n, day: '2026-10-08' },
      ]),
    ).toEqual({ count: 3, day: '2026-10-07' });
    expect(worstLosingStreak([])).toEqual({ count: 0, day: '' });
  });
});

describe('analyseWeek', () => {
  it('names nothing in a quiet week', () => {
    expect(analyseWeek(quiet)).toEqual({ mistake: null, wins: [] });
  });

  it('puts a losing streak first and offers the reduce-risk rule', () => {
    const { mistake } = analyseWeek({
      ...quiet,
      trading: trading(),
      tasks: { ...quiet.tasks, planned: 5, plannedDone: 1 },
    });
    expect(mistake?.key).toBe('losing-streak');
    expect(mistake?.title).toBe('3 losing trades in a row on Tuesday');
    expect(mistake?.suggestion).toEqual({
      kind: 'rule',
      template: 'reduce-risk-after-losses',
      label: 'Add rule: reduce risk after 2 consecutive losses',
    });
  });

  it('does not offer a rule the user already has in an equal or stricter form', () => {
    const covered = analyseWeek({
      ...quiet,
      trading: trading(),
      rules: [{ triggerType: 'consecutive_losing_trades', count: 2, enabled: true }],
    });
    expect(covered.mistake?.suggestion.kind).toBe('covered');

    // A looser rule (3 in a row) does not cover "after 2", and a disabled one never does.
    for (const rule of [
      { triggerType: 'consecutive_losing_trades', count: 3, enabled: true },
      { triggerType: 'consecutive_losing_trades', count: 2, enabled: false },
    ]) {
      expect(
        analyseWeek({ ...quiet, trading: trading(), rules: [rule] }).mistake?.suggestion.kind,
      ).toBe('rule');
    }
  });

  it('names a costly feeling with what it cost', () => {
    const { mistake } = analyseWeek({
      ...quiet,
      trading: trading({
        worstStreak: { count: 1, day: '2026-10-06' },
        costly: [{ emotion: 'fomo', trades: 2, netPnlMinor: -420000n }],
      }),
    });
    expect(mistake?.key).toBe('costly-emotion');
    expect(mistake?.title).toBe('Trades you tagged FOMO lost ₹4,200.00');
  });

  it('flags spending above income and celebrates a strong savings week', () => {
    const over = analyseWeek({
      ...quiet,
      money: {
        currency: 'INR',
        incomeMinor: 1000000n,
        expenseMinor: 1250000n,
        previousExpenseMinor: 0n,
        topCategory: { name: 'Dining', spentMinor: 600000n },
      },
    });
    expect(over.mistake?.key).toBe('overspent');
    expect(over.mistake?.title).toBe('You spent ₹2,500.00 more than you earned');

    const saver = analyseWeek({
      ...quiet,
      money: {
        currency: 'INR',
        incomeMinor: 1000000n,
        expenseMinor: 600000n,
        previousExpenseMinor: 0n,
        topCategory: null,
      },
    });
    expect(saver.mistake).toBeNull();
    expect(saver.wins).toEqual([{ area: 'money', text: 'You kept 40% of what you earned' }]);
  });

  it('flags a plan mostly left undone and a habit mostly missed, in that order', () => {
    const facts: WeekFacts = {
      ...quiet,
      tasks: { ...quiet.tasks, planned: 6, plannedDone: 2 },
      habits: [{ name: 'Walk', done: 1, target: 7 }],
    };
    expect(analyseWeek(facts).mistake?.key).toBe('low-completion');
    expect(analyseWeek({ ...facts, tasks: quiet.tasks }).mistake?.title).toBe(
      'Walk: 1 of 7 this week',
    );
  });

  it('flags spending up by half or more on the week before', () => {
    const facts = (expense: bigint): WeekFacts => ({
      ...quiet,
      money: {
        currency: 'INR',
        incomeMinor: 0n,
        expenseMinor: expense,
        previousExpenseMinor: 1000000n,
        topCategory: { name: 'Dining', spentMinor: 900000n },
      },
    });
    expect(analyseWeek(facts(1500000n)).mistake?.title).toBe('Spending is up 50% on last week');
    expect(analyseWeek(facts(1490000n)).mistake).toBeNull();
  });
});
