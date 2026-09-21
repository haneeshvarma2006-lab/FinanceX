import { differenceInCalendarDays, parseISO } from 'date-fns';

/**
 * Habit streaks, computed rather than stored.
 *
 * A stored streak counter is a cache with no invalidation story: it goes
 * silently wrong the first time somebody backfills yesterday, deletes an entry,
 * or changes timezone. Computing from the entries means the number can never
 * disagree with the history it claims to describe.
 *
 * Dates are calendar days (`YYYY-MM-DD`) in the user's timezone, resolved
 * before they reach here. Comparing instants instead would make a 23:00 entry
 * and a 01:00 entry land on different days for some users and the same day for
 * others.
 */

export type StreakSummary = {
  /** Consecutive days up to and including today, or up to yesterday if today is not yet logged. */
  current: number;
  /** The best run ever recorded. */
  longest: number;
  /** Whether today already counts as done. */
  completedToday: boolean;
  /** Days logged in the last 30, for the activity strip. */
  last30: number;
};

/**
 * @param dates  calendar days on which the habit was satisfied, any order
 * @param today  the user's today, as YYYY-MM-DD
 */
export function summarise(dates: readonly string[], today: string): StreakSummary {
  // De-duplicate first: the unique index should prevent duplicates, but a
  // streak that double-counts is worse than one that is merely wrong.
  const unique = [...new Set(dates)].sort();
  const todayDate = parseISO(today);

  if (unique.length === 0) {
    return { current: 0, longest: 0, completedToday: false, last30: 0 };
  }

  const completedToday = unique.includes(today);

  // Longest run anywhere in the history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    const gap = differenceInCalendarDays(parseISO(unique[i]!), parseISO(unique[i - 1]!));
    run = gap === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  /**
   * The current streak counts back from today, or from yesterday when today is
   * not logged yet. Ending it at midnight would mean every streak reads zero
   * each morning until the user opens the app, which is punishing and wrong.
   */
  const last = unique[unique.length - 1]!;
  const daysSinceLast = differenceInCalendarDays(todayDate, parseISO(last));

  let current = 0;
  if (daysSinceLast === 0 || daysSinceLast === 1) {
    current = 1;
    for (let i = unique.length - 1; i > 0; i -= 1) {
      const gap = differenceInCalendarDays(parseISO(unique[i]!), parseISO(unique[i - 1]!));
      if (gap !== 1) break;
      current += 1;
    }
  }

  const last30 = unique.filter((d) => {
    const delta = differenceInCalendarDays(todayDate, parseISO(d));
    return delta >= 0 && delta < 30;
  }).length;

  return { current, longest, completedToday, last30 };
}
