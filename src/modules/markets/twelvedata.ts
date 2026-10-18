/**
 * Twelve Data, for what the free crypto stream cannot give: spot gold and
 * silver, forex, US and Indian shares.
 *
 * Server only — the API key stays on the server, and the browser asks this
 * app, never Twelve Data. Quotes are cached for the poll interval and shared
 * by everyone who asks within it, so the provider sees one request per
 * symbol per interval however many people are watching. Which symbols a key
 * may read depends on its plan; a symbol the plan does not cover comes back
 * as an error for that symbol alone, and says so on screen.
 */

export type KeyedQuote =
  | {
      ok: true;
      price: number;
      changePercent: number | null;
      high: number | null;
      low: number | null;
      marketOpen: boolean | null;
      currency: string | null;
      /** Milliseconds. */
      at: number;
    }
  | { ok: false; error: string };

const API = 'https://api.twelvedata.com/quote';

function num(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Twelve Data's JSON → a quote, or the provider's own reason it has none. */
export function parseQuote(body: unknown, now: number): KeyedQuote {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'No data' };
  const b = body as Record<string, unknown>;
  if (b.status === 'error' || typeof b.code === 'number') {
    const message = typeof b.message === 'string' ? b.message : 'Not available';
    return { ok: false, error: friendlyError(message, b.code) };
  }
  const price = num(b.close);
  if (price === null) return { ok: false, error: 'No price yet' };
  const stamp = num(b.timestamp);
  return {
    ok: true,
    price,
    changePercent: num(b.percent_change),
    high: num(b.high),
    low: num(b.low),
    marketOpen: typeof b.is_market_open === 'boolean' ? b.is_market_open : null,
    currency: typeof b.currency === 'string' ? b.currency : null,
    at: stamp === null ? now : stamp * 1000,
  };
}

/** The provider's words, cut down to what a person can act on. */
function friendlyError(message: string, code: unknown): string {
  if (code === 429 || /credits|limit/i.test(message)) return 'Data plan limit reached';
  if (code === 401 || /api ?key/i.test(message)) return 'Data key not accepted';
  if (code === 403 || /plan|upgrade|available starting/i.test(message)) {
    return 'Not on your data plan';
  }
  if (code === 404 || /symbol/i.test(message)) return 'Symbol not found';
  return 'Not available';
}

/** `td:RELIANCE@NSE` → symbol and exchange for the request. */
export function requestFor(id: string): { symbol: string; exchange?: string } {
  const [symbol, exchange] = id.slice(3).split('@') as [string, string | undefined];
  return exchange ? { symbol, exchange } : { symbol };
}

type Cached = { at: number; quote: KeyedQuote; pending?: Promise<KeyedQuote> };
const cache = new Map<string, Cached>();

/** For tests: forget everything cached. */
export function clearQuoteCache(): void {
  cache.clear();
}

export async function keyedQuote(
  id: string,
  apiKey: string,
  ttlMs: number,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<KeyedQuote> {
  const hit = cache.get(id);
  if (hit && now - hit.at < ttlMs) return hit.pending ?? hit.quote;

  const { symbol, exchange } = requestFor(id);
  const url = new URL(API);
  url.searchParams.set('symbol', symbol);
  if (exchange) url.searchParams.set('exchange', exchange);
  url.searchParams.set('apikey', apiKey);

  const pending = (async (): Promise<KeyedQuote> => {
    try {
      const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok && body === null) return { ok: false, error: 'Provider unavailable' };
      return parseQuote(body, now);
    } catch {
      return { ok: false, error: 'Provider unavailable' };
    }
  })();

  // Concurrent askers share the one request in flight.
  cache.set(id, { at: now, quote: hit?.quote ?? { ok: false, error: 'Loading' }, pending });
  const quote = await pending;
  cache.set(id, { at: now, quote });
  return quote;
}
