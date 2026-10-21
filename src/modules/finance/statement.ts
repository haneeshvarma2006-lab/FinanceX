import { parseAmount, type Currency } from '@nestedflow/domain/money';

/**
 * Bank statement import: reading a CSV export into ledger rows.
 *
 * Pure and shared: the browser runs it to preview a file before anything is
 * sent, and the server never trusts that preview — it re-validates every row
 * it is asked to save. Money is parsed from the text straight into integer
 * minor units; no amount ever passes through a float.
 *
 * Banks disagree about almost everything — preamble lines above the header,
 * dd/mm versus mm/dd, one signed column versus separate debit and credit
 * columns, "Dr"/"Cr" suffixes, brackets for negatives — so every guess made
 * here is shown to the user and can be changed before importing.
 */

/** What an import would do with a row, decided on the server against the ledger. */
export type ImportRowStatus = 'new' | 'already-imported' | 'possible-duplicate';

export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;
export const MAX_STATEMENT_ROWS = 2000;

/* ------------------------------------------------------------------ CSV --- */

/** The delimiter that splits the first lines into the most consistent columns. */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 30);
  let best = ',';
  let bestScore = -1;
  for (const delimiter of [',', ';', '\t', '|']) {
    const counts = sample.map((line) => line.split(delimiter).length - 1).filter((n) => n > 0);
    if (counts.length === 0) continue;
    // Rewards many columns on many lines.
    const score = counts.length * Math.min(...counts.slice(-10));
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** RFC 4180: quoted fields, doubled quotes inside them, newlines inside quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell !== ''));
}

/* ---------------------------------------------------------------- dates --- */

export const DATE_FORMATS = ['dmy', 'mdy', 'ymd'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dmy: 'Day / month / year (31/12/2026)',
  mdy: 'Month / day / year (12/31/2026)',
  ymd: 'Year-month-day (2026-12-31)',
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function iso(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null; // 31 February
  return date.toISOString().slice(0, 10);
}

/** A statement date as YYYY-MM-DD, or null when it does not fit the format. */
export function parseStatementDate(raw: string, format: DateFormat): string | null {
  const value = raw
    .trim()
    .split(/[ T]\d{1,2}:\d{2}/)[0]!
    .trim();

  // Month names are unambiguous whatever the format: 05-Oct-2026, 5 Oct 26.
  const named = /^(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,]+(\d{2,4})$/.exec(value);
  if (named) {
    const name = named[2]!.toLowerCase();
    const month = MONTHS[name.slice(0, 4)] ?? MONTHS[name.slice(0, 3)];
    return month ? iso(Number(named[3]), month, Number(named[1])) : null;
  }

  const parts = /^(\d{1,4})[\-/.](\d{1,2})[\-/.](\d{1,4})$/.exec(value);
  if (!parts) return null;
  const [a, b, c] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (parts[1]!.length === 4) return iso(a, b, c); // year first is never ambiguous
  if (format === 'mdy') return iso(c, a, b);
  if (format === 'ymd') return null;
  return iso(c, b, a);
}

/** The format under which every date in the column parses; day-first wins a tie. */
export function guessDateFormat(values: readonly string[]): DateFormat {
  const filled = values.filter((v) => v.trim() !== '');
  const fits = (format: DateFormat) => filled.every((v) => parseStatementDate(v, format) !== null);
  if (filled.length > 0 && filled.every((v) => /^\d{4}/.test(v.trim()))) return 'ymd';
  if (fits('dmy')) return 'dmy';
  if (fits('mdy')) return 'mdy';
  return 'dmy';
}

/* -------------------------------------------------------------- amounts --- */

/**
 * A statement amount as signed minor units, or null for a blank cell.
 * Throws when the cell holds something that is not an amount.
 *
 * Handles "1,23,456.78", "₹ 500", "-500", "(500.00)", "500 Dr", "500 CR",
 * "500.00(Dr)".
 */
export function parseStatementAmount(raw: string, currency: Currency): bigint | null {
  let value = raw.trim();
  if (value === '' || value === '-' || value === '—') return null;

  let negative = false;
  const suffix = /\s*\(?(dr|cr)\)?\.?$/i.exec(value);
  if (suffix) {
    negative = suffix[1]!.toLowerCase() === 'dr';
    value = value.slice(0, suffix.index).trim();
  }
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/[₹$€£¥]|\bRs\.?|\b(?:INR|USD|EUR|GBP|JPY)\b/gi, '').trim();
  if (value.startsWith('-')) {
    negative = !negative;
    value = value.slice(1).trim();
  } else if (value.startsWith('+')) {
    value = value.slice(1).trim();
  }

  const magnitude = parseAmount(value, currency);
  return negative ? -magnitude : magnitude;
}

/* ------------------------------------------------------------- mapping --- */

export type ColumnMapping = {
  date: number;
  description: number;
  /** Either one signed amount column ... */
  amount: number | null;
  /** ... or money out and money in in separate columns. */
  debit: number | null;
  credit: number | null;
  dateFormat: DateFormat;
  /** Some card statements list spending as positive numbers. */
  invert: boolean;
};

