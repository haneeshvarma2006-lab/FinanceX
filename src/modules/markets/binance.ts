/**
 * Binance's public market-data stream: no account, no key, only public
 * prices. `data-stream.binance.vision` is Binance's market-data-only host.
 * Each symbol's 24-hour ticker arrives about once a second.
 */

export const BINANCE_STREAM_ORIGIN = 'wss://data-stream.binance.vision';

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
