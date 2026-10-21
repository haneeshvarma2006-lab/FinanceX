import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  dueLabel,
  monthlyEquivalent,
  monthStart,
  nextDue,
} from '@/modules/finance/recurring';
import { cleanPrice, crosses } from '@/modules/markets/alerts';
import { cleanObserved } from '@/modules/markets/alert-service';
import { parsePrices, pricesUrl } from '@/modules/markets/binance';
import {
  GRAMS_PER_TROY_OUNCE,
  quoteCurrency,
  totals,
  valueHolding,
} from '@/modules/markets/portfolio';
import { resolveInstrument } from '@/modules/markets/catalog';

describe('recurring bills', () => {
  it('moves each cadence on by one period', () => {
    expect(nextDue('2026-10-18', 'weekly')).toBe('2026-10-25');
    expect(nextDue('2026-10-18', 'monthly')).toBe('2026-11-18');
    expect(nextDue('2026-11-30', 'quarterly')).toBe('2027-02-28');
    expect(nextDue('2026-10-18', 'yearly')).toBe('2027-10-18');
    expect(nextDue('2026-12-15', 'monthly')).toBe('2027-01-15');
  });

  it('keeps a month-end bill inside the shorter month', () => {
    expect(nextDue('2027-01-31', 'monthly')).toBe('2027-02-28');
    expect(nextDue('2028-01-31', 'monthly')).toBe('2028-02-29');
  });

  it('works out what each costs a month, exactly', () => {
    expect(monthlyEquivalent(64900n, 'monthly')).toBe(64900n);
    expect(monthlyEquivalent(120000n, 'yearly')).toBe(10000n);
    expect(monthlyEquivalent(30000n, 'quarterly')).toBe(10000n);
    expect(monthlyEquivalent(1200n, 'weekly')).toBe(5200n);
  });

  it('says when a bill is due in words', () => {
    expect(daysUntil('2026-10-21', '2026-10-18')).toBe(3);
    expect(dueLabel('2026-10-18', '2026-10-18')).toBe('Due today');
    expect(dueLabel('2026-10-19', '2026-10-18')).toBe('Due tomorrow');
    expect(dueLabel('2026-10-25', '2026-10-18')).toBe('Due in 7 days');
    expect(dueLabel('2026-10-17', '2026-10-18')).toBe('1 day overdue');
    expect(dueLabel('2026-10-10', '2026-10-18')).toBe('8 days overdue');
    expect(monthStart('2026-10-18')).toBe('2026-10-01');
  });
});

describe('price alerts', () => {
  it('fires at or past the line, never on a bad price', () => {
    expect(crosses('above', 4100, 4100)).toBe(true);
    expect(crosses('above', 4100, 4099.99)).toBe(false);
    expect(crosses('below', 60000, 59999)).toBe(true);
    expect(crosses('below', 60000, 60001)).toBe(false);
    expect(crosses('above', 1, Number.NaN)).toBe(false);
    expect(crosses('below', 1, 0)).toBe(false);
  });

  it('keeps typed prices as decimal text', () => {
    expect(cleanPrice('4,100.50')).toBe('4100.50');
    expect(cleanPrice(' 0.00001234 ')).toBe('0.00001234');
    expect(cleanPrice('007')).toBe('7');
    expect(cleanPrice('0')).toBeNull();
    expect(cleanPrice('-5')).toBeNull();
    expect(cleanPrice('1e5')).toBeNull();
    expect(cleanPrice('abc')).toBeNull();
  });

  it('trusts the browser only with well-formed crypto prices', () => {
    const observed = cleanObserved({
      'bn:BTCUSDT': 67000.5,
      'bn:ETHUSDT': '3400',
      'td:XAU/USD': 4100,
      'bn:<script>': 1,
      'bn:DOGEUSDT': -1,
      'bn:SOLUSDT': Number.POSITIVE_INFINITY,
    });
    expect([...observed]).toEqual([
      ['bn:BTCUSDT', 67000.5],
      ['bn:ETHUSDT', 3400],
    ]);
    expect(cleanObserved('nope').size).toBe(0);
  });

  it('reads Binance price checks', () => {
    expect(pricesUrl(['BTCUSDT'])).toBe(
      'https://data-api.binance.vision/api/v3/ticker/price?symbols=%5B%22BTCUSDT%22%5D',
    );
    expect([...parsePrices([{ symbol: 'BTCUSDT', price: '67000.10' }, { symbol: 'X' }])]).toEqual([
      ['BTCUSDT', 67000.1],
    ]);
    expect([...parsePrices({ symbol: 'PAXGUSDT', price: '4090' })]).toEqual([['PAXGUSDT', 4090]]);
  });
});

describe('portfolio', () => {
  it('values gold held in grams at the per-ounce price', () => {
    const v = valueHolding({ quantity: 10, unit: 'gram', averagePrice: 120 }, 'td:XAU/USD', 4000);
    expect(v.value).toBeCloseTo((10 * 4000) / GRAMS_PER_TROY_OUNCE, 6);
    expect(v.cost).toBe(1200);
    expect(v.gain).toBeCloseTo(v.value - 1200, 6);
  });

  it('shows profit only when the price paid is known', () => {
    expect(
      valueHolding({ quantity: 0.5, unit: 'unit', averagePrice: null }, 'bn:BTCUSDT', 60000),
    ).toEqual({ value: 30000, cost: null, gain: null, gainPercent: null });
    const v = valueHolding({ quantity: 2, unit: 'unit', averagePrice: 100 }, 'td:AAPL', 150);
    expect(v).toEqual({ value: 300, cost: 200, gain: 100, gainPercent: 50 });
  });

  it('knows each market’s currency', () => {
    expect(quoteCurrency(resolveInstrument('bn:BTCUSDT')!)).toBe('USD');
    expect(quoteCurrency(resolveInstrument('td:RELIANCE@NSE')!)).toBe('INR');
    expect(quoteCurrency(resolveInstrument('td:USD/JPY')!)).toBe('JPY');
  });

  it('adds dollars into rupees only with a rate', () => {
    const rows = [
      { currency: 'USD', value: 100, cost: 80 },
      { currency: 'INR', value: 5000, cost: null },
    ];
    expect(totals(rows, 'INR', 84).inHome).toBe(13400);
    expect(totals(rows, 'INR', null).inHome).toBeNull();
    expect(totals(rows, 'INR', null).byCurrency.get('INR')).toEqual({
      value: 5000,
      cost: 0,
      costKnown: false,
    });
    expect(totals([], 'INR', 84).inHome).toBeNull();
  });
});
