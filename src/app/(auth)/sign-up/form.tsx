'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CheckboxField, Field, FormAlert } from '@/components/ui/form';
import { signUpAction, type FormState } from '../actions';

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});

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
        {state.message && <FormAlert>{state.message}</FormAlert>}

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

        <Field
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          autoComplete="bday"
          required
          hint="KyliX is for people aged 18 and over."
          error={state.fieldErrors?.dateOfBirth}
        />

        <CheckboxField
          name="acceptedTerms"
          label="I accept the terms and privacy notice"
          hint="Both are drafts and have not been reviewed by a lawyer."
        />
        {state.fieldErrors?.acceptedTerms && (
          <p className="-mt-2 text-xs text-negative">{state.fieldErrors.acceptedTerms}</p>
        )}

        <CheckboxField
          name="marketingOptIn"
          label="Send me tips and product updates"
          hint="Optional. Off unless you tick it, and you can change it at any time."
        />

        <p className="text-xs text-pretty text-text-muted">
          Password reset by email is not available in this build — no mail provider is configured.
          Keep your password somewhere safe. Read the{' '}
          <Link href="/legal/privacy" className="text-accent hover:underline">
            privacy notice
          </Link>{' '}
          and{' '}
          <Link href="/legal/terms" className="text-accent hover:underline">
            terms
          </Link>
          .
        </p>

        <Button type="submit" fullWidth loading={pending}>
          Create account
        </Button>
      </form>
    </div>
  );
}
