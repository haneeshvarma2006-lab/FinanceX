/**
 * Binance's public market-data stream: no account, no key, only public
 * prices. `data-stream.binance.vision` is Binance's market-data-only host.
 * Each symbol's 24-hour ticker arrives about once a second.
 */

export const BINANCE_STREAM_ORIGIN = 'wss://data-stream.binance.vision';
/** The same public market data over HTTPS, for a one-off price check. */
export const BINANCE_REST_ORIGIN = 'https://data-api.binance.vision';

/** Latest prices for several symbols in one request. */
export function pricesUrl(symbols: readonly string[]): string {
  return `${BINANCE_REST_ORIGIN}/api/v3/ticker/price?symbols=${encodeURIComponent(
    JSON.stringify(symbols),
  )}`;
}

/** `[{ symbol, price }]` (or one such object) → symbol → price. */
export function parsePrices(body: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const rows = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const { symbol, price } = row as { symbol?: unknown; price?: unknown };
    const n = typeof price === 'string' || typeof price === 'number' ? Number(price) : NaN;
    if (typeof symbol === 'string' && Number.isFinite(n) && n > 0) out.set(symbol, n);
  }
  return out;
}

export type Tick = {
  /** Binance symbol, upper case: `BTCUSDT`. */
  symbol: string;
  price: number;
  /** Over the last 24 hours, as Binance reports it. */
  changePercent: number;
  high: number;
  low: number;
  /** Milliseconds, from the event itself. */
  at: number;
};

/** One combined connection for every symbol on the list. */
export function streamUrl(symbols: readonly string[]): string {
  const streams = symbols.map((s) => `${s.toLowerCase()}@ticker`).join('/');
  return `${BINANCE_STREAM_ORIGIN}/stream?streams=${streams}`;
}

function num(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A combined-stream message → a tick, or null for anything else.
 * The payload is untrusted network input, so every field is checked.
 */
export function parseTickerMessage(raw: string): Tick | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof message !== 'object' || message === null) return null;
  const data = (message as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.e !== '24hrTicker' || typeof d.s !== 'string') return null;

  const price = num(d.c);
  const changePercent = num(d.P);
  const high = num(d.h);
  const low = num(d.l);
  const at = num(d.E);
  if (price === null || changePercent === null || high === null || low === null || at === null) {
    return null;
  }
  return { symbol: d.s, price, changePercent, high, low, at };
}
