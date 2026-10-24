import { z } from 'zod';
import { toDecimalString, type Currency } from '@nestedflow/domain/money';
import { isMonthKey, monthRange } from './insights';

/**
 * The full ledger: every transaction, filtered the way a person looks for
 * one — by words, month, category, account, or money in versus out — and
 * the same selection written out as a CSV for a spreadsheet or an accountant.
 *
 * Filters arrive in the URL, so each is parsed and bounded here before it
 * can reach a query; anything malformed is simply ignored.
 */

const id = z.string().length(36);

export const ledgerParamsSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  month: z
    .string()
    .optional()
    .catch(undefined)
    .transform((v) => (isMonthKey(v) ? v : undefined)),
  /** A category id, or "none" for spending with no category. */
  category: z
    .union([id, z.literal('none')])
    .optional()
    .catch(undefined),
  account: id.optional().catch(undefined),
  direction: z.enum(['out', 'in']).optional().catch(undefined),
});

/** Parsed filters; any may be absent. */
export type LedgerParams = Partial<z.infer<typeof ledgerParamsSchema>>;

/** What the repository filters on. */
export type LedgerFilter = {
  search?: string;
  from?: string;
  to?: string;
  categoryId?: string | 'none';
  accountId?: string;
  direction?: 'out' | 'in';
};

export function ledgerFilter(params: LedgerParams): LedgerFilter {
  const range = params.month ? monthRange(params.month) : undefined;
  return {
    search: params.q || undefined,
    from: range?.from,
    to: range?.to,
    categoryId: params.category,
    accountId: params.account,
    direction: params.direction,
  };
}

/** The same filters as a query string, for links that keep them. */
export function ledgerQuery(params: LedgerParams, extra: Record<string, string> = {}): string {
  const out = new URLSearchParams();
  if (params.q) out.set('q', params.q);
  if (params.month) out.set('month', params.month);
  if (params.category) out.set('category', params.category);
  if (params.account) out.set('account', params.account);
  if (params.direction) out.set('direction', params.direction);
  for (const [k, v] of Object.entries(extra)) out.set(k, v);
  const text = out.toString();
  return text ? `?${text}` : '';
}

/* ----------------------------------------------------------------- CSV --- */

/**
 * One CSV cell. Quoted when it holds a comma, quote or line break; and a
 * text cell that starts like a formula (= + - @, tab, return) is prefixed
 * with an apostrophe, so a narration such as "=HYPERLINK(...)" opens in a
 * spreadsheet as text, never as something that runs.
 */
export function csvCell(value: string, kind: 'text' | 'number' = 'text'): string {
  let text = value;
  if (kind === 'text' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type CsvRow = {
  occurredOn: string;
  description: string;
  category: string | null;
  account: string;
  kind: string;
  amountMinor: bigint;
  currency: string;
  notes: string | null;
};

export const CSV_HEADER = [
  'Date',
  'Description',
  'Category',
  'Account',
  'Type',
  'Amount',
  'Currency',
  'Bank line',
];

/** The rows as CSV text, with a header; amounts signed, money out negative. */
export function toCsv(rows: readonly CsvRow[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.occurredOn),
        csvCell(r.description),
        csvCell(r.category ?? ''),
        csvCell(r.account),
        csvCell(r.kind),
        csvCell(toDecimalString(r.amountMinor, r.currency as Currency), 'number'),
        csvCell(r.currency),
        csvCell(r.notes ?? ''),
      ].join(','),
    );
  }
  // CRLF, as RFC 4180 has it, and what Excel expects.
  return `${lines.join('\r\n')}\r\n`;
}
