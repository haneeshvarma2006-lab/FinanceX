/**
 * Exact decimal arithmetic for market quantities and prices.
 *
 * Quantities and prices cannot use the money module's minor-unit integers: a
 * crypto price of 0.00003421 or a fractional share of 0.137 has more precision
 * than two decimal places. They are stored as NUMERIC(24,8) and handled here as
 * bigints scaled by 10^8 — still exact, just a different scale.
 */

export const SCALE_DECIMALS = 8;
export const SCALE = 10n ** BigInt(SCALE_DECIMALS);

export class DecimalParseError extends Error {
  constructor(input: string) {
    super(`Cannot read "${input}" as a decimal number`);
    this.name = 'DecimalParseError';
  }
}

/** Parse a decimal string into a bigint scaled by 10^8. */
export function parseDecimal(input: string): bigint {
  const cleaned = input.trim().replace(/[\s,_]/g, '');
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);

  if (!match) throw new DecimalParseError(input);

  const [, sign, whole = '', fraction = ''] = match;
  if (whole === '' && fraction === '') throw new DecimalParseError(input);
  if (fraction.length > SCALE_DECIMALS) {
    throw new DecimalParseError(`${input} (more than ${SCALE_DECIMALS} decimal places)`);
  }

  const magnitude = BigInt(`${whole === '' ? '0' : whole}${fraction.padEnd(SCALE_DECIMALS, '0')}`);

  return sign === '-' ? -magnitude : magnitude;
}

export function formatDecimal(value: bigint, maxDecimals = SCALE_DECIMALS): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(SCALE_DECIMALS + 1, '0');

  const whole = digits.slice(0, digits.length - SCALE_DECIMALS);
  let fraction = digits.slice(digits.length - SCALE_DECIMALS).slice(0, maxDecimals);
  fraction = fraction.replace(/0+$/, '');

  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');

  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;

  const quotient = a / b;
  const rounded = (a % b) * 2n >= b ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/** Multiply two scaled decimals, returning a scaled decimal. */
export function mulDecimal(a: bigint, b: bigint): bigint {
  return divideRoundHalfAwayFromZero(a * b, SCALE);
}

/** Divide two scaled decimals, returning a scaled decimal. */
export function divDecimal(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error('Division by zero');
  return divideRoundHalfAwayFromZero(a * SCALE, b);
}

/**
 * Convert quantity x price into money, in the currency's minor units.
 *
 * This is the bridge between the 8-decimal market scale and the 2-decimal
 * money scale, and it is the only place the two meet. Rounding happens once,
 * here, rather than accumulating at every intermediate step.
 */
export function notionalMinor(quantity: bigint, price: bigint, currencyExponent: number): bigint {
  const minorPerMajor = 10n ** BigInt(currencyExponent);
  // quantity * price is scaled by SCALE^2; bring it to minor units in one step.
  return divideRoundHalfAwayFromZero(quantity * price * minorPerMajor, SCALE * SCALE);
}

export function absDecimal(value: bigint): bigint {
  return value < 0n ? -value : value;
}
