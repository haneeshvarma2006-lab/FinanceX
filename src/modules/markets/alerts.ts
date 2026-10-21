/**
 * Price alerts: when one fires. Pure, so the browser that watches and the
 * server that records agree on the same rule.
 */

export type AlertDirection = 'above' | 'below';

/** At or past the line counts: "above 4,100" fires at 4,100.00. */
export function crosses(direction: AlertDirection, target: number, price: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  return direction === 'above' ? price >= target : price <= target;
}

/**
 * A price someone typed: "4,100.50" → "4100.50". Decimal text all the way to
 * the database, never a float in between.
 */
export function cleanPrice(input: string): string | null {
  const text = input.trim().replace(/[,\s]/g, '');
  if (!/^\d{1,20}(\.\d{1,10})?$/.test(text)) return null;
  if (/^0+(\.0+)?$/.test(text)) return null;
  return text.replace(/^0+(?=\d)/, '');
}
