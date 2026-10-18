import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '@/lib/db/client';
import { keyedQuotes, type MarketProvider } from '@/modules/markets/service';

/**
 * Keyed market prices: cached in the database for everyone, never spending
 * past the provider's allowance, and keeping the last real price — marked as
 * old — rather than going blank or inventing one.
 */

const ALPHA: MarketProvider = {
  name: 'alphavantage',
  label: 'Alpha Vantage',
  key: 'test-key-123',
  refreshSeconds: 3600,
  perMinute: 5,
  perDay: 25,
};

const quote = (price: string) =>
  Response.json({ 'Global Quote': { '05. price': price, '10. change percent': '1.5%' } });

function fetcherOf(...prices: string[]) {
  let i = 0;
  return vi.fn(async () =>
    quote(prices[Math.min(i++, prices.length - 1)]!),
  ) as unknown as typeof fetch & { mock: { calls: unknown[] } };
}

async function reset() {
  await getPool().query('truncate table market_quotes');
  await getPool().query('truncate table rate_limits');
}

const at = (iso: string) => new Date(iso);

describe('keyed market quotes', () => {
  beforeEach(reset);

  it('asks the provider once per refresh, however many times it is asked', async () => {
    const fetcher = fetcherOf('256.60');
    const first = await keyedQuotes(['td:AAPL'], ALPHA, at('2026-10-18T10:00:00Z'), fetcher);
    const again = await keyedQuotes(['td:AAPL'], ALPHA, at('2026-10-18T10:30:00Z'), fetcher);

    expect(fetcher.mock.calls).toHaveLength(1);
    expect(first['td:AAPL']).toMatchObject({
      ok: true,
      price: 256.6,
      changePercent: 1.5,
      stale: false,
    });
    expect(again['td:AAPL']).toMatchObject({ ok: true, price: 256.6 });

    // Past the refresh interval, it asks again.
    await keyedQuotes(['td:AAPL'], ALPHA, at('2026-10-18T11:00:01Z'), fetcher);
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it('never spends past the per-minute allowance', async () => {
    const fetcher = fetcherOf('100');
    const tight = { ...ALPHA, perMinute: 2 };
    const result = await keyedQuotes(
      ['td:AAPL', 'td:NVDA', 'td:TSLA'],
      tight,
      at('2026-10-18T10:00:00Z'),
      fetcher,
    );
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(result['td:TSLA']).toEqual({ ok: false, error: 'Updating shortly' });

    // The next minute, the one left out is fetched.
    await keyedQuotes(['td:TSLA'], tight, at('2026-10-18T10:01:30Z'), fetcher);
    expect(fetcher.mock.calls).toHaveLength(3);
  });

  it('keeps the last real price, marked old, once the day is spent', async () => {
    const fetcher = fetcherOf('4081.76', '4090.00');
    const oneADay = { ...ALPHA, perDay: 1, refreshSeconds: 60 };

    await keyedQuotes(['td:AAPL'], oneADay, at('2026-10-18T10:00:00Z'), fetcher);
    const later = await keyedQuotes(['td:AAPL'], oneADay, at('2026-10-18T12:00:00Z'), fetcher);

    expect(fetcher.mock.calls).toHaveLength(1);
    expect(later['td:AAPL']).toMatchObject({
      ok: true,
      price: 4081.76,
      stale: true,
      note: "Today's data limit reached",
    });
  });

  it('keeps the last real price when the provider refuses', async () => {
    let call = 0;
    const fetcher = vi.fn(async () =>
      call++ === 0
        ? Response.json({ 'Realtime Currency Exchange Rate': { '5. Exchange Rate': '84.10' } })
        : Response.json({ Information: 'Our standard API rate limit is 25 requests per day.' }),
    ) as unknown as typeof fetch;
    const fast = { ...ALPHA, refreshSeconds: 60 };

    await keyedQuotes(['td:USD/INR'], fast, at('2026-10-18T10:00:00Z'), fetcher);
    const refused = await keyedQuotes(['td:USD/INR'], fast, at('2026-10-18T10:05:00Z'), fetcher);
    expect(refused['td:USD/INR']).toMatchObject({
      ok: true,
      price: 84.1,
      stale: true,
      note: 'Data plan limit reached',
    });

    // Within the interval after a refusal, it does not ask again.
    await keyedQuotes(['td:USD/INR'], fast, at('2026-10-18T10:05:30Z'), fetcher);
    expect(call).toBe(2);
  });

  it('says plainly when there has never been a price', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ 'Error Message': 'Invalid API call.' }),
    ) as unknown as typeof fetch;
    const result = await keyedQuotes(['td:NOPE'], ALPHA, at('2026-10-18T10:00:00Z'), fetcher);
    expect(result['td:NOPE']).toEqual({ ok: false, error: 'Symbol not found' });
  });
});
