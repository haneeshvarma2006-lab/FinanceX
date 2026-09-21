import { parseAmount, toDecimalString, type Currency } from '../money/index';
import { parseDecimal, formatDecimal } from '../trading/decimal';

/**
 * Goal values, kept exact.
 *
 * A financial goal's value is integer minor units; a numeric goal's may be
 * fractional (42.5 km). One numeric column cannot hold both without rounding
 * one of them, so values are stored as strings and parsed according to the
 * goal's kind — which is the only place that knows how to read them.
 */

export type GoalKind = 'numeric' | 'financial' | 'habit' | 'milestone';

export class GoalValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoalValueError';
  }
}

/** Parse a user-entered value into the canonical stored string for this kind. */
export function normaliseValue(kind: GoalKind, raw: string, currency?: string | null): string {
  const trimmed = raw.trim();

  if (kind === 'financial') {
    if (!currency) throw new GoalValueError('A money goal needs a currency');
    // Stored as minor units, so it never passes through a float.
    return parseAmount(trimmed, currency as Currency).toString();
  }

  if (kind === 'milestone') {
    // Binary: anything non-zero is done.
    return trimmed === '0' || trimmed === '' ? '0' : '1';
  }

  // numeric and habit: an 8-decimal scaled integer, exact for fractions.
  return parseDecimal(trimmed).toString();
}

/** Render a stored value back for display. */
export function formatValue(kind: GoalKind, stored: string, currency?: string | null): string {
  const value = BigInt(stored || '0');

  if (kind === 'financial') {
    return toDecimalString(value, (currency ?? 'INR') as Currency);
  }
  if (kind === 'milestone') {
    return value > 0n ? 'Done' : 'Not yet';
  }
  return formatDecimal(value);
}

/**
 * Progress as a whole percentage, clamped to 0-100.
 *
 * Clamped because a progress bar past 100% renders as a broken bar, and
 * negative progress is not a thing a bar can show. The raw values remain
 * available for anyone who wants to display "120% of target".
 */
export function progressPercent(current: string, target: string): number {
  const c = BigInt(current || '0');
  const t = BigInt(target || '0');

  if (t <= 0n) return 0;

  const pct = Number((c * 100n) / t);
  return Math.max(0, Math.min(100, pct));
}

export function isAchieved(kind: GoalKind, current: string, target: string): boolean {
  const c = BigInt(current || '0');
  const t = BigInt(target || '0');

  if (kind === 'milestone') return c > 0n;
  return t > 0n && c >= t;
}

/**
 * The pace needed from today to finish on time.
 *
 * Returned as a plain number because it is guidance for a sentence of copy,
 * not a stored value — nothing downstream does arithmetic with it.
 */
export function requiredDailyRate(
  current: string,
  target: string,
  daysRemaining: number,
): number | null {
  if (daysRemaining <= 0) return null;

  const remaining = BigInt(target || '0') - BigInt(current || '0');
  if (remaining <= 0n) return 0;

  return Number(remaining) / daysRemaining;
}
