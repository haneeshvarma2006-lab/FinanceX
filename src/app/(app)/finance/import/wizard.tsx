'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, FileSpreadsheet, LockKeyhole } from 'lucide-react';
import { formatMoney, isCurrency, type Currency } from '@nestedflow/domain/money';
import { Button } from '@/components/ui/button';
import { CheckboxField, Field, FormAlert, SelectField } from '@/components/ui/form';
import { Badge } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import {
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_ROWS,
  findHeaderRow,
  foldDrCrColumn,
  guessMapping,
  parseCsv,
  readRows,
  type ColumnMapping,
  type DateFormat,
  type ImportRowStatus,
} from '@/modules/finance/statement';
import {
  AUTO_CATEGORIES,
  canonicalKeys,
  cleanNarration,
  merchantKey,
  suggestCategory,
} from '@/modules/finance/categorize';
import { SUGGESTED_CATEGORIES } from '@/modules/finance/recurring';
import { importStatementAction, previewImportAction } from './actions';
import { MAX_PDF_BYTES, type PdfRead } from './read-pdf';

type Account = { id: string; name: string; currency: string };
type Sheet = { fileName: string; kind: 'csv' | 'pdf'; header: string[]; body: string[][] };

const PDF_PROBLEM: Record<Exclude<PdfRead, { ok: true }>['reason'], string> = {
  password: '',
  'wrong-password':
    'That password did not open it. Banks often use part of your name and date of birth, or your customer ID — the statement email says which.',
  'no-text':
    'This PDF is a scanned picture, with no text to read. Download the e-statement from net banking or the bank app instead.',
  'no-table':
    'No transactions table found in this PDF. If it is a bank statement, try the CSV or Excel download from net banking.',
  unreadable: 'That PDF could not be opened. Is it a complete download?',
};

