'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { signInAction, type FormState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function SignInForm() {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        // role="alert" so the failure is announced, not just rendered.
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
        >
          {state.message}
        </p>
      )}

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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <Submit />
    </form>
  );
}
