'use client';

import { useActionState, useEffect, useState } from 'react';
import { Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/sheet';
import type { FormState } from '@/lib/result';
import { sortPayeeAction } from './actions';

export type UnsortedPayee = {
  key: string;
  name: string;
  count: number;
  /** Already formatted in the person's currency and locale. */
  spent: string;
};

/**
 * The month's spending that has no category yet, one row per place. Picking
 * a category files every uncategorised payment to that place — this month
 * and every other — and the choice is remembered for the next statement.
 */
export function SortPayees({
  payees,
  categories,
}: {
  payees: UnsortedPayee[];
  categories: string[];
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const shown = all ? payees : payees.slice(0, 10);

  return (
    <>
      {payees.length === 0 && (
        <p className="px-5 py-4 text-sm text-text-secondary">
          Every payment this month has a category.
        </p>
      )}
      <ul className="divide-y divide-border-subtle/70">
        {shown.map((payee) => (
          <PayeeRow key={payee.key} payee={payee} categories={categories} onDone={setToast} />
        ))}
      </ul>
      {payees.length > 10 && (
        <div className="border-t border-border-subtle/70 px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${payees.length} places`}
          </Button>
        </div>
      )}
      {toast && <Toast message={toast} icon={<Tags aria-hidden />} />}
    </>
  );
}

function PayeeRow({
  payee,
  categories,
  onDone,
}: {
  payee: UnsortedPayee;
  categories: string[];
  onDone: (message: string) => void;
}) {
  const [category, setCategory] = useState('');
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await sortPayeeAction(prev, data);
    if (result.tone === 'success' && result.message) onDone(result.message);
    return result;
  }, {});

  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{payee.name}</p>
        <p className="numeric text-xs text-text-muted">
          {payee.count} payment{payee.count === 1 ? '' : 's'} · {payee.spent}
        </p>
        {state.tone === 'error' && state.message && (
          <p role="alert" className="mt-1 text-xs text-negative">
            {state.message}
          </p>
        )}
      </div>
      <form action={action} className="flex shrink-0 items-center gap-2">
        <input type="hidden" name="key" value={payee.key} />
        <select
          name="category"
          aria-label={`Category for ${payee.name}`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 w-40 rounded-full border border-border-subtle bg-surface-overlay px-3 text-sm text-text-primary"
        >
          <option value="">Pick a category</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          size="sm"
          loading={pending}
          disabled={category === ''}
          aria-label={`File ${payee.name} under ${category || 'a category'}`}
        >
          File
        </Button>
      </form>
    </li>
  );
}
