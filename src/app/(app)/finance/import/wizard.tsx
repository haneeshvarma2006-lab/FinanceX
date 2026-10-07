'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, FileSpreadsheet } from 'lucide-react';
import { formatMoney, isCurrency, type Currency } from '@nestedflow/domain/money';
import { Button } from '@/components/ui/button';
import { CheckboxField, FormAlert, SelectField } from '@/components/ui/form';
import { Badge } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import {
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_ROWS,
  findHeaderRow,
  guessMapping,
  parseCsv,
  readRows,
  type ColumnMapping,
  type DateFormat,
  type ImportRowStatus,
} from '@/modules/finance/statement';
import { importStatementAction, previewImportAction } from './actions';

type Account = { id: string; name: string; currency: string };
type Sheet = { fileName: string; header: string[]; body: string[][] };

const STATUS: Record<ImportRowStatus, { label: string; tone: 'neutral' | 'warning' | 'positive' }> =
  {
    new: { label: 'New', tone: 'positive' },
    'possible-duplicate': { label: 'Already typed in?', tone: 'warning' },
    'already-imported': { label: 'Imported before', tone: 'neutral' },
  };

/**
 * The import, in the order a person checks things: which account, which
 * file, whether the columns were understood, then every row with what will
 * happen to it — and only then a single button that writes anything.
 */
