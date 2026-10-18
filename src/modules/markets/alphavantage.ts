/**
 * Alpha Vantage, for spot gold and silver, forex and shares.
 *
 * Server only: the key is sent from this server, never from a browser. Each
 * instrument maps to one of three Alpha Vantage functions:
 *
 * - gold and silver → GOLD_SILVER_SPOT (symbol XAU or XAG)
 * - forex           → CURRENCY_EXCHANGE_RATE
 * - shares          → GLOBAL_QUOTE; Indian shares as BSE listings
 *                     (`RELIANCE.BSE`), the Indian exchange Alpha Vantage
 *                     carries.
 *
 * Responses are parsed defensively — numbered keys for quotes and forex as
 * Alpha Vantage documents them, and a tolerant reading for the metals
 * endpoint, whose exact field names were not available to check against.
 * Anything that does not yield a finite price is reported as no price, never
 * filled in.
 */

import type { ProviderQuote } from './provider';

const API = 'https://www.alphavantage.co/query';

export type AlphaRequest =
  | { fn: 'GOLD_SILVER_SPOT'; symbol: 'XAU' | 'XAG' }
  | { fn: 'CURRENCY_EXCHANGE_RATE'; from: string; to: string }
  | { fn: 'GLOBAL_QUOTE'; symbol: string };

/** `td:XAU/USD`, `td:EUR/USD`, `td:RELIANCE@NSE`, `td:AAPL` → a request. */
export function alphaRequestFor(id: string): AlphaRequest {
  const [symbol, exchange] = id.slice(3).split('@') as [string, string | undefined];
  if (symbol === 'XAU/USD' || symbol === 'XAG/USD') {
    return { fn: 'GOLD_SILVER_SPOT', symbol: symbol.startsWith('XAU') ? 'XAU' : 'XAG' };
  }
  if (symbol.includes('/')) {
    const [from, to] = symbol.split('/') as [string, string];
    return { fn: 'CURRENCY_EXCHANGE_RATE', from, to };
  }
  if (exchange === 'NSE' || exchange === 'BSE')
    return { fn: 'GLOBAL_QUOTE', symbol: `${symbol}.BSE` };
  return { fn: 'GLOBAL_QUOTE', symbol };
}

export function alphaUrl(request: AlphaRequest, apiKey: string): URL {
  const url = new URL(API);
  url.searchParams.set('function', request.fn);
  if (request.fn === 'CURRENCY_EXCHANGE_RATE') {
    url.searchParams.set('from_currency', request.from);
    url.searchParams.set('to_currency', request.to);
  } else {
    url.searchParams.set('symbol', request.symbol);
  }
  url.searchParams.set('apikey', apiKey);
  return url;
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/%$/, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Alpha Vantage reports trouble as a 200 with one of these keys. */
function providerTrouble(body: Record<string, unknown>): ProviderQuote | null {
  const message = [body['Error Message'], body.Note, body.Information].find(
    (m): m is string => typeof m === 'string',
  );
  if (!message) return null;
  if (/premium|subscribe|plan/i.test(message) && !/rate limit|requests per day/i.test(message)) {
    return { ok: false, error: 'Not on your data plan' };
  }
  if (/rate limit|requests per (day|minute)|call frequency|limit/i.test(message)) {
    return { ok: false, error: 'Data plan limit reached', limited: true };
  }
  if (/api ?key/i.test(message)) return { ok: false, error: 'Data key not accepted' };
  if (body['Error Message']) return { ok: false, error: 'Symbol not found' };
  return { ok: false, error: 'Not available' };
}

/** "2026-10-18 10:15:01" in the stated zone → milliseconds, if it is UTC. */
function refreshedAt(stamp: unknown, zone: unknown, fallback: number): number {
  if (typeof stamp !== 'string' || zone !== 'UTC') return fallback;
  const ms = Date.parse(`${stamp.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : fallback;
}

export function parseGlobalQuote(body: unknown, now: number): ProviderQuote {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'No data' };
  const trouble = providerTrouble(body as Record<string, unknown>);
  if (trouble) return trouble;
  const q = (body as Record<string, unknown>)['Global Quote'];
  if (typeof q !== 'object' || q === null || Object.keys(q).length === 0) {
    return { ok: false, error: 'Symbol not found' };
  }
  const g = q as Record<string, unknown>;
  const price = num(g['05. price']);
  if (price === null) return { ok: false, error: 'No price yet' };
  return {
    ok: true,
    price,
    changePercent: num(g['10. change percent']),
    high: num(g['03. high']),
    low: num(g['04. low']),
    marketOpen: null,
    currency: null,
    at: now,
  };
}

export function parseExchangeRate(body: unknown, now: number): ProviderQuote {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'No data' };
  const trouble = providerTrouble(body as Record<string, unknown>);
  if (trouble) return trouble;
  const r = (body as Record<string, unknown>)['Realtime Currency Exchange Rate'];
  if (typeof r !== 'object' || r === null) return { ok: false, error: 'Symbol not found' };
  const x = r as Record<string, unknown>;
  const price = num(x['5. Exchange Rate']);
  if (price === null) return { ok: false, error: 'No price yet' };
  return {
    ok: true,
    price,
    changePercent: null,
    high: null,
    low: null,
    marketOpen: null,
    currency:
      typeof x['3. To_Currency Code'] === 'string' ? (x['3. To_Currency Code'] as string) : null,
    at: refreshedAt(x['6. Last Refreshed'], x['7. Time Zone'], now),
  };
}

const PRICE_KEY = /(^|\b|_)(price|spot|value|rate)(\b|_|$)/i;

/** The first plausible price in an object, searching a few levels deep. */
function findPrice(value: unknown, depth = 0): number | null {
  if (depth > 3 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPrice(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, v] of entries) {
    if (PRICE_KEY.test(key) && !/change|percent|volume/i.test(key)) {
      const n = num(v);
      if (n !== null && n > 0) return n;
    }
  }
  for (const [, v] of entries) {
    const found = findPrice(v, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

export function parseSpot(body: unknown, now: number): ProviderQuote {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'No data' };
  const trouble = providerTrouble(body as Record<string, unknown>);
  if (trouble) return trouble;
  const price = findPrice(body);
  if (price === null) return { ok: false, error: 'No price yet' };
  return {
    ok: true,
    price,
    changePercent: null,
    high: null,
    low: null,
    marketOpen: null,
    currency: 'USD',
    at: now,
  };
}

export async function fetchAlphaVantage(
  id: string,
  apiKey: string,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<ProviderQuote> {
  const request = alphaRequestFor(id);
  try {
    const response = await fetcher(alphaUrl(request, apiKey), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (body === null) return { ok: false, error: 'Provider unavailable' };
    if (request.fn === 'GOLD_SILVER_SPOT') return parseSpot(body, now);
    if (request.fn === 'CURRENCY_EXCHANGE_RATE') return parseExchangeRate(body, now);
    return parseGlobalQuote(body, now);
  } catch {
    return { ok: false, error: 'Provider unavailable' };
  }
}
