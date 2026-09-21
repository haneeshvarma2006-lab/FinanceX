import { describe, expect, it } from 'vitest';
import { buildRule, describeRule, nextOccurrence, RecurrenceError } from './recurrence';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('buildRule', () => {
  it('builds the frequencies the UI offers', () => {
    expect(buildRule('daily')).toContain('FREQ=DAILY');
    expect(buildRule('weekly')).toContain('FREQ=WEEKLY');
    expect(buildRule('monthly')).toContain('FREQ=MONTHLY');
    expect(buildRule('yearly')).toContain('FREQ=YEARLY');
  });

  it('supports an interval', () => {
    expect(buildRule('weekly', 2)).toContain('INTERVAL=2');
  });

  it('rejects a nonsense interval', () => {
    for (const bad of [0, -1, 1.5, 400]) {
      expect(() => buildRule('daily', bad)).toThrow(RecurrenceError);
    }
  });
});

describe('nextOccurrence', () => {
  it('advances a daily task by one day', () => {
    expect(iso(nextOccurrence(buildRule('daily'), new Date('2026-09-20T09:00:00Z')))).toBe(
      '2026-09-21',
    );
  });

  it('advances a weekly task by seven days', () => {
    expect(iso(nextOccurrence(buildRule('weekly'), new Date('2026-09-20T09:00:00Z')))).toBe(
      '2026-09-27',
    );
  });

  it('advances a fortnightly task by fourteen days', () => {
    expect(iso(nextOccurrence(buildRule('weekly', 2), new Date('2026-09-20T09:00:00Z')))).toBe(
      '2026-10-04',
    );
  });

  it('advances a monthly task across a month boundary', () => {
    expect(iso(nextOccurrence(buildRule('monthly'), new Date('2026-09-20T09:00:00Z')))).toBe(
      '2026-10-20',
    );
  });

  it('never returns the same instant it was given', () => {
    // Computing inclusively would produce a task that recurs onto itself.
    const from = new Date('2026-09-20T09:00:00Z');
    const next = nextOccurrence(buildRule('daily'), from);
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });

  it('advances from the completion date, not the original rule date', () => {
    // Completing a daily task three days late schedules the next for the day
    // after completion, not for a date already in the past.
    const late = new Date('2026-09-23T09:00:00Z');
    expect(iso(nextOccurrence(buildRule('daily'), late))).toBe('2026-09-24');
  });

  it('handles a month-end date without skipping a month', () => {
    // 31 Jan + 1 month has no 31 Feb; the rule must still land somewhere sane.
    const next = nextOccurrence(buildRule('monthly'), new Date('2026-01-31T09:00:00Z'));
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(new Date('2026-01-31T09:00:00Z').getTime());
  });

  it('crosses a year boundary', () => {
    expect(iso(nextOccurrence(buildRule('daily'), new Date('2026-12-31T09:00:00Z')))).toBe(
      '2027-01-01',
    );
  });

  it('handles a leap day', () => {
    expect(iso(nextOccurrence(buildRule('daily'), new Date('2028-02-28T09:00:00Z')))).toBe(
      '2028-02-29',
    );
  });

  it('survives a DST transition without losing or repeating a day', () => {
    // 29 March 2026 is a European DST change. A naive +24h would land wrong.
    const before = new Date('2026-03-28T12:00:00Z');
    expect(iso(nextOccurrence(buildRule('daily'), before))).toBe('2026-03-29');

    const during = new Date('2026-03-29T12:00:00Z');
    expect(iso(nextOccurrence(buildRule('daily'), during))).toBe('2026-03-30');
  });

  it('returns null when a finite series is exhausted', () => {
    // COUNT=1 means the single occurrence at DTSTART and nothing after it.
    const finite = 'DTSTART:20260920T090000Z\nRRULE:FREQ=DAILY;COUNT=1';
    expect(nextOccurrence(finite, new Date('2026-09-20T09:00:00Z'))).toBeNull();
  });

  it('rejects a malformed rule', () => {
    for (const bad of ['not a rule', 'FREQ=NONSENSE', '']) {
      expect(() => nextOccurrence(bad, new Date())).toThrow(RecurrenceError);
    }
  });
});

describe('describeRule', () => {
  it('renders a readable summary', () => {
    expect(describeRule(buildRule('daily')).toLowerCase()).toContain('day');
    expect(describeRule(buildRule('weekly')).toLowerCase()).toContain('week');
  });

  it('degrades gracefully rather than throwing in the UI', () => {
    expect(describeRule('garbage')).toBe('Custom schedule');
  });
});
