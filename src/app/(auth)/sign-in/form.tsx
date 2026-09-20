'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, FormAlert } from '@/components/ui/form';
import { signInAction, type FormState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function SignInForm({
  googleEnabled,
  initialMessage,
}: {
  googleEnabled: boolean;
  initialMessage?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});
  const message = state.message ?? initialMessage;

  return (
    <div className="flex flex-col gap-5">
      {googleEnabled && (
        <>
          <a
            href="/api/auth/google"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-overlay px-4 py-2.5 text-sm text-text-primary transition-colors hover:border-border-strong"
          >
            Continue with Google
          </a>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border-subtle" />
            or
            <span className="h-px flex-1 bg-border-subtle" />
          </div>
        </>
      )}

      <form action={action} className="flex flex-col gap-4" noValidate>
        {message && <FormAlert>{message}</FormAlert>}

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
    </div>
  );
}
