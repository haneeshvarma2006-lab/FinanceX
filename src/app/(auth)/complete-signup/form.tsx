'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CheckboxField, Field, FormAlert } from '@/components/ui/form';
import { completeOAuthSignUpAction, type FormState } from '../actions';
import { brand } from '@/lib/brand';

export function CompleteSignUpForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    completeOAuthSignUpAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <FormAlert>{state.message}</FormAlert>}

      <Field
        label="Name"
        name="displayName"
        defaultValue={defaultName}
        autoComplete="name"
        required
        error={state.fieldErrors?.displayName}
      />

      <Field
        label="Date of birth"
        name="dateOfBirth"
        type="date"
        autoComplete="bday"
        required
        hint={`${brand.name} is for people aged 18 and over.`}
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
        hint="Optional. Off unless you tick it."
      />

      <p className="text-xs text-pretty text-text-muted">
        Read the{' '}
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
        Create my account
      </Button>
    </form>
  );
}
