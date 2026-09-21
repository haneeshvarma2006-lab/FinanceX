import { RRule } from 'rrule';

/**
 * Task recurrence, on RFC 5545 rules.
 *
 * Only the NEXT occurrence is ever materialised, and only when the current one
 * is completed. Expanding a series into rows up-front means an unbounded
 * insert for "every day forever", and a list that is mostly future work nobody
 * has looked at yet.
 *
 * The rule is stored as an RRULE string rather than a bag of custom columns so
 * "every second Tuesday" needs no schema change, and so the semantics are
 * somebody else's well-specified standard rather than ours.
 */

export const SUPPORTED_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof SUPPORTED_FREQUENCIES)[number];

const FREQ_MAP: Record<Frequency, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

export class RecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurrenceError';
  }
}

/** Build an RRULE string from the simple options the UI offers. */
export function buildRule(frequency: Frequency, interval = 1): string {
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new RecurrenceError('Interval must be between 1 and 365');
  }

  return new RRule({ freq: FREQ_MAP[frequency], interval }).toString();
}

export function parseRule(rule: string): RRule {
  /**
   * rrule's parser is lenient: an empty string yields freq = 0, which is
   * YEARLY, without throwing. Inspecting `options.freq` therefore cannot tell
   * "explicitly yearly" apart from "nothing, defaulted" — and a stored rule
   * that silently degrades would turn a daily task into a yearly one.
   *
   * So the input must carry an explicit, recognised FREQ token before it is
   * handed to the parser at all.
   */
  if (!/\bFREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|HOURLY|MINUTELY|SECONDLY)\b/i.test(rule)) {
    throw new RecurrenceError('That is not a valid recurrence rule');
  }

  try {
    return RRule.fromString(rule);
  } catch {
    throw new RecurrenceError('That is not a valid recurrence rule');
  }
}

/**
 * The next occurrence strictly after `after`.
 *
 * "Strictly after" matters: computing from the due date inclusively would
 * return the same date again and create a task that recurs onto itself.
 *
 * Returns null when the rule has run out (a COUNT or UNTIL has been reached),
 * which is how a finite series ends without special-casing.
 */
export function nextOccurrence(rule: string, after: Date): Date | null {
  const parsed = parseRule(rule);

  /**
   * rrule computes in UTC but treats the date as floating. Anchoring DTSTART
   * to `after` keeps the series aligned to the task's own schedule rather than
   * to whenever the rule happened to be written.
   */
  const anchored = new RRule({ ...parsed.origOptions, dtstart: after });

  return anchored.after(after, false) ?? null;
}

/** Human-readable summary, for showing the rule back to the user. */
export function describeRule(rule: string): string {
  try {
    return parseRule(rule).toText();
  } catch {
    return 'Custom schedule';
  }
}