/** Where the month of a statement is, for the insights link: its most common month. */
function busiestMonth(days: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const day of days) counts.set(day.slice(0, 7), (counts.get(day.slice(0, 7)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

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
export function ImportWizard({
  accounts,
  categories,
  locale,
}: {
  accounts: Account[];
  /** The person's own expense categories, offered alongside the usual ones. */
  categories: string[];
  locale: string;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ImportRowStatus[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [done, setDone] = useState<{
    inserted: number;
    skipped: number;
    month: string | null;
  } | null>(null);
  const [locked, setLocked] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [reading, setReading] = useState(false);
  /**
   * Categories the person picked on the preview, by place (merchant key):
   * one choice files every payment to that place.
   */
  const [chosen, setChosen] = useState<Map<string, string | null>>(new Map());
  /** How each place was filed in earlier imports and entries, by merchant key. */
  const [known, setKnown] = useState<Record<string, string>>({});
  const [allPlaces, setAllPlaces] = useState(false);
  /** The place list's order, fixed when the preview opens so rows never jump as you sort. */
  const [order, setOrder] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === accountId);
  const currency: Currency = account && isCurrency(account.currency) ? account.currency : 'INR';

  const rows = useMemo(
    () => (sheet && mapping ? readRows(sheet.body, mapping, currency) : []),
    [sheet, mapping, currency],
  );
  const okRows = rows.filter((r) => r.error === null);
  const names = okRows.map((r) => cleanNarration(r.description) || r.description);
  // One key per place, across the bank's shortened spellings and the ones
  // remembered from before.
  const canonical = canonicalKeys([...names.map(merchantKey), ...Object.keys(known)]);
  const remembered = new Map<string, string>();
  for (const [key, category] of Object.entries(known)) {
    const root = canonical.get(key);
    if (root && !remembered.has(root)) remembered.set(root, category);
  }
  const valid = okRows.map((r, i) => {
    const name = names[i]!;
    const key = canonical.get(merchantKey(name)) ?? merchantKey(name);
    const out = r.amountMinor! < 0n;
    // Yours first, then what you chose last time, then the guess.
    const source: 'yours' | 'remembered' | 'guess' | null = !out
      ? null
      : chosen.has(key)
        ? 'yours'
        : remembered.has(key)
          ? 'remembered'
          : 'guess';
    const category =
      source === 'yours'
        ? chosen.get(key)!
        : source === 'remembered'
          ? remembered.get(key)!
          : source === 'guess'
            ? suggestCategory(r.description, r.amountMinor!)
            : null;
    return { ...r, name, key, category, source };
  });
  const invalid = rows.filter((r) => r.error !== null);
  const categoryOptions = [
    ...new Set([
      ...categories,
      ...Object.values(known),
      ...SUGGESTED_CATEGORIES,
      ...AUTO_CATEGORIES,
    ]),
  ].sort((a, b) => a.localeCompare(b));

  function choose(key: string, category: string | null) {
    const next = new Map(chosen);
    next.set(key, category);
    setChosen(next);
  }

  /** Anything that changes what the rows are invalidates the duplicate check. */
  function resetCheck() {
    setOrder(null);
    setStatuses(null);
    setSelected(new Set());
    setMessage(null);
    setDone(null);
  }

  function acceptTable(
    fileName: string,
    kind: Sheet['kind'],
    raw: { header: string[]; body: string[][] },
  ) {
    const { header, body } = foldDrCrColumn(raw.header, raw.body);
    if (header.length < 2 || body.length === 0) {
      setFileError(
        kind === 'pdf'
          ? PDF_PROBLEM['no-table']
          : 'No rows found. Is this the CSV export of a statement?',
      );
      return;
    }
    if (body.length > MAX_STATEMENT_ROWS) {
      setFileError(
        `That file has ${body.length} rows; import at most ${MAX_STATEMENT_ROWS} at a time.`,
      );
      return;
    }
    const guess = guessMapping(header, body);
    // A card statement in one column lists spending as plain positive
    // numbers and marks refunds and payments "Cr": spending is money out.
    if (kind === 'pdf' && guess.amount !== null) {
      const cells = body.map((r) => (r[guess.amount!] ?? '').trim()).filter(Boolean);
      const unsigned = cells.every((c) => !/^[-(]|\bdr\b|\(dr\)/i.test(c));
      const noCr = cells.every((c) => !/\bcr\b|\(cr\)/i.test(c));
      if (unsigned && noCr) guess.invert = true;
    }
    setSheet({ fileName, kind, header, body });
    setMapping(guess);
  }

  async function openPdf(file: File, pass?: string) {
    setReading(true);
    setFileError(null);
    try {
      const { readStatementPdf } = await import('./read-pdf');
      const read = await readStatementPdf(file, pass);
      if (read.ok) {
        setLocked(null);
        setPassword('');
        acceptTable(file.name, 'pdf', read.table);
      } else if (read.reason === 'password' || read.reason === 'wrong-password') {
        setLocked(file);
        if (read.reason === 'wrong-password') setFileError(PDF_PROBLEM['wrong-password']);
      } else {
        setFileError(PDF_PROBLEM[read.reason]);
      }
    } finally {
      setReading(false);
    }
  }

  async function onFile(file: File | undefined) {
    resetCheck();
    setSheet(null);
    setMapping(null);
    setFileError(null);
    setLocked(null);
    setPassword('');
    setChosen(new Map());
    setKnown({});
    setAllPlaces(false);
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      if (file.size > MAX_PDF_BYTES) {
        setFileError('That PDF is over 10 MB. Download one month or one quarter at a time.');
        return;
      }
      await openPdf(file);
      return;
    }
    if (file.size > MAX_STATEMENT_BYTES) {
      setFileError('That file is over 2 MB. Export one month at a time.');
      return;
    }
    const table = parseCsv(await file.text());
    const at = findHeaderRow(table);
    acceptTable(file.name, 'csv', {
      header: table[at] ?? [],
      body: table.slice(at + 1).filter((r) => r.length >= 2),
    });
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
      description: r.name.slice(0, 240),
      narration: r.description,
      ...(r.category ? { category: r.category } : {}),
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
      setKnown(result.known);
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
      setDone({
        inserted: result.inserted,
        skipped: result.skipped,
        month: busiestMonth(valid.filter((_, i) => selected.has(i)).map((r) => r.occurredOn!)),
      });
    });
  }

  const money = (minor: bigint) => formatMoney(minor, currency, { locale, signDisplay: 'always' });
  const columns = sheet?.header.map((name, i) => ({ i, name: name || `Column ${i + 1}` })) ?? [];
  const ticked = valid.filter((_, i) => selected.has(i));
  const selectedTotal = ticked.reduce((sum, r) => sum + r.amountMinor!, 0n);
  const spentTotal = ticked.reduce(
    (sum, r) => (r.amountMinor! < 0n ? sum - r.amountMinor! : sum),
    0n,
  );
  const byCategory = [
    ...ticked
      .filter((r) => r.amountMinor! < 0n)
      .reduce((map, r) => {
        const key = r.category ?? 'Not sorted';
        return map.set(key, (map.get(key) ?? 0n) - r.amountMinor!);
      }, new Map<string, bigint>()),
  ].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const plain = (minor: bigint) => formatMoney(minor, currency, { locale });

  // Every place money went to, largest first, unsorted ones before the rest:
  // the quickest way through a long statement is one choice per place.
  const places = [
    ...valid
      .filter((r, i) => r.amountMinor! < 0n && statuses?.[i] !== 'already-imported')
      .reduce((map, r) => {
        const place = map.get(r.key) ?? {
          key: r.key,
          name: r.name,
          count: 0,
          spentMinor: 0n,
          category: r.category,
          source: r.source,
        };
        place.count += 1;
        place.spentMinor -= r.amountMinor!;
        // The fullest spelling the bank used this time.
        if (r.name.length > place.name.length) place.name = r.name;
        return map.set(r.key, place);
      }, new Map<string, { key: string; name: string; count: number; spentMinor: bigint; category: string | null; source: (typeof valid)[number]['source'] }>())
      .values(),
  ].sort(
    (a, b) =>
      Number(a.category !== null) - Number(b.category !== null) ||
      b.count - a.count ||
      (b.spentMinor > a.spentMinor ? 1 : -1),
  );
  // Taken once, during render, the first time the preview has places.
  if (statuses && order === null && places.length > 0) setOrder(places.map((p) => p.key));
  const byKey = new Map(places.map((p) => [p.key, p]));
  const listed = order
    ? [
        ...order.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])),
        ...places.filter((p) => !order.includes(p.key)),
      ]
    : places;
  const placeCount = new Map(places.map((p) => [p.key, p.count]));
  const unsortedPlaces = places.filter((p) => p.category === null).length;
  const spending = valid.filter((r) => r.amountMinor! < 0n);
  const sortedPayments = spending.filter((r) => r.category !== null).length;

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
          Spending went into the categories you checked, so budgets and insights already count it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={done.month ? `/finance/insights?month=${done.month}` : '/finance/insights'}
            className="inline-flex h-9.5 items-center rounded-[var(--radius-control)] bg-text-primary px-4 text-sm font-medium text-surface-sunken"
          >
            See where it went
          </Link>
          <Link
            href="/finance"
            className="inline-flex h-9.5 items-center rounded-[var(--radius-control)] px-4 text-sm text-text-secondary hover:text-text-primary"
          >
            Back to Finance
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
            Statement file (PDF or CSV)
          </label>
          <input
            id="statement-file"
            type="file"
            accept=".pdf,application/pdf,.csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className={cn(
              'block w-full text-sm text-text-secondary',
              'file:mr-3 file:h-9.5 file:rounded-[var(--radius-control)] file:border file:border-border-subtle',
              'file:bg-surface-overlay file:px-4 file:text-sm file:text-text-primary hover:file:border-border-strong',
            )}
          />
        </div>
      </div>

      {reading && (
        <p role="status" className="text-sm text-text-secondary">
          Reading the statement on this device…
        </p>
      )}

      {locked && (
        <form
          className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-overlay p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void openPdf(locked, password);
          }}
        >
          <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <LockKeyhole aria-hidden className="size-4 text-text-muted" />
            This statement is locked with a password
          </p>
          <Field
            label="Statement password"
            name="statement-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Only used to open the file here. It is not saved or sent anywhere."
          />
          <Button type="submit" loading={reading} disabled={password === ''} className="self-start">
            Open statement
          </Button>
        </form>
      )}

      {fileError && <FormAlert>{fileError}</FormAlert>}

      {/* 2 · how the columns were read */}
      {sheet && mapping && (
        <section aria-labelledby="import-columns" className="flex flex-col gap-4">
          <h3
            id="import-columns"
            className="flex items-center gap-2 text-sm font-semibold text-text-primary"
          >
            <FileSpreadsheet aria-hidden className="size-4 text-text-muted" />
            {sheet.fileName} · {sheet.body.length} rows —{' '}
            {sheet.kind === 'pdf' ? 'check how it was read' : 'check the columns'}
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
          {byCategory.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-overlay p-4">
              <p className="text-sm font-semibold text-text-primary">
                Where the money went ·{' '}
                <span className="numeric font-normal text-text-secondary">{plain(spentTotal)}</span>
              </p>
              <ul className="flex flex-col gap-2">
                {byCategory.slice(0, 6).map(([name, minor]) => {
                  const pct = spentTotal > 0n ? Number((minor * 1000n) / spentTotal) / 10 : 0;
                  return (
                    <li key={name} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-text-primary">{name}</span>
                        <span className="numeric text-text-secondary">
                          {plain(minor)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full bg-finance"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {places.length > 0 && (
            <section
              aria-labelledby="import-places"
              className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-overlay p-4"
            >
              <div>
                <h3 id="import-places" className="text-sm font-semibold text-text-primary">
                  Sort by place
                </h3>
                <p className="mt-0.5 text-xs text-pretty text-text-secondary">
                  {sortedPayments} of {spending.length} payments have a category
                  {unsortedPlaces > 0
                    ? ` · ${unsortedPlaces} place${unsortedPlaces === 1 ? '' : 's'} to sort`
                    : ''}
                  . One choice files every payment to that place, and is remembered for your next
                  statement.
                </p>
              </div>
              <ul className="flex flex-col divide-y divide-border-subtle/70">
                {(allPlaces ? listed : listed.slice(0, 8)).map((place) => (
                  <li key={place.key} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">{place.name}</p>
                      <p className="numeric text-xs text-text-muted">
                        {place.count} payment{place.count === 1 ? '' : 's'} ·{' '}
                        {plain(place.spentMinor)}
                        {place.source === 'remembered' && ' · remembered'}
                      </p>
                    </div>
                    <select
                      aria-label={`Category for every payment to ${place.name}`}
                      value={place.category ?? ''}
                      onChange={(e) => choose(place.key, e.target.value || null)}
                      className={cn(
                        'h-8 max-w-40 shrink-0 rounded-full border px-3 text-xs',
                        place.category === null
                          ? 'border-warning/50 bg-warning-soft/30 text-text-primary'
                          : 'border-border-subtle bg-surface-raised text-text-secondary',
                      )}
                    >
                      <option value="">Not sorted</option>
                      {categoryOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              {places.length > 8 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setAllPlaces((v) => !v)}
                >
                  {allPlaces ? 'Show fewer' : `Show all ${places.length} places`}
                </Button>
              )}
            </section>
          )}

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
              const imported = status === 'already-imported';
              return (
                <li key={row.line} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Import ${row.description} on ${row.occurredOn}`}
                    checked={selected.has(i)}
                    disabled={imported}
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
                        imported ? 'text-text-muted' : 'text-text-primary',
                      )}
                      title={row.description}
                    >
                      {row.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span className="numeric">{row.occurredOn}</span>
                      <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                      {row.amountMinor! < 0n && !imported && (
                        <select
                          aria-label={`Category for ${row.name}`}
                          value={row.category ?? ''}
                          onChange={(e) => choose(row.key, e.target.value || null)}
                          className="h-6 max-w-36 rounded-full border border-border-subtle bg-surface-overlay px-2 text-xs text-text-secondary"
                        >
                          <option value="">Not sorted</option>
                          {categoryOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      )}
                      {row.amountMinor! < 0n && !imported && (placeCount.get(row.key) ?? 0) > 1 && (
                        <span>with {(placeCount.get(row.key) ?? 0) - 1} more</span>
                      )}
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