const HEADER = {
  date: /^((txn|tran|trans|transaction|post|posting|value)\.?\s+)?date\b/i,
  valueDate: /value\s*date/i,
  description: /narration|description|particulars|details|remarks|memo|payee|merchant/i,
  amount: /^(transaction )?amount\b|^amt\b/i,
  debit: /debit|withdraw|money out|paid out|\bdr\b/i,
  credit: /credit|deposit|money in|paid in|\bcr\b/i,
};

/** Whether a row of cells reads like a statement's header: a date column and money. */
export function looksLikeHeader(cells: readonly string[]): boolean {
  const hasDate = cells.some((c) => HEADER.date.test(c) || HEADER.valueDate.test(c));
  const hasMoney = cells.some(
    (c) => HEADER.amount.test(c) || HEADER.debit.test(c) || HEADER.credit.test(c),
  );
  return hasDate && hasMoney;
}

/** The first row near the top that looks like a header: a date column and money. */
export function findHeaderRow(rows: readonly string[][]): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i += 1) {
    if (looksLikeHeader(rows[i]!)) return i;
  }
  return 0;
}

/**
 * Some statements put "Dr" or "Cr" in a column of its own, next to an
 * unsigned amount. Folded into the amount ("500.00 Dr"), the amount parser
 * reads the sign, and the column guesser no longer mistakes it for money.
 */
export function foldDrCrColumn(
  header: readonly string[],
  body: readonly string[][],
): { header: string[]; body: string[][] } {
  const marker = header.findIndex(
    (_, i) =>
      i > 0 &&
      body.some((r) => (r[i] ?? '').trim() !== '') &&
      body.every((r) => /^((dr|cr)\.?)?$/i.test((r[i] ?? '').trim())),
  );
  if (marker < 0) return { header: [...header], body: body.map((r) => [...r]) };
  // The amount is the money column beside it: on the left, as banks print it.
  const target = marker - 1;
  return {
    header: header.filter((_, i) => i !== marker),
    body: body.map((r) =>
      r
        .map((cell, i) => (i === target && r[marker] ? `${cell} ${r[marker]!.trim()}` : cell))
        .filter((_, i) => i !== marker),
    ),
  };
}

export function guessMapping(header: readonly string[], body: readonly string[][]): ColumnMapping {
  const find = (pattern: RegExp, exclude: number[] = []) =>
    header.findIndex((cell, i) => !exclude.includes(i) && pattern.test(cell));

  // Prefer the transaction date over the value date when both exist.
  let date = header.findIndex((c) => HEADER.date.test(c) && !HEADER.valueDate.test(c));
  if (date < 0) date = find(HEADER.valueDate);
  if (date < 0) date = 0;

  let description = find(HEADER.description, [date]);
  if (description < 0) description = header.findIndex((_, i) => i !== date);

  const amount = find(HEADER.amount, [date, description]);
  const debit = find(HEADER.debit, [date, description, amount]);
  const credit = find(HEADER.credit, [date, description, amount, debit]);

  const split = debit >= 0 && credit >= 0;
  return {
    date,
    description,
    amount: split ? null : amount >= 0 ? amount : debit >= 0 ? debit : credit,
    debit: split ? debit : null,
    credit: split ? credit : null,
    dateFormat: guessDateFormat(body.map((r) => r[date] ?? '')),
    invert: false,
  };
}

export type StatementRow = {
  /** 1-based line in the table, header excluded, for error messages. */
  line: number;
  occurredOn: string | null;
  description: string;
  amountMinor: bigint | null;
  error: string | null;
};

const MAX_DESCRIPTION = 240;

export function readRows(
  body: readonly string[][],
  mapping: ColumnMapping,
  currency: Currency,
): StatementRow[] {
  return body.map((cells, index) => {
    const line = index + 1;
    const description =
      (cells[mapping.description] ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION) ||
      'Imported transaction';
    const occurredOn = parseStatementDate(cells[mapping.date] ?? '', mapping.dateFormat);

    let amountMinor: bigint | null = null;
    let error: string | null = null;
    try {
      if (mapping.amount !== null) {
        amountMinor = parseStatementAmount(cells[mapping.amount] ?? '', currency);
      } else {
        const out = parseStatementAmount(cells[mapping.debit ?? -1] ?? '', currency);
        const inn = parseStatementAmount(cells[mapping.credit ?? -1] ?? '', currency);
        if (out !== null || inn !== null) {
          // Debit columns are money out whatever sign the bank printed.
          amountMinor =
            (inn !== null ? (inn < 0n ? -inn : inn) : 0n) -
            (out !== null ? (out < 0n ? -out : out) : 0n);
        }
      }
    } catch {
      error = 'The amount is not a number';
    }

    if (amountMinor !== null && mapping.invert) amountMinor = -amountMinor;
    if (!error && occurredOn === null) error = 'The date does not match the chosen format';
    if (!error && (amountMinor === null || amountMinor === 0n)) error = 'No amount';

    return { line, occurredOn, description, amountMinor, error };
  });
}

/**
 * The stable identity of an imported row on one account. Two identical rows
 * in one file (two ₹50 teas on the same day) are told apart by how many
 * times the same line has appeared before them, so re-importing the same
 * statement matches row for row and adds nothing.
 */
export function importKeys(
  rows: readonly { occurredOn: string; amountMinor: bigint; description: string }[],
): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = `${row.occurredOn}|${row.amountMinor}|${row.description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}|${n}`;
  });
}
