'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Check, ImageUp, Loader2, RotateCcw, ScanLine } from 'lucide-react';
import type { Worker } from 'tesseract.js';
import { isCurrency, parseAmount, type Currency } from '@nestedflow/domain/money';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { readReceipt, type ReceiptGuess } from '@/modules/finance/receipt';
import { createTransaction, type FormState } from '../actions';
import { findBillMatchesAction, type BillMatch } from './actions';

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string };

/** Long edge of the image handed to the reader: sharp enough for small print. */
const READ_EDGE = 1800;

/**
 * Draw the photo onto a canvas, scaled, in grey with its contrast stretched.
 * Receipts are mostly faded thermal print on off-white paper; spreading the
 * darkest and lightest tones apart is the cheapest large gain in accuracy.
 */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, READ_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const grey = Math.round(0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!);
    px[i] = grey;
    histogram[grey]! += 1;
  }
  // Stretch between the 2nd and 98th percentile, so a few specks of pure
  // black or white do not pin the range.
  const total = px.length / 4;
  let low = 0;
  let high = 255;
  for (let sum = 0, v = 0; v < 256; v += 1) {
    sum += histogram[v]!;
    if (sum >= total * 0.02) {
      low = v;
      break;
    }
  }
  for (let sum = 0, v = 255; v >= 0; v -= 1) {
    sum += histogram[v]!;
    if (sum >= total * 0.02) {
      high = v;
      break;
    }
  }
  const range = Math.max(1, high - low);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i]! - low) * 255) / range));
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

/**
 * Scan a bill into an expense, entirely on the phone: the photo is read here
 * by Tesseract (open source, Apache-2.0), never uploaded, and nothing is
 * saved until the user checks the figures and taps Add.
 */
