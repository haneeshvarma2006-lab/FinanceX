import { describe, expect, it } from 'vitest';
import {
  allocate,
  formatMoney,
  MoneyParseError,
  mulDiv,
  parseAmount,
  percentOf,
  ratioToPercent,
  sum,
  toDecimalString,
} from './index';

describe('parseAmount', () => {
  it('reads plain decimals exactly', () => {
    expect(parseAmount('1234.56', 'INR')).toBe(123456n);
    expect(parseAmount('0.01', 'INR')).toBe(1n);
    expect(parseAmount('100', 'INR')).toBe(10000n);
  });

  it('reads the values binary floating point gets wrong', () => {
    // 0.29 * 100 === 28.999999999999996 as a double, which truncates to 28.
    expect(parseAmount('0.29', 'INR')).toBe(29n);
    expect(parseAmount('8.20', 'INR')).toBe(820n);
    expect(parseAmount('1.10', 'INR')).toBe(110n);
  });

  it('handles signs and separators', () => {
    expect(parseAmount('-1234.56', 'INR')).toBe(-123456n);
    expect(parseAmount('+99.99', 'INR')).toBe(9999n);
    expect(parseAmount('1,23,456.78', 'INR')).toBe(12345678n);
    expect(parseAmount('  42.00  ', 'INR')).toBe(4200n);
  });

  it('pads short fractions', () => {
    expect(parseAmount('5.1', 'INR')).toBe(510n);
    expect(parseAmount('.5', 'INR')).toBe(50n);
  });

  it('respects a zero-exponent currency', () => {
    expect(parseAmount('1000', 'JPY')).toBe(1000n);
    expect(() => parseAmount('10.5', 'JPY')).toThrow(MoneyParseError);
  });

  it('rejects rather than guessing', () => {
    expect(() => parseAmount('', 'INR')).toThrow(MoneyParseError);
    expect(() => parseAmount('abc', 'INR')).toThrow(MoneyParseError);
    expect(() => parseAmount('1.234', 'INR')).toThrow(MoneyParseError);
    expect(() => parseAmount('1.2.3', 'INR')).toThrow(MoneyParseError);
    expect(() => parseAmount('1e5', 'INR')).toThrow(MoneyParseError);
    expect(() => parseAmount('.', 'INR')).toThrow(MoneyParseError);
  });

  it('survives values that exceed Number.MAX_SAFE_INTEGER', () => {
    const huge = '99999999999999999.99';
    expect(parseAmount(huge, 'INR')).toBe(9999999999999999999n);
    expect(toDecimalString(parseAmount(huge, 'INR'), 'INR')).toBe(huge);
  });
});

describe('toDecimalString', () => {
  it('round-trips through parseAmount', () => {
    for (const value of ['0.00', '0.07', '-0.07', '1234.56', '-1234.56', '1000000.00']) {
      expect(toDecimalString(parseAmount(value, 'INR'), 'INR')).toBe(value);
    }
  });

  it('pads values below one major unit', () => {
    expect(toDecimalString(5n, 'INR')).toBe('0.05');
    expect(toDecimalString(-5n, 'INR')).toBe('-0.05');
    expect(toDecimalString(0n, 'INR')).toBe('0.00');
  });
});

describe('formatMoney', () => {
  it('formats without precision loss on large values', () => {
    // The number overload of Intl renders this as ...568.00.
    expect(formatMoney(1234567890123456789n, 'INR')).toContain('567.89');
  });

  it('shows the sign when asked', () => {
    expect(formatMoney(12000n, 'INR', { signDisplay: 'always' })).toContain('+');
  });
});

describe('arithmetic', () => {
  it('sums exactly over many small values', () => {
    // 0.1 + 0.2 + ... a hundred times is 10.000000000000002 in floating point.
    const hundredTenPaise = Array.from({ length: 100 }, () => 10n);
    expect(sum(hundredTenPaise)).toBe(1000n);
  });

  it('rounds half away from zero', () => {
    expect(mulDiv(5n, 1n, 2n)).toBe(3n);
    expect(mulDiv(-5n, 1n, 2n)).toBe(-3n);
    expect(mulDiv(4n, 1n, 2n)).toBe(2n);
  });

  it('handles negative operands consistently', () => {
    expect(mulDiv(100n, -1n, 2n)).toBe(-50n);
    expect(mulDiv(-100n, -1n, 2n)).toBe(50n);
    expect(mulDiv(-100n, -1n, -2n)).toBe(-50n);
  });

  it('throws on division by zero', () => {
    expect(() => mulDiv(1n, 1n, 0n)).toThrow();
  });

  it('computes basis points', () => {
    expect(percentOf(100000n, 10_000n)).toBe(100000n); // 100%
    expect(percentOf(100000n, 100n)).toBe(1000n); // 1%
    expect(percentOf(100000n, 50n)).toBe(500n); // 0.5%
  });
});

describe('allocate', () => {
  it('never loses a minor unit', () => {
    const parts = allocate(1000n, 3);
    expect(parts).toEqual([334n, 333n, 333n]);
    expect(sum(parts)).toBe(1000n);
  });

  it('is exact for every split of a stubborn amount', () => {
    for (let n = 1; n <= 12; n += 1) {
      expect(sum(allocate(10_00n, n))).toBe(1000n);
      expect(allocate(1000n, n)).toHaveLength(n);
    }
  });

  it('handles negative amounts', () => {
    const parts = allocate(-1000n, 3);
    expect(sum(parts)).toBe(-1000n);
    expect(parts).toEqual([-334n, -333n, -333n]);
  });

  it('rejects a nonsensical split', () => {
    expect(() => allocate(100n, 0)).toThrow();
    expect(() => allocate(100n, -1)).toThrow();
    expect(() => allocate(100n, 1.5)).toThrow();
  });
});

describe('ratioToPercent', () => {
  it('is zero-safe', () => {
    expect(ratioToPercent(50n, 0n)).toBe(0);
  });

  it('rounds to whole percent', () => {
    expect(ratioToPercent(1n, 3n)).toBe(33);
    expect(ratioToPercent(2n, 3n)).toBe(67);
    expect(ratioToPercent(45n, 100n)).toBe(45);
  });
});
