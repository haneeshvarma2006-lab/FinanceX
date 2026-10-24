'use client';

import { useActionState, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { FormState } from '@/lib/result';
import { recategoriseAction } from './actions';

/**
 * A payment's category, changed in place: picking one saves it straight
 * away, with no separate button to find on a phone.
 */
export function CategoryPicker({
  id,
  label,
  value,
  options,
}: {
  id: string;
  /** What the payment is, for its accessible name. */
  label: string;
  value: string | null;
  options: string[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(recategoriseAction, {});

  return (
    <form ref={form} action={action} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <select
        name="category"
        aria-label={`Category for ${label}`}
        defaultValue={value ?? ''}
        disabled={pending}
        onChange={() => form.current?.requestSubmit()}
        className={cn(
          'h-7 max-w-36 rounded-full border px-2.5 text-xs',
          value
            ? 'border-border-subtle bg-surface-overlay text-text-secondary'
            : 'border-warning/50 bg-warning-soft/30 text-text-primary',
        )}
      >
        <option value="">Not sorted</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {state.tone === 'error' && (
        <span role="alert" className="text-xs text-negative">
          {state.message}
        </span>
      )}
    </form>
  );
}
