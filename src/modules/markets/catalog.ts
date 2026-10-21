/**
 * What the Live markets screen can show, and where each price comes from.
 *
 * Two feeds, chosen by what is honestly available:
 *
 * - `binance` — Binance's public market-data stream. Free, no key, and truly
 *   live (an update about every second). Crypto only. Opened straight from
 *   the browser.
 * - `keyed` — a market-data provider that needs an API key (Twelve Data).
 *   Spot gold and silver, forex, US and Indian shares. Fetched by the server
 *   so the key never reaches a browser, and polled rather than streamed:
 *   free plans allow a few requests a minute, not a live stream.
 *
 * Every price shown is one the feed sent. Nothing here is a stand-in value.
 */

export type MarketKind = 'crypto' | 'metal' | 'forex' | 'india' | 'us';
export type Feed = 'binance' | 'keyed';

export type Instrument = {
  /** Stable id: `bn:BTCUSDT`, `td:XAU/USD`, `td:RELIANCE@NSE`. */
  id: string;
  label: string;
  /** The symbol as a trader would write it. */
  ticker: string;
  kind: MarketKind;
  feed: Feed;
  /** Shown under the name where the instrument needs explaining. */
  note?: string;
};

export const KIND_LABEL: Record<MarketKind, string> = {
  crypto: 'Crypto',
  metal: 'Gold & silver',
  forex: 'Forex',
  india: 'India (NSE)',
  us: 'US stocks',
};

export const CATALOG: readonly Instrument[] = [
  { id: 'bn:BTCUSDT', label: 'Bitcoin', ticker: 'BTC/USDT', kind: 'crypto', feed: 'binance' },
  { id: 'bn:ETHUSDT', label: 'Ethereum', ticker: 'ETH/USDT', kind: 'crypto', feed: 'binance' },
  { id: 'bn:SOLUSDT', label: 'Solana', ticker: 'SOL/USDT', kind: 'crypto', feed: 'binance' },
  { id: 'bn:BNBUSDT', label: 'BNB', ticker: 'BNB/USDT', kind: 'crypto', feed: 'binance' },
  { id: 'bn:XRPUSDT', label: 'XRP', ticker: 'XRP/USDT', kind: 'crypto', feed: 'binance' },
  { id: 'bn:DOGEUSDT', label: 'Dogecoin', ticker: 'DOGE/USDT', kind: 'crypto', feed: 'binance' },
  {
    id: 'bn:PAXGUSDT',
    label: 'Gold token',
    ticker: 'PAXG/USDT',
    kind: 'crypto',
    feed: 'binance',
    note: 'A gold-backed token. Follows gold closely, but it is not the spot gold price.',
  },
  { id: 'td:XAU/USD', label: 'Gold', ticker: 'XAU/USD', kind: 'metal', feed: 'keyed' },
  { id: 'td:XAG/USD', label: 'Silver', ticker: 'XAG/USD', kind: 'metal', feed: 'keyed' },
  { id: 'td:EUR/USD', label: 'Euro', ticker: 'EUR/USD', kind: 'forex', feed: 'keyed' },
  { id: 'td:GBP/USD', label: 'Pound', ticker: 'GBP/USD', kind: 'forex', feed: 'keyed' },
  { id: 'td:USD/JPY', label: 'Yen', ticker: 'USD/JPY', kind: 'forex', feed: 'keyed' },
  { id: 'td:USD/INR', label: 'Rupee', ticker: 'USD/INR', kind: 'forex', feed: 'keyed' },
  { id: 'td:RELIANCE@NSE', label: 'Reliance', ticker: 'RELIANCE', kind: 'india', feed: 'keyed' },
  { id: 'td:TCS@NSE', label: 'TCS', ticker: 'TCS', kind: 'india', feed: 'keyed' },
  { id: 'td:HDFCBANK@NSE', label: 'HDFC Bank', ticker: 'HDFCBANK', kind: 'india', feed: 'keyed' },
  { id: 'td:INFY@NSE', label: 'Infosys', ticker: 'INFY', kind: 'india', feed: 'keyed' },
  { id: 'td:AAPL', label: 'Apple', ticker: 'AAPL', kind: 'us', feed: 'keyed' },
  { id: 'td:NVDA', label: 'Nvidia', ticker: 'NVDA', kind: 'us', feed: 'keyed' },
  { id: 'td:TSLA', label: 'Tesla', ticker: 'TSLA', kind: 'us', feed: 'keyed' },
  { id: 'td:SPY', label: 'S&P 500 ETF', ticker: 'SPY', kind: 'us', feed: 'keyed' },
];

export const DEFAULT_WATCHLIST: readonly string[] = [
  'bn:BTCUSDT',
  'bn:ETHUSDT',
  'bn:PAXGUSDT',
  'td:XAU/USD',
  'td:EUR/USD',
  'td:RELIANCE@NSE',
];

/** The most keyed instruments one screen polls — free plans count each one. */
export const MAX_KEYED = 6;
export const MAX_WATCHLIST = 24;

const BINANCE_ID = /^bn:[A-Z0-9]{2,20}$/;
const KEYED_ID = /^td:[A-Z0-9][A-Z0-9./-]{0,19}(@[A-Z]{2,10})?$/;

/** Ids come from browser storage and query strings, so they are checked. */
export function isInstrumentId(id: string): boolean {
  return BINANCE_ID.test(id) || KEYED_ID.test(id);
}

/** A catalogue entry, or a well-formed custom one; otherwise nothing. */
export function resolveInstrument(id: string): Instrument | null {
  const known = CATALOG.find((i) => i.id === id);
  if (known) return known;
  if (BINANCE_ID.test(id)) {
    const symbol = id.slice(3);
    const base = symbol.replace(/(USDT|USDC|FDUSD|BTC|ETH)$/, '');
    return {
      id,
      label: base || symbol,
      ticker: base && base !== symbol ? `${base}/${symbol.slice(base.length)}` : symbol,
      kind: 'crypto',
      feed: 'binance',
    };
  }
  if (KEYED_ID.test(id)) {
    const [symbol, exchange] = id.slice(3).split('@') as [string, string | undefined];
    return {
      id,
      label: symbol,
      ticker: symbol,
      kind:
        exchange === 'NSE' || exchange === 'BSE' ? 'india' : symbol.includes('/') ? 'forex' : 'us',
      feed: 'keyed',
    };
  }
  return null;
}

/** A crypto coin the user types — "doge", "PEPE" — as a Binance USDT pair. */
export function binanceIdFor(input: string): string | null {
  const clean = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (clean.length < 2 || clean.length > 16) return null;
  return `bn:${clean.endsWith('USDT') ? clean : `${clean}USDT`}`;
}

/** Keeps a stored list usable: known-good ids, no repeats, within limits. */
export function cleanWatchlist(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  let keyed = 0;
  for (const id of ids) {
    if (typeof id !== 'string' || !isInstrumentId(id) || out.includes(id)) continue;
    if (id.startsWith('td:')) {
      if (keyed >= MAX_KEYED) continue;
      keyed += 1;
    }
    out.push(id);
    if (out.length >= MAX_WATCHLIST) break;
  }
  return out;
}

/** Digits to show: a ₹-sized number needs two, a meme coin needs eight. */
export function formatPrice(price: number, locale = 'en-IN'): string {
  const abs = Math.abs(price);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: abs >= 1000 ? 2 : Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(price);
}

/** A quantity held: "10", "0.5", "0.00012345" — no padding zeros. */
export function formatQuantity(quantity: number, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(quantity);
}
