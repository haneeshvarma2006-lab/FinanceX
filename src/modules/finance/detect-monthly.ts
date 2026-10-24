import { canonicalKeys, merchantKey, samePlace } from './categorize';
import { daysUntil, nextDue } from './recurring';

/**
 * Payments that come round every month — rent, a subscription, an EMI, a
 * phone plan — found in the person's own history, so they can be tracked
 * as bills with a reminder instead of typed in again.
 *
 * Deliberately strict, because a wrong suggestion is worse than a missing
 * one. A place counts only when it was paid in at least three different
 * months, about once a month (not the weekly milk run), on a roughly
 * monthly rhythm, for about the same amount each time. Cash withdrawals
 * and places already tracked as bills are left out. Pure: it sees only
 * the rows it is given.
 */

export type Payment = {
  occurredOn: string;
  /** Money out, so negative. */
  amountMinor: bigint;
  currency: string;
  description: string;
  accountId: string;
  categoryId: string | null;
};

export type MonthlyCandidate = {
  key: string;
  name: string;
  /** The usual amount, positive. */
  amountMinor: bigint;
  currency: string;
  /** How many payments matched. */
  count: number;
  lastOn: string;
  /** The next time it should come round, on or after today. */
  nextDueOn: string;
  accountId: string;
  categoryId: string | null;
};

/** How far an amount may stray from the usual one and still be "the same bill". */
const TOLERANCE_PERCENT = 15n;
const NOT_BILLS = new Set(['atmcashwithd']);

function median(values: readonly bigint[]): bigint {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

function medianNumber(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

export function detectMonthly(
  payments: readonly Payment[],
  options: { today: string; trackedNames: readonly string[]; limit?: number },
): MonthlyCandidate[] {
  const out = payments.filter((p) => p.amountMinor < 0n);
  const canonical = canonicalKeys(out.map((p) => merchantKey(p.description)));
  const tracked = options.trackedNames.map(merchantKey).filter(Boolean);

  const groups = new Map<string, Payment[]>();
  for (const p of out) {
    const key = canonical.get(merchantKey(p.description));
    if (!key || NOT_BILLS.has(key)) continue;
    const id = `${key}|${p.currency}`;
    groups.set(id, [...(groups.get(id) ?? []), p]);
  }

  const found: MonthlyCandidate[] = [];
  for (const [id, group] of groups) {
    const key = id.slice(0, id.indexOf('|'));
    if (tracked.some((t) => samePlace(t, key))) continue;
    if (group.length < 3) continue;

    const usual = median(group.map((p) => -p.amountMinor));
    const close = group
      .filter((p) => {
        const diff = -p.amountMinor - usual;
        return (diff < 0n ? -diff : diff) * 100n <= usual * TOLERANCE_PERCENT;
      })
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));

    const months = new Set(close.map((p) => p.occurredOn.slice(0, 7)));
    if (months.size < 3) continue;
    // About once a month: a weekly habit has three or four a month.
    if (close.length > months.size * 1.5) continue;
    const gaps = close.slice(1).map((p, i) => daysUntil(p.occurredOn, close[i]!.occurredOn));
    const rhythm = medianNumber(gaps);
    if (rhythm < 25 || rhythm > 36) continue;

    const last = close[close.length - 1]!;
    let next = nextDue(last.occurredOn, 'monthly');
    while (daysUntil(next, options.today) < 0) next = nextDue(next, 'monthly');

    found.push({
      key,
      name: group.reduce((a, p) => (p.description.length > a.length ? p.description : a), ''),
      amountMinor: median(close.map((p) => -p.amountMinor)),
      currency: last.currency,
      count: close.length,
      lastOn: last.occurredOn,
      nextDueOn: next,
      accountId: last.accountId,
      categoryId: last.categoryId,
    });
  }

  return found
    .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : b.amountMinor < a.amountMinor ? -1 : 0))
    .slice(0, options.limit ?? 8);
}
