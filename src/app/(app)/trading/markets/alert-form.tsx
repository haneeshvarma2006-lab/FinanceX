'use client';

import { useActionState } from 'react';
import { BellOff, BellRing, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField } from '@/components/ui/form';
import type { FormState } from '@/lib/result';
import { createAlert, deleteAlert, rearmAlert } from './actions';

/** "Tell me when {market} goes above/below {price}". */
export function AlertForm({
  instrumentId,
  label,
  price,
}: {
  instrumentId: string;
  label: string;
  /** The price on screen now, as a starting point. */
  price: number | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAlert, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}
      <input type="hidden" name="instrumentId" value={instrumentId} />
      <p className="text-sm text-text-secondary">
        Tell me when <strong className="text-text-primary">{label}</strong> goes…
      </p>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Direction"
          name="direction"
          defaultValue="above"
          error={state.fieldErrors?.direction}
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
        </SelectField>
        <Field
          label="Price"
          name="target"
          inputMode="decimal"
          required
          defaultValue={price === null ? '' : String(Number(price.toPrecision(8)))}
          error={state.fieldErrors?.target}
        />
      </div>
      <p className="text-xs text-text-muted">
        It rings once, while the app is open, and lands in your notifications.
      </p>
      <Button type="submit" loading={pending}>
        <BellRing aria-hidden className="size-4" />
        Set alert
      </Button>
    </form>
  );
}

export function RemoveAlertButton({ id, label }: { id: string; label: string }) {
  return (
    <form action={deleteAlert}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" aria-label={`Remove alert: ${label}`}>
        <BellOff aria-hidden className="size-3.5" />
      </Button>
    </form>
  );
}

export function RearmAlertButton({ id, label }: { id: string; label: string }) {
  return (
    <form action={rearmAlert}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" size="sm" aria-label={`Set again: ${label}`}>
        <RotateCcw aria-hidden className="size-3.5" />
        Set again
      </Button>
    </form>
  );
}
