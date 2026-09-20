/**
 * Money is stored and computed as integer minor units (paise, cents) in a
 * bigint. No value in this module is ever a JavaScript number, because binary
 * floating point cannot represent 0.1 and personal finance is exactly the
 * domain where that stops being an academic point.
 *
 * Parsing works on the decimal string directly rather than going through
 * Number(), so "0.29" becomes 29n and not 28n.
 */

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Minor units per major unit. JPY has none; the rest use two. */
const EXPONENT: Record<Currency, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function exponentOf(currency: Currency): number {
  return EXPONENT[currency];
}

export class MoneyParseError extends Error {
  constructor(input: string, reason: string) {
    super(`Cannot read "${input}" as an amount: ${reason}`);
    this.name = 'MoneyParseError';
  }
}

/**
 * Parse human input into minor units.
 *
 * Accepts an optional sign, thousands separators, and up to the currency's
 * exponent in decimal places. Rejects anything else rather than guessing —
 * a silently misread amount is worse than a rejected one.
 */
export function parseAmount(input: string, currency: Currency): bigint {
  const raw = input.trim();
  if (raw === '') throw new MoneyParseError(input, 'it is empty');

  const cleaned = raw.replace(/[\s,_]/g, '');
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);

  if (!match) throw new MoneyParseError(input, 'it is not a decimal number');

  const [, sign, whole = '', fraction = ''] = match;
  if (whole === '' && fraction === '') {
    throw new MoneyParseError(input, 'it has no digits');
  }

  const exponent = EXPONENT[currency];
  if (fraction.length > exponent) {
    throw new MoneyParseError(
      input,
      exponent === 0
        ? `${currency} has no minor unit, so decimals are not allowed`
        : `${currency} allows at most ${exponent} decimal place(s)`,
    );
  }

  const padded = fraction.padEnd(exponent, '0');
  const magnitude = BigInt(`${whole === '' ? '0' : whole}${padded}`);

  return sign === '-' ? -magnitude : magnitude;
}

/** Render minor units as a plain decimal string, with no currency symbol. */
export function toDecimalString(minor: bigint, currency: Currency): string {
  const exponent = EXPONENT[currency];
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(exponent + 1, '0');

  const whole = digits.slice(0, digits.length - exponent);
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`;

  return `${negative ? '-' : ''}${whole}${fraction}`;
}

/**
 * Intl.NumberFormat#format accepts a decimal *string* and formats it exactly,
 * whereas the number overload goes through a double and loses precision on
 * large values. TypeScript's bundled lib types only describe the number
 * overload, so the string form is declared here rather than casting at the
 * call site and hoping the reader notices.
 */
type ExactNumberFormat = Omit<Intl.NumberFormat, 'format'> & {
  format(value: number | bigint | string): string;
};

/**
 * Localised display string. The already-exact decimal string is handed to Intl,
 * so the value never becomes a float on its way to the screen.
 */
export function formatMoney(
  minor: bigint,
  currency: Currency,
  options: { locale?: string; signDisplay?: 'auto' | 'always' | 'never' } = {},
): string {
  const { locale = 'en-IN', signDisplay = 'auto' } = options;
  const exponent = EXPONENT[currency];

  const formatter: ExactNumberFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    signDisplay,
  });

  return formatter.format(toDecimalString(minor, currency));
}

export function add(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subtract(a: bigint, b: bigint): bigint {
  return a - b;
}

export function sum(values: readonly bigint[]): bigint {
  return values.reduce<bigint>((total, v) => total + v, 0n);
}

export function negate(value: bigint): bigint {
  return -value;
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Multiply by a fraction, rounding half away from zero.
 *
 * Used for percentages (budget thresholds, risk sizing). Takes numerator and
 * denominator as bigints rather than a decimal so the caller cannot smuggle a
 * float in through the front door.
 */
export function mulDiv(value: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');

  const negative = (value < 0n !== numerator < 0n) !== denominator < 0n;
  const product = abs(value) * abs(numerator);
  const divisor = abs(denominator);

  const quotient = product / divisor;
  const remainder = product % divisor;

  // Round half away from zero.
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/** Basis points (1/100th of a percent), the usual unit for risk percentages. */
export function percentOf(value: bigint, basisPoints: bigint): bigint {
  return mulDiv(value, basisPoints, 10_000n);
}

/**
 * Split an amount into n parts that sum back to exactly the original.
 *
 * Naive division loses the remainder; this distributes it one minor unit at a
 * time so splitting ₹10.00 three ways gives 3.34 / 3.33 / 3.33 rather than
 * three lots of 3.33 and a vanished paisa.
 */
export function allocate(value: bigint, parts: number): bigint[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error('parts must be a positive integer');
  }

  const n = BigInt(parts);
  const base = value / n;
  let remainder = value - base * n;

  const step = remainder < 0n ? -1n : 1n;
  if (remainder < 0n) remainder = -remainder;

  return Array.from({ length: parts }, (_, i) => (BigInt(i) < remainder ? base + step : base));
}

/** Ratio as a rounded percentage, for progress bars. Returns 0 when total is 0. */
export function ratioToPercent(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number(mulDiv(part, 100n, total));
}
