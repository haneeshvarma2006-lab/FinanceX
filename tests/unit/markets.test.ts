import { describe, expect, it, vi } from 'vitest';
import {
  binanceIdFor,
  cleanWatchlist,
  formatPrice,
  isInstrumentId,
  MAX_KEYED,
  resolveInstrument,
} from '@/modules/markets/catalog';
import { parseTickerMessage, streamUrl } from '@/modules/markets/binance';
import { fetchTwelveData, parseQuote, requestFor } from '@/modules/markets/twelvedata';
import {
  alphaRequestFor,
  alphaUrl,
  fetchAlphaVantage,
  parseExchangeRate,
  parseGlobalQuote,
  parseSpot,
} from '@/modules/markets/alphavantage';

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
      limited: true,
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

  it('asks with the symbol and exchange, and the key only as a parameter', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ close: '2950.10' }),
    ) as unknown as typeof fetch;
    const quote = await fetchTwelveData('td:RELIANCE@NSE', 'secret-key', 5, fetcher);
    expect(quote).toMatchObject({ ok: true, price: 2950.1, at: 5 });
    const url = (fetcher as unknown as { mock: { calls: [URL][] } }).mock.calls[0]![0];
    expect(url.searchParams.get('symbol')).toBe('RELIANCE');
    expect(url.searchParams.get('exchange')).toBe('NSE');
    expect(url.searchParams.get('apikey')).toBe('secret-key');
  });

  it('survives the provider being down', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    expect(await fetchTwelveData('td:EUR/USD', 'k', 0, fetcher)).toEqual({
      ok: false,
      error: 'Provider unavailable',
    });
  });
});

describe('Alpha Vantage', () => {
  it('picks the right function for each kind of market', () => {
    expect(alphaRequestFor('td:XAU/USD')).toEqual({ fn: 'GOLD_SILVER_SPOT', symbol: 'XAU' });
    expect(alphaRequestFor('td:XAG/USD')).toEqual({ fn: 'GOLD_SILVER_SPOT', symbol: 'XAG' });
    expect(alphaRequestFor('td:EUR/USD')).toEqual({
      fn: 'CURRENCY_EXCHANGE_RATE',
      from: 'EUR',
      to: 'USD',
    });
    expect(alphaRequestFor('td:RELIANCE@NSE')).toEqual({
      fn: 'GLOBAL_QUOTE',
      symbol: 'RELIANCE.BSE',
    });
    expect(alphaRequestFor('td:AAPL')).toEqual({ fn: 'GLOBAL_QUOTE', symbol: 'AAPL' });

    const url = alphaUrl(alphaRequestFor('td:USD/INR'), 'k123');
    expect(url.origin + url.pathname).toBe('https://www.alphavantage.co/query');
    expect(url.searchParams.get('function')).toBe('CURRENCY_EXCHANGE_RATE');
    expect(url.searchParams.get('from_currency')).toBe('USD');
    expect(url.searchParams.get('to_currency')).toBe('INR');
  });

  it('reads a global quote, including its percent sign', () => {
    expect(
      parseGlobalQuote(
        {
          'Global Quote': {
            '01. symbol': 'AAPL',
            '03. high': '258.10',
            '04. low': '254.20',
            '05. price': '256.6000',
            '10. change percent': '-3.0271%',
          },
        },
        7,
      ),
    ).toEqual({
      ok: true,
      price: 256.6,
      changePercent: -3.0271,
      high: 258.1,
      low: 254.2,
      marketOpen: null,
      currency: null,
      at: 7,
    });
    expect(parseGlobalQuote({ 'Global Quote': {} }, 0)).toEqual({
      ok: false,
      error: 'Symbol not found',
    });
  });

  it('reads an exchange rate and its UTC refresh time', () => {
    const quote = parseExchangeRate(
      {
        'Realtime Currency Exchange Rate': {
          '1. From_Currency Code': 'USD',
          '3. To_Currency Code': 'INR',
          '5. Exchange Rate': '84.12500000',
          '6. Last Refreshed': '2026-10-18 10:15:01',
          '7. Time Zone': 'UTC',
        },
      },
      0,
    );
    expect(quote).toMatchObject({ ok: true, price: 84.125, currency: 'INR' });
    expect(quote.ok && quote.at).toBe(Date.parse('2026-10-18T10:15:01Z'));
  });

  it('finds the spot price wherever the metals endpoint puts it', () => {
    expect(
      parseSpot({ symbol: 'XAU', price: '4081.76', timestamp: '2026-10-18' }, 0),
    ).toMatchObject({
      ok: true,
      price: 4081.76,
    });
    expect(parseSpot({ data: [{ spot_price: 32.5 }] }, 0)).toMatchObject({ ok: true, price: 32.5 });
    expect(parseSpot({ symbol: 'XAU' }, 0)).toEqual({ ok: false, error: 'No price yet' });
  });

  it('recognises the limit and plan messages it sends as a 200', () => {
    expect(
      parseGlobalQuote(
        {
          Information:
            'We have detected your API key as XXXX and our standard API rate limit is 25 requests per day.',
        },
        0,
      ),
    ).toEqual({ ok: false, error: 'Data plan limit reached', limited: true });
    expect(
      parseSpot({ Information: 'This is a premium endpoint. Subscribe to a premium plan.' }, 0),
    ).toEqual({ ok: false, error: 'Not on your data plan' });
    expect(parseGlobalQuote({ 'Error Message': 'Invalid API call.' }, 0)).toEqual({
      ok: false,
      error: 'Symbol not found',
    });
  });

  it('never throws on a bad answer', async () => {
    const broken = vi.fn(async () => new Response('<html>')) as unknown as typeof fetch;
    expect(await fetchAlphaVantage('td:XAU/USD', 'k', 0, broken)).toEqual({
      ok: false,
      error: 'Provider unavailable',
    });
  });
});
