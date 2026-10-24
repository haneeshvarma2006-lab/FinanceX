'use client';

import { useActionState, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/sheet';
import type { FormState } from '@/lib/result';
import { trackMonthlyAction } from './actions';

export type MonthlyView = {
  key: string;
  name: string;
  /** Formatted in the person's currency and locale. */
  amount: string;
  count: number;
  /** "Next around 5 Nov". */
  next: string;
};

/**
 * Payments that come round every month and are not tracked yet. One tap
 * makes each a bill: it appears with the others on Finance and gets the
 * three-day reminder.
 */
export function MonthlyBills({ items }: { items: MonthlyView[] }) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      {items.length === 0 && (
        <p className="px-5 py-4 text-sm text-text-secondary">
          Everything that repeats monthly is tracked as a bill.
        </p>
      )}
      <ul className="divide-y divide-border-subtle/70">
        {items.map((item) => (
          <MonthlyRow key={item.key} item={item} onDone={setToast} />
        ))}
      </ul>
      {toast && <Toast message={toast} icon={<CalendarClock aria-hidden />} />}
    </>
  );
}

function MonthlyRow({ item, onDone }: { item: MonthlyView; onDone: (message: string) => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await trackMonthlyAction(prev, data);
    if (result.tone === 'success' && result.message) onDone(result.message);
    return result;
  }, {});

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{item.name}</p>
        <p className="numeric text-xs text-text-muted">
          {item.amount} · paid {item.count} months · {item.next}
        </p>
        {state.tone === 'error' && state.message && (
          <p role="alert" className="mt-1 text-xs text-negative">
            {state.message}
          </p>
        )}
      </div>
      <form action={action} className="shrink-0">
        <input type="hidden" name="key" value={item.key} />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={pending}
          aria-label={`Track ${item.name} as a monthly bill`}
        >
          Track as bill
        </Button>
      </form>
    </li>
  );
}
