import { mulDiv } from '@nestedflow/domain/money';

/**
 * Recurring bills: when the next one falls due, and what each costs a month.
 * Pure functions on ISO calendar days — no clock, no time zone.
 */

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Every week',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  yearly: 'Every year',
};

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

/**
 * The due date after `day`. Months keep the day of the month where it
 * exists and fall back to the month's last day where it does not, so a bill
 * due on the 31st is due on 28 or 29 February, not in March.
 */
export function nextDue(day: string, cadence: Cadence): string {
  const [y, m, d] = parts(day);
  if (cadence === 'weekly') return iso(Date.UTC(y, m - 1, d + 7));
  const months = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12;
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(Date.UTC(year, month, Math.min(d, lastDay)));
}

/** What a bill costs per month, in minor units — for the "a month" total. */
export function monthlyEquivalent(amountMinor: bigint, cadence: Cadence): bigint {
  switch (cadence) {
    case 'weekly':
      return mulDiv(amountMinor, 52n, 12n);
    case 'monthly':
      return amountMinor;
    case 'quarterly':
      return mulDiv(amountMinor, 1n, 3n);
    case 'yearly':
      return mulDiv(amountMinor, 1n, 12n);
  }
}

/** Whole days from `today` to `day`; negative when it has passed. */
export function daysUntil(day: string, today: string): number {
  const [y1, m1, d1] = parts(today);
  const [y2, m2, d2] = parts(day);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "Due today", "Due tomorrow", "Due in 5 days", "2 days overdue". */
export function dueLabel(day: string, today: string): string {
  const days = daysUntil(day, today);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  return days === -1 ? '1 day overdue' : `${-days} days overdue`;
}

/** The first day of the month `day` falls in. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Categories offered when setting a budget — the bill reader knows these names. */
export const SUGGESTED_CATEGORIES = [
  'Food',
  'Groceries',
  'Fuel',
  'Transport',
  'Shopping',
  'Bills',
  'Rent',
  'Health',
  'Entertainment',
  'Travel',
  'Education',
  'Subscriptions',
] as const;
