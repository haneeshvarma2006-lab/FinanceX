'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { signUpAction, type FormState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? 'Creating account…' : 'Create account'}
    </Button>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
        >
          {state.message}
        </p>
      )}

      <Field
        label="Name"
        name="displayName"
        autoComplete="name"
        required
        error={state.fieldErrors?.displayName}
      />

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 12 characters. A memorable phrase beats a short, complicated one."
        error={state.fieldErrors?.password}
      />

      <p className="text-xs text-text-muted">
        Password reset by email is not available in this build — there is no mail provider
        configured. Keep your password somewhere safe.
      </p>

      <Submit />
    </form>
  );
}
