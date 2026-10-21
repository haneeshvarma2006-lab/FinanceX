import type { Instrument } from './catalog';

/**
 * Valuing holdings at live prices. Display arithmetic only: these numbers
 * are shown, never stored or posted to the ledger.
 */

export const GRAMS_PER_TROY_OUNCE = 31.1034768;

export type HoldingUnit = 'unit' | 'gram' | 'ounce';

export function isMetal(instrumentId: string): boolean {
  return instrumentId === 'td:XAU/USD' || instrumentId === 'td:XAG/USD';
}

/** The currency an instrument's price is in. USDT is counted as USD. */
export function quoteCurrency(instrument: Instrument): string {
  if (instrument.feed === 'binance') {
    const symbol = instrument.id.slice(3);
    if (/(USDT|USDC|FDUSD)$/.test(symbol)) return 'USD';
    if (symbol.endsWith('BTC')) return 'BTC';
    if (symbol.endsWith('ETH')) return 'ETH';
    return 'USD';
  }
  if (instrument.kind === 'india') return 'INR';
  if (instrument.kind === 'forex') return instrument.ticker.split('/')[1] ?? 'USD';
  return 'USD';
}

/** Price per the holding's unit: metals are quoted per troy ounce. */
export function pricePerUnit(price: number, instrumentId: string, unit: HoldingUnit): number {
  if (isMetal(instrumentId) && unit === 'gram') return price / GRAMS_PER_TROY_OUNCE;
  return price;
}

export type Valuation = {
  value: number;
  cost: number | null;
  gain: number | null;
  gainPercent: number | null;
};

export function valueHolding(
  holding: { quantity: number; unit: HoldingUnit; averagePrice: number | null },
  instrumentId: string,
  price: number,
): Valuation {
  const value = holding.quantity * pricePerUnit(price, instrumentId, holding.unit);
  if (holding.averagePrice === null) return { value, cost: null, gain: null, gainPercent: null };
  const cost = holding.quantity * holding.averagePrice;
  const gain = value - cost;
  return { value, cost, gain, gainPercent: cost > 0 ? (gain / cost) * 100 : null };
}

/** Sums by currency, and in the home currency when there is a rate for it. */
export function totals(
  rows: { currency: string; value: number; cost: number | null }[],
  home: string,
  usdToHome: number | null,
): {
  byCurrency: Map<string, { value: number; cost: number; costKnown: boolean }>;
  inHome: number | null;
} {
  const byCurrency = new Map<string, { value: number; cost: number; costKnown: boolean }>();
  for (const row of rows) {
    const t = byCurrency.get(row.currency) ?? { value: 0, cost: 0, costKnown: true };
    t.value += row.value;
    if (row.cost === null) t.costKnown = false;
    else t.cost += row.cost;
    byCurrency.set(row.currency, t);
  }
  let inHome = 0;
  let convertible = rows.length > 0;
  for (const [currency, t] of byCurrency) {
    if (currency === home) inHome += t.value;
    else if (currency === 'USD' && usdToHome !== null) inHome += t.value * usdToHome;
    else convertible = false;
  }
  return { byCurrency, inHome: convertible ? inHome : null };
}

/** ₹1,23,456.78 / $4,081.76 — a currency code it cannot format is spelt out. */
export function formatValue(value: number, currency: string, locale = 'en-IN'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: Math.abs(value) >= 1 ? 2 : 6,
    }).format(value);
  } catch {
    return `${value.toFixed(6)} ${currency}`;
  }
}
