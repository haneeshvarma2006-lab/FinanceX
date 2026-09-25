'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, FormAlert } from '@/components/ui/form';
import { completePasswordResetAction, type FormState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? 'Saving…' : 'Set new password'}
    </Button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(completePasswordResetAction, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <FormAlert>
          {state.message}{' '}
          <Link href="/forgot-password" className="underline">
            Send a new link
          </Link>
        </FormAlert>
      )}

      <input type="hidden" name="token" value={token} />

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A phrase you can remember works well."
        required
        error={state.fieldErrors?.password}
      />

      <Submit />
    </form>
  );
}