export function ImportWizard({ accounts, locale }: { accounts: Account[]; locale: string }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ImportRowStatus[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === accountId);
  const currency: Currency = account && isCurrency(account.currency) ? account.currency : 'INR';

  const rows = useMemo(
    () => (sheet && mapping ? readRows(sheet.body, mapping, currency) : []),
    [sheet, mapping, currency],
  );
  const valid = rows.filter((r) => r.error === null);
  const invalid = rows.filter((r) => r.error !== null);

  /** Anything that changes what the rows are invalidates the duplicate check. */
  function resetCheck() {
    setStatuses(null);
    setSelected(new Set());
    setMessage(null);
    setDone(null);
  }

  async function onFile(file: File | undefined) {
    resetCheck();
    setSheet(null);
    setMapping(null);
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_STATEMENT_BYTES) {
      setFileError('That file is over 2 MB. Export one month at a time.');
      return;
    }
    const text = await file.text();
    const table = parseCsv(text);
    const at = findHeaderRow(table);
    const header = table[at] ?? [];
    const body = table.slice(at + 1).filter((r) => r.length >= 2);
    if (header.length < 2 || body.length === 0) {
      setFileError('No rows found. Is this the CSV export of a statement?');
      return;
    }
    if (body.length > MAX_STATEMENT_ROWS) {
      setFileError(
        `That file has ${body.length} rows; import at most ${MAX_STATEMENT_ROWS} at a time.`,
      );
      return;
    }
    setSheet({ fileName: file.name, header, body });
    setMapping(guessMapping(header, body));
  }

  function update(change: Partial<ColumnMapping>) {
    if (!mapping) return;
    resetCheck();
    setMapping({ ...mapping, ...change });
  }

  const payload = (pick: (index: number) => boolean) =>
    valid.map((r, i) => ({
      occurredOn: r.occurredOn!,
      amountMinor: r.amountMinor!.toString(),
      description: r.description,
      selected: pick(i),
    }));

  function check() {
    setMessage(null);
    startTransition(async () => {
      const result = await previewImportAction(
        accountId,
        payload(() => true),
      );
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message });
        return;
      }
      setStatuses(result.statuses);
      setSelected(new Set(result.statuses.flatMap((status, i) => (status === 'new' ? [i] : []))));
    });
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await importStatementAction(
        accountId,
        payload((i) => selected.has(i)),
      );
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message });
        return;
      }
      setDone({ inserted: result.inserted, skipped: result.skipped });
    });
  }

  const money = (minor: bigint) => formatMoney(minor, currency, { locale, signDisplay: 'always' });
  const columns = sheet?.header.map((name, i) => ({ i, name: name || `Column ${i + 1}` })) ?? [];
  const selectedTotal = valid
    .filter((_, i) => selected.has(i))
    .reduce((sum, r) => sum + r.amountMinor!, 0n);

  if (done) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p
          role="status"
          className="inline-flex items-center gap-2 text-base font-medium text-positive"
        >
          <Check aria-hidden className="size-5" />
          Imported {done.inserted} transaction{done.inserted === 1 ? '' : 's'} into {account?.name}
          {done.skipped > 0 ? ` · ${done.skipped} were already there` : ''}
        </p>
        <p className="text-sm text-text-secondary">
          They are uncategorised. Add categories on Finance so budgets and the weekly review can use
          them.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/finance"
            className="inline-flex h-9.5 items-center rounded-[var(--radius-control)] bg-text-primary px-4 text-sm font-medium text-surface-sunken"
          >
            See them on Finance
          </Link>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDone(null);
              setSheet(null);
              setMapping(null);
            }}
          >
            Import another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1 · account and file */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Into account"
          value={accountId}
          onChange={(e) => {
            resetCheck();
            setAccountId(e.target.value);
          }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="statement-file" className="text-xs font-medium text-text-secondary">
            Statement file (.csv)
          </label>
          <input
            id="statement-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className={cn(
              'block w-full text-sm text-text-secondary',
              'file:mr-3 file:h-9.5 file:rounded-[var(--radius-control)] file:border file:border-border-subtle',
              'file:bg-surface-overlay file:px-4 file:text-sm file:text-text-primary hover:file:border-border-strong',
            )}
          />
        </div>
      </div>

      {fileError && <FormAlert>{fileError}</FormAlert>}

      {/* 2 · how the columns were read */}
      {sheet && mapping && (
        <section aria-labelledby="import-columns" className="flex flex-col gap-4">
          <h3
            id="import-columns"
            className="flex items-center gap-2 text-sm font-semibold text-text-primary"
          >
            <FileSpreadsheet aria-hidden className="size-4 text-text-muted" />
            {sheet.fileName} · {sheet.body.length} rows — check the columns
          </h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Date column"
              value={mapping.date}
              onChange={(e) => update({ date: Number(e.target.value) })}
            >
              {columns.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Date format"
              value={mapping.dateFormat}
              onChange={(e) => update({ dateFormat: e.target.value as DateFormat })}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {DATE_FORMAT_LABELS[f]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Description column"
              value={mapping.description}
              onChange={(e) => update({ description: Number(e.target.value) })}
            >
              {columns.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Amounts are in"
              value={mapping.amount !== null ? 'one' : 'two'}
              onChange={(e) =>
                e.target.value === 'one'
                  ? update({
                      amount: mapping.debit ?? mapping.credit ?? 0,
                      debit: null,
                      credit: null,
                    })
                  : update({
                      amount: null,
                      debit: mapping.amount ?? 0,
                      credit: mapping.amount ?? 0,
                    })
              }
            >
              <option value="one">One column, minus for money out</option>
              <option value="two">Two columns: money out, money in</option>
            </SelectField>
            {mapping.amount !== null ? (
              <SelectField
                label="Amount column"
                value={mapping.amount}
                onChange={(e) => update({ amount: Number(e.target.value) })}
              >
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <>
                <SelectField
                  label="Money out column"
                  value={mapping.debit ?? 0}
                  onChange={(e) => update({ debit: Number(e.target.value) })}
                >
                  {columns.map((c) => (
                    <option key={c.i} value={c.i}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Money in column"
                  value={mapping.credit ?? 0}
                  onChange={(e) => update({ credit: Number(e.target.value) })}
                >
                  {columns.map((c) => (
                    <option key={c.i} value={c.i}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
              </>
            )}
          </div>

          <CheckboxField
            label="Spending is shown as positive numbers"
            hint="Some card statements do this. Tick it to flip every sign."
            checked={mapping.invert}
            onChange={(e) => update({ invert: e.target.checked })}
          />

          {invalid.length > 0 && (
            <details className="rounded-xl border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm">
              <summary className="cursor-pointer text-warning">
                {invalid.length} row{invalid.length === 1 ? '' : 's'} will be left out
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-text-secondary">
                {invalid.slice(0, 20).map((r) => (
                  <li key={r.line}>
                    Row {r.line}: {r.error} — “{sheet.body[r.line - 1]?.join(', ').slice(0, 80)}”
                  </li>
                ))}
              </ul>
            </details>
          )}

          {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}

          {!statuses && (
            <Button
              type="button"
              onClick={check}
              loading={pending}
              disabled={valid.length === 0}
              className="self-start"
            >
              Preview {valid.length} transaction{valid.length === 1 ? '' : 's'}
            </Button>
          )}
        </section>
      )}

      {/* 3 · every row and what will happen to it */}
      {statuses && (
        <section aria-labelledby="import-preview" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="import-preview" className="text-sm font-semibold text-text-primary">
              {selected.size} of {valid.length} ticked ·{' '}
              <span className="numeric">{money(selectedTotal)}</span> net
            </h3>
            <p className="text-xs text-text-muted">
              Rows that look already recorded start unticked. Nothing is saved until you import.
            </p>
          </div>

          <ul className="max-h-120 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle">
            {valid.map((row, i) => {
              const status = statuses[i] ?? 'new';
              const locked = status === 'already-imported';
              return (
                <li key={row.line} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Import ${row.description} on ${row.occurredOn}`}
                    checked={selected.has(i)}
                    disabled={locked}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setSelected(next);
                    }}
                    className="size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm',
                        locked ? 'text-text-muted' : 'text-text-primary',
                      )}
                    >
                      {row.description}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                      <span className="numeric">{row.occurredOn}</span>
                      <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                    </p>
                  </div>
                  <span
                    className={cn(
                      'numeric shrink-0 text-right text-sm',
                      row.amountMinor! < 0n ? 'text-negative' : 'text-positive',
                    )}
                  >
                    {money(row.amountMinor!)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} loading={pending} disabled={selected.size === 0}>
              Import {selected.size} transaction{selected.size === 1 ? '' : 's'}
            </Button>
            <Button type="button" variant="ghost" onClick={resetCheck}>
              Back to columns
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
