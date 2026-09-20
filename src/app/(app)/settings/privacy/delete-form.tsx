'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert } from '@/components/ui/form';
import { deleteAccount, type ActionState } from '../actions';

export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteAccount, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete my account
      </Button>
    );
  }

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      {state.message && <FormAlert>{state.message}</FormAlert>}

      <p className="text-sm text-pretty text-text-secondary">
        This removes your account and every record in it — transactions, budgets, trades and notes.
        It cannot be undone.
      </p>

      {hasPassword && (
        <Field
          label="Your password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      )}

      <Field
        label="Type DELETE to confirm"
        name="confirmation"
        required
        autoComplete="off"
        hint="Exactly DELETE, in capitals."
      />

      <div className="flex gap-2">
        <Button type="submit" variant="danger" loading={pending}>
          Permanently delete
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
