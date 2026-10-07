import { describe, expect, it } from 'vitest';
import {
  findHeaderRow,
  guessDateFormat,
  guessMapping,
  importKeys,
  parseCsv,
  parseStatementAmount,
  parseStatementDate,
  readRows,
} from './statement';

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const text =
      '﻿Date,Narration,Amount\r\n01/10/2026,"UPI, Swiggy ""order""",-250.00\r\n02/10/2026,"Two\nlines",100\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['Date', 'Narration', 'Amount'],
      ['01/10/2026', 'UPI, Swiggy "order"', '-250.00'],
      ['02/10/2026', 'Two\nlines', '100'],
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a\tb\n1,5\t2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });
});

describe('dates', () => {
  it('reads day-first, month-first, year-first and month names', () => {
    expect(parseStatementDate('05/10/2026', 'dmy')).toBe('2026-10-05');
    expect(parseStatementDate('05/10/2026', 'mdy')).toBe('2026-05-10');
    expect(parseStatementDate('05-10-26', 'dmy')).toBe('2026-10-05');
    expect(parseStatementDate('2026-10-05', 'dmy')).toBe('2026-10-05');
    expect(parseStatementDate('05-Oct-2026', 'mdy')).toBe('2026-10-05');
    expect(parseStatementDate('5 September 2026', 'dmy')).toBe('2026-09-05');
    expect(parseStatementDate('05/10/2026 14:32:10', 'dmy')).toBe('2026-10-05');
  });

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseStatementDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseStatementDate('13/13/2026', 'dmy')).toBeNull();
    expect(parseStatementDate('yesterday', 'dmy')).toBeNull();
  });

  it('guesses the format that fits every row, day-first on a tie', () => {
    expect(guessDateFormat(['01/02/2026', '03/04/2026'])).toBe('dmy');
    expect(guessDateFormat(['12/31/2026', '01/02/2026'])).toBe('mdy');
    expect(guessDateFormat(['2026-01-02'])).toBe('ymd');
  });
});

describe('amounts', () => {
  it('parses Indian grouping, symbols, brackets, signs and Dr/Cr exactly', () => {
    expect(parseStatementAmount('1,23,456.78', 'INR')).toBe(12345678n);
    expect(parseStatementAmount('₹ 500', 'INR')).toBe(50000n);
    expect(parseStatementAmount('Rs. 99.5', 'INR')).toBe(9950n);
    expect(parseStatementAmount('-250.00', 'INR')).toBe(-25000n);
    expect(parseStatementAmount('(250.00)', 'INR')).toBe(-25000n);
    expect(parseStatementAmount('500 Dr', 'INR')).toBe(-50000n);
    expect(parseStatementAmount('500.00 CR', 'INR')).toBe(50000n);
    expect(parseStatementAmount('', 'INR')).toBeNull();
    expect(() => parseStatementAmount('abc', 'INR')).toThrow();
    // More decimals than the currency has is refused, not rounded.
    expect(() => parseStatementAmount('1.234', 'INR')).toThrow();
  });
});

describe('a real-shaped bank export', () => {
  const csv = [
    'HDFC BANK Ltd.,,,,,,',
    'Statement of account,,,,,,',
    'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    '01/10/26,SALARY OCT,REF1,01/10/26,,"85,000.00","1,20,000.00"',
    '03/10/26,UPI-SWIGGY,REF2,03/10/26,450.00,,"1,19,550.00"',
    '03/10/26,UPI-SWIGGY,REF3,03/10/26,450.00,,"1,19,100.00"',
    '31/10/26,BAD ROW,REF4,31/10/26,oops,,',
  ].join('\n');

  it('skips the preamble, maps debit and credit, and flags bad rows', () => {
    const rows = parseCsv(csv);
    const headerAt = findHeaderRow(rows);
    expect(headerAt).toBe(2);

    const header = rows[headerAt]!;
    const body = rows.slice(headerAt + 1);
    const mapping = guessMapping(header, body);
    expect(mapping).toMatchObject({
      date: 0,
      description: 1,
      amount: null,
      debit: 4,
      credit: 5,
      dateFormat: 'dmy',
    });

    const read = readRows(body, mapping, 'INR');
    expect(read.map((r) => [r.occurredOn, r.amountMinor, r.error])).toEqual([
      ['2026-10-01', 8500000n, null],
      ['2026-10-03', -45000n, null],
      ['2026-10-03', -45000n, null],
      ['2026-10-31', null, 'The amount is not a number'],
    ]);
  });

  it('keys identical rows apart, and the same file to the same keys', () => {
    const rows = [
      { occurredOn: '2026-10-03', amountMinor: -45000n, description: 'UPI-SWIGGY' },
      { occurredOn: '2026-10-03', amountMinor: -45000n, description: 'upi swiggy' },
    ];
    const keys = importKeys(rows);
    expect(keys[0]).not.toBe(keys[1]);
    expect(importKeys(rows)).toEqual(keys);
  });

  it('can flip the sign for card statements that list spending as positive', () => {
    const body = [['01/10/2026', 'Coffee', '120.00']];
    const mapping = { ...guessMapping(['Date', 'Description', 'Amount'], body), invert: true };
    expect(readRows(body, mapping, 'INR')[0]?.amountMinor).toBe(-12000n);
  });
});
