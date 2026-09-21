import { describe, expect, it } from 'vitest';
import { summarise } from './streaks';

const TODAY = '2026-09-20';

describe('habit streaks', () => {
  it('reports nothing for a habit never logged', () => {
    expect(summarise([], TODAY)).toEqual({
      current: 0,
      longest: 0,
      completedToday: false,
      last30: 0,
    });
  });

  it('counts a run ending today', () => {
    const s = summarise(['2026-09-18', '2026-09-19', '2026-09-20'], TODAY);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.completedToday).toBe(true);
  });

  it('keeps the streak alive when today is not logged YET', () => {
    // Ending the streak at midnight would zero it every morning until the user
    // opens the app, which is both punishing and inaccurate.
    const s = summarise(['2026-09-17', '2026-09-18', '2026-09-19'], TODAY);
    expect(s.current).toBe(3);
    expect(s.completedToday).toBe(false);
  });

  it('breaks the streak after a missed day', () => {
    const s = summarise(['2026-09-15', '2026-09-16', '2026-09-17'], TODAY);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(3);
  });

  it('remembers the longest run even after it is broken', () => {
    const s = summarise(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-19', '2026-09-20'],
      TODAY,
    );
    expect(s.longest).toBe(4);
    expect(s.current).toBe(2);
  });

  it('is not fooled by duplicate dates', () => {
    const s = summarise(['2026-09-19', '2026-09-19', '2026-09-20'], TODAY);
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
  });

  it('is not fooled by unsorted input', () => {
    const s = summarise(['2026-09-20', '2026-09-18', '2026-09-19'], TODAY);
    expect(s.current).toBe(3);
  });

  it('handles a backfilled gap correctly', () => {
    // Logging the missing middle day joins two runs into one.
    const before = summarise(['2026-09-18', '2026-09-20'], TODAY);
    expect(before.current).toBe(1);

    const after = summarise(['2026-09-18', '2026-09-19', '2026-09-20'], TODAY);
    expect(after.current).toBe(3);
  });

  it('counts the last 30 days without counting older history', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-09-19', '2026-09-20'];
    expect(summarise(dates, TODAY).last30).toBe(2);
  });

  it('ignores future-dated entries in the 30-day window', () => {
    expect(summarise(['2026-09-25'], TODAY).last30).toBe(0);
  });

  it('crosses a month boundary', () => {
    const s = summarise(['2026-08-30', '2026-08-31', '2026-09-01'], '2026-09-01');
    expect(s.current).toBe(3);
  });

  it('crosses a leap-year February', () => {
    const s = summarise(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01');
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it('crosses a year boundary', () => {
    const s = summarise(['2026-12-31', '2027-01-01'], '2027-01-01');
    expect(s.current).toBe(2);
  });

  it('handles a single entry today', () => {
    const s = summarise([TODAY], TODAY);
    expect(s).toEqual({ current: 1, longest: 1, completedToday: true, last30: 1 });
  });

  it('treats a long-abandoned habit as a zero current streak', () => {
    const s = summarise(['2026-01-01', '2026-01-02'], TODAY);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
    expect(s.last30).toBe(0);
  });
});
