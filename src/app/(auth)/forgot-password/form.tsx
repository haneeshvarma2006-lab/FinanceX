'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, FormAlert } from '@/components/ui/form';
import { requestPasswordResetAction, type FormState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? 'Sending…' : 'Email me a reset link'}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordResetAction, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <FormAlert tone={state.tone}>{state.message}</FormAlert>}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <Submit />
    </form>
  );
}
