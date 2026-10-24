/**
 * Spending insights: what one month of a person's own records says.
 *
 * Every sentence here is arithmetic on rows the person entered or imported
 * — the biggest category, what rose against last month, what is left over.
 * Nothing is estimated, projected or compared with anyone else. Pure, so the
 * page renders it and tests pin it down.
 */

export type MonthKey = string; // YYYY-MM

export function isMonthKey(value: string | undefined): value is MonthKey {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1970;
}

/** First and last day of a month, as YYYY-MM-DD. */
export function monthRange(month: MonthKey): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: MonthKey, locale: string, short = false): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, {
    month: short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Whole-number percentage change, or null when there was nothing to compare with. */
export function percentChange(current: bigint, previous: bigint): number | null {
  if (previous <= 0n) return null;
  return Number(((current - previous) * 1000n) / previous) / 10;
}

/** A share of a total, to one decimal place. */
export function share(part: bigint, total: bigint): number {
  return total > 0n ? Number((part * 1000n) / total) / 10 : 0;
}

export type CategorySpend = {
  /** The category's id; null for spending with none. */
  id?: string | null;
  name: string;
  /** False for spending that has no category yet. */
  sorted: boolean;
  spentMinor: bigint;
  previousMinor: bigint;
  count: number;
};

/**
 * Up to four plain sentences about the month. A rise is only called out
 * when it is large enough to matter — a fifth more, and more than a small
 * amount — so a ₹40 wobble is not news.
 */
export function highlights(input: {
  categories: readonly CategorySpend[];
  spentMinor: bigint;
  incomeMinor: bigint;
  previousSpentMinor: bigint;
  previousLabel: string;
  money: (minor: bigint) => string;
  /** Rises smaller than this are not worth a sentence (₹500 in paise). */
  noticeableMinor?: bigint;
}): string[] {
  const { categories, spentMinor, incomeMinor, previousSpentMinor, previousLabel, money } = input;
  const noticeable = input.noticeableMinor ?? 50_000n;
  const out: string[] = [];
  if (spentMinor <= 0n) return out;

  const sorted = categories.filter((c) => c.sorted).sort((a, b) => cmp(b.spentMinor, a.spentMinor));
  const top = sorted[0];
  if (top) {
    out.push(
      `${top.name} took the most: ${money(top.spentMinor)}, ${Math.round(share(top.spentMinor, spentMinor))}% of your spending.`,
    );
  }

  const rises = sorted
    .map((c) => ({ c, change: percentChange(c.spentMinor, c.previousMinor) }))
    .filter(
      ({ c, change }) =>
        change !== null && change >= 20 && c.spentMinor - c.previousMinor >= noticeable,
    )
    .sort((a, b) => cmp(b.c.spentMinor - b.c.previousMinor, a.c.spentMinor - a.c.previousMinor));
  const rise = rises[0];
  if (rise) {
    out.push(
      `${rise.c.name} is up ${Math.round(rise.change!)}% on ${previousLabel} (${money(rise.c.spentMinor - rise.c.previousMinor)} more).`,
    );
  } else if (previousSpentMinor > 0n) {
    const change = percentChange(spentMinor, previousSpentMinor)!;
    if (change <= -10) {
      out.push(
        `You spent ${Math.round(-change)}% less than in ${previousLabel}: ${money(previousSpentMinor - spentMinor)} less.`,
      );
    }
  }

  if (incomeMinor > 0n) {
    out.push(
      incomeMinor >= spentMinor
        ? `${money(incomeMinor - spentMinor)} left after spending, ${Math.round(share(incomeMinor - spentMinor, incomeMinor))}% of what came in.`
        : `You spent ${money(spentMinor - incomeMinor)} more than came in.`,
    );
  }

  const unsorted = categories.find((c) => !c.sorted);
  if (unsorted && unsorted.spentMinor > 0n) {
    out.push(
      `${money(unsorted.spentMinor)} across ${unsorted.count} payment${unsorted.count === 1 ? '' : 's'} has no category yet.`,
    );
  }
  return out;
}

function cmp(a: bigint, b: bigint): number {
  return a > b ? 1 : a < b ? -1 : 0;
}
