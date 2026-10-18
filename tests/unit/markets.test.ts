import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  binanceIdFor,
  cleanWatchlist,
  formatPrice,
  isInstrumentId,
  MAX_KEYED,
  resolveInstrument,
} from '@/modules/markets/catalog';
import { parseTickerMessage, streamUrl } from '@/modules/markets/binance';
import { clearQuoteCache, keyedQuote, parseQuote, requestFor } from '@/modules/markets/twelvedata';

const ticker = (data: Record<string, unknown>) =>
  JSON.stringify({
    stream: 'btcusdt@ticker',
    data: { e: '24hrTicker', E: 1_790_000_000_000, ...data },
  });

describe('Binance stream', () => {
  it('opens one combined stream for every symbol', () => {
    expect(streamUrl(['BTCUSDT', 'PAXGUSDT'])).toBe(
      'wss://data-stream.binance.vision/stream?streams=btcusdt@ticker/paxgusdt@ticker',
    );
  });

  it('reads a 24h ticker into a tick', () => {
    expect(
      parseTickerMessage(
        ticker({ s: 'BTCUSDT', c: '67000.50', P: '-1.25', h: '68000', l: '66000' }),
      ),
    ).toEqual({
      symbol: 'BTCUSDT',
      price: 67000.5,
      changePercent: -1.25,
      high: 68000,
      low: 66000,
      at: 1_790_000_000_000,
    });
  });

  it('ignores anything that is not a well-formed ticker', () => {
    expect(parseTickerMessage('not json')).toBeNull();
    expect(parseTickerMessage(JSON.stringify({ result: null, id: 1 }))).toBeNull();
    expect(
      parseTickerMessage(ticker({ s: 'BTCUSDT', c: 'abc', P: '1', h: '1', l: '1' })),
    ).toBeNull();
    expect(
      parseTickerMessage(JSON.stringify({ data: { e: 'trade', s: 'BTCUSDT', c: '1' } })),
    ).toBeNull();
  });
});

describe('the catalogue', () => {
  it('accepts only well-formed ids, since they come from browser storage', () => {
    expect(isInstrumentId('bn:BTCUSDT')).toBe(true);
    expect(isInstrumentId('td:XAU/USD')).toBe(true);
    expect(isInstrumentId('td:RELIANCE@NSE')).toBe(true);
    expect(isInstrumentId('bn:btc<script>')).toBe(false);
    expect(isInstrumentId('td:../../etc')).toBe(false);
    expect(isInstrumentId('http://x')).toBe(false);
  });

  it('cleans a stored list: no junk, no repeats, a cap on keyed symbols', () => {
    const keyed = Array.from({ length: MAX_KEYED + 3 }, (_, i) => `td:SYM${i}`);
    const cleaned = cleanWatchlist(['bn:BTCUSDT', 'bn:BTCUSDT', 42, 'nope', ...keyed]);
    expect(cleaned[0]).toBe('bn:BTCUSDT');
    expect(cleaned.filter((id) => id.startsWith('td:'))).toHaveLength(MAX_KEYED);
    expect(cleaned).not.toContain('nope');
  });

  it('turns a typed coin into a Binance USDT pair', () => {
    expect(binanceIdFor(' doge ')).toBe('bn:DOGEUSDT');
    expect(binanceIdFor('PEPEUSDT')).toBe('bn:PEPEUSDT');
    expect(binanceIdFor('x')).toBeNull();
    expect(resolveInstrument('bn:PEPEUSDT')).toMatchObject({ label: 'PEPE', ticker: 'PEPE/USDT' });
    expect(resolveInstrument('td:WIPRO@NSE')).toMatchObject({ kind: 'india', feed: 'keyed' });
  });

  it('shows as many digits as the price needs', () => {
    expect(formatPrice(4081.756, 'en-US')).toBe('4,081.76');
    expect(formatPrice(1.08347, 'en-US')).toBe('1.0835');
    expect(formatPrice(0.00001234, 'en-US')).toBe('0.00001234');
  });
});

describe('Twelve Data quotes', () => {
  afterEach(() => clearQuoteCache());

  it('reads a quote', () => {
    expect(
      parseQuote(
        {
          symbol: 'XAU/USD',
          close: '4081.76',
          percent_change: '0.42',
          high: '4090',
          low: '4060',
          is_market_open: true,
          timestamp: 1_790_000_000,
          currency: 'USD',
        },
        0,
      ),
    ).toEqual({
      ok: true,
      price: 4081.76,
      changePercent: 0.42,
      high: 4090,
      low: 4060,
      marketOpen: true,
      currency: 'USD',
      at: 1_790_000_000_000,
    });
  });

  it('turns provider errors into something a person can act on', () => {
    expect(
      parseQuote({ code: 429, message: 'You have run out of API credits', status: 'error' }, 0),
    ).toEqual({
      ok: false,
      error: 'Data plan limit reached',
    });
    expect(
      parseQuote({ code: 401, message: '**apikey** parameter is incorrect', status: 'error' }, 0),
    ).toEqual({
      ok: false,
      error: 'Data key not accepted',
    });
    expect(parseQuote({ code: 404, message: 'symbol not found', status: 'error' }, 0)).toEqual({
      ok: false,
      error: 'Symbol not found',
    });
  });

  it('splits an exchange off the symbol', () => {
    expect(requestFor('td:RELIANCE@NSE')).toEqual({ symbol: 'RELIANCE', exchange: 'NSE' });
    expect(requestFor('td:XAU/USD')).toEqual({ symbol: 'XAU/USD' });
  });

  it('asks the provider once per symbol per interval, however many ask', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ close: '4081.76', percent_change: '0.1' }),
    ) as unknown as typeof fetch;

    const [a, b] = await Promise.all([
      keyedQuote('td:XAU/USD', 'secret-key', 60_000, 1_000, fetcher),
      keyedQuote('td:XAU/USD', 'secret-key', 60_000, 1_000, fetcher),
    ]);
    await keyedQuote('td:XAU/USD', 'secret-key', 60_000, 30_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);

    await keyedQuote('td:XAU/USD', 'secret-key', 60_000, 62_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const url = (fetcher as unknown as { mock: { calls: [URL][] } }).mock.calls[0]![0];
    expect(url.searchParams.get('symbol')).toBe('XAU/USD');
  });

  it('survives the provider being down', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    expect(await keyedQuote('td:EUR/USD', 'k', 60_000, 0, fetcher)).toEqual({
      ok: false,
      error: 'Provider unavailable',
    });
  });
});