export function BillScanner({
  accounts,
  categories,
  today,
}: {
  accounts: Account[];
  categories: Category[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTransaction, {});
  const worker = useRef<Promise<Worker> | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'reading' | 'read' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [guess, setGuess] = useState<ReceiptGuess | null>(null);
  const [rawText, setRawText] = useState('');
  const [matches, setMatches] = useState<BillMatch[]>([]);
  const [addAnyway, setAddAnyway] = useState(false);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const currency: Currency = (() => {
    const c = accounts.find((a) => a.id === accountId)?.currency ?? 'INR';
    return isCurrency(c) ? c : 'INR';
  })();

  useEffect(() => {
    return () => {
      void worker.current?.then((w) => w.terminate());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function reset() {
    setPreview(null);
    setPhase('idle');
    setGuess(null);
    setRawText('');
    setMatches([]);
    setAddAnyway(false);
    setAmount('');
    setDate(today);
    setDescription('');
    setCategoryId('');
  }

  // A saved expense makes way for the next bill.
  const [seen, setSeen] = useState(state);
  const [saved, setSaved] = useState(false);
  if (state !== seen) {
    setSeen(state);
    if (state.tone === 'success') {
      setSaved(true);
      reset();
    }
  }

  async function checkMatches(value: string, day: string) {
    let minor: bigint;
    try {
      minor = parseAmount(value, currency);
    } catch {
      setMatches([]);
      return;
    }
    if (minor <= 0n) {
      setMatches([]);
      return;
    }
    setMatches(await findBillMatchesAction(minor.toString(), day));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    reset();
    setSaved(false);
    setPreview(URL.createObjectURL(file));
    setPhase('reading');
    setProgress(0);

    try {
      worker.current ??= import('tesseract.js').then(({ createWorker }) =>
        createWorker('eng', 1, {
          workerPath: '/ocr/worker.min.js',
          corePath: '/ocr/core',
          langPath: '/ocr/lang',
          workerBlobURL: false,
          logger: (m) => {
            if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
          },
        }),
      );
      const reader = await worker.current;
      await reader.setParameters({ preserve_interword_spaces: '1' });
      const canvas = await prepare(file);
      const { data } = await reader.recognize(canvas);
      const found = readReceipt(data.text, currency, today);

      setRawText(data.text.trim());
      setGuess(found);
      setAmount(found.total ?? '');
      setDate(found.date ?? today);
      setDescription(found.merchant ?? '');
      const hint = found.categoryHint?.toLowerCase();
      setCategoryId(categories.find((c) => c.name.toLowerCase() === hint)?.id ?? '');
      setPhase('read');
      if (found.total) await checkMatches(found.total, found.date ?? today);
    } catch {
      worker.current = null;
      setPhase('failed');
    }
  }

  const picker = (capture: boolean, label: string, Icon: typeof Camera, primary: boolean) => (
    <label
      className={cn(
        'inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-5 text-sm font-medium',
        'focus-within:ring-4 focus-within:ring-accent/20',
        primary
          ? 'bg-text-primary text-surface-sunken shadow-(--shadow-raised)'
          : 'border border-border-subtle bg-surface-overlay text-text-primary shadow-(--shadow-edge)',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' as const } : {})}
        className="sr-only"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Add an account on{' '}
        <Link
          href="/finance"
          className="font-medium text-text-primary underline-offset-4 hover:underline"
        >
          Finance
        </Link>{' '}
        first — a bill becomes an expense from one of your accounts.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {saved && phase === 'idle' && (
        <FormAlert tone="success">
          Expense added. Scan the next one whenever you&apos;re ready.
        </FormAlert>
      )}

      {phase === 'idle' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {picker(true, 'Take a photo', Camera, true)}
            {picker(false, 'Choose a photo', ImageUp, false)}
          </div>
          <p className="text-xs text-pretty text-text-muted">
            The bill is read on this device. The photo is not uploaded or kept — only the expense
            you confirm is saved.
          </p>
        </div>
      )}

      {preview && (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
          {/* A local object URL of the user's own photo: next/image cannot optimise it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The bill you chose"
            className="max-h-80 w-full rounded-xl border border-border-subtle object-contain"
          />

          <div className="flex min-w-0 flex-col gap-4">
            {phase === 'reading' && (
              <div role="status" className="flex flex-col gap-2">
                <p className="inline-flex items-center gap-2 text-sm text-text-primary">
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Reading the bill on your phone… {progress > 0 ? `${progress}%` : ''}
                </p>
                <p className="text-xs text-text-muted">
                  The first scan downloads the reader once (about 7 MB); after that it is instant to
                  start.
                </p>
              </div>
            )}

            {phase === 'failed' && (
              <>
                <FormAlert>
                  The bill could not be read on this device. Try another photo, or add the expense
                  on Finance.
                </FormAlert>
                <Button type="button" variant="secondary" onClick={reset} className="self-start">
                  Try again
                </Button>
              </>
            )}

            {phase === 'read' && guess && (
              <form action={action} className="flex flex-col gap-4" noValidate>
                <input type="hidden" name="kind" value="expense" />
                <p className="inline-flex items-center gap-2 text-sm text-text-primary">
                  <ScanLine aria-hidden className="size-4 text-text-muted" />
                  {guess.total
                    ? guess.confidence === 'high'
                      ? 'Read. Check the figures, then add.'
                      : 'Read, but check the amount carefully.'
                    : 'No total could be read. Type it from the bill.'}
                </p>

                {matches.length > 0 && !addAnyway && (
                  <div
                    role="alert"
                    className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-warning">This looks already recorded</p>
                    <ul className="mt-1 text-text-secondary">
                      {matches.map((m) => (
                        <li key={m.id}>
                          {m.description} · {formatDay(m.occurredOn)} · {m.accountName}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={reset}>
                        <Check aria-hidden className="size-3.5" />
                        It&apos;s recorded — done
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAddAnyway(true)}
                      >
                        It&apos;s a different bill
                      </Button>
                    </div>
                  </div>
                )}

                {state.tone === 'error' && state.message && <FormAlert>{state.message}</FormAlert>}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Amount"
                    name="amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => void checkMatches(amount, date)}
                    error={state.fieldErrors?.amount}
                  />
                  <Field
                    label="Date"
                    name="occurredOn"
                    type="date"
                    max={today}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    onBlur={() => void checkMatches(amount, date)}
                    error={state.fieldErrors?.occurredOn}
                  />
                </div>
                <Field
                  label="Description"
                  name="description"
                  maxLength={240}
                  placeholder="Where was this?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  error={state.fieldErrors?.description}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Paid from"
                    name="accountId"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    error={state.fieldErrors?.accountId}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Category"
                    name="categoryId"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    error={state.fieldErrors?.categoryId}
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    loading={pending}
                    disabled={matches.length > 0 && !addAnyway}
                  >
                    Add expense
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={reset}
                    icon={<RotateCcw aria-hidden className="size-4" />}
                  >
                    Scan another
                  </Button>
                </div>

                {rawText && (
                  <details className="text-xs text-text-muted">
                    <summary className="cursor-pointer">What the reader saw</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-inset p-3 whitespace-pre-wrap">
                      {rawText}
                    </pre>
                  </details>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
