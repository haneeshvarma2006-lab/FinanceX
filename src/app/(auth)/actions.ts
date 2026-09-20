'use server';

import { redirect } from 'next/navigation';
import { getRequestContext } from '@/lib/auth/request-context';
import {
  clearPendingRegistrationCookie,
  clearSessionCookie,
  readPendingRegistrationCookie,
  readSessionCookie,
  setSessionCookie,
} from '@/lib/auth/cookies';
import * as identity from '@/modules/identity/service';
import {
  completeOAuthSignUpSchema,
  signInSchema,
  signUpSchema,
} from '@/modules/identity/validators';

export type FormState = {
  /** Message shown above the form. */
  message?: string;
  /** Per-field messages, keyed by field name. */
  fieldErrors?: Record<string, string>;
};

function firstIssuePerField(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
    dateOfBirth: formData.get('dateOfBirth'),
    // An unticked checkbox submits nothing at all, which must read as "no"
    // rather than as an absent-and-therefore-default-true value.
    acceptedTerms: formData.get('acceptedTerms') === 'on',
    marketingOptIn: formData.get('marketingOptIn') === 'on',
    timezone: formData.get('timezone') || undefined,
    baseCurrency: formData.get('baseCurrency') || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: firstIssuePerField(parsed.error.issues) };
  }

  const ctx = await getRequestContext();
  const result = await identity.signUp(parsed.data, ctx);

  if (!result.ok) {
    switch (result.error.kind) {
      case 'email_taken':
        return { fieldErrors: { email: 'An account already uses this address' } };
      case 'rate_limited':
        return { message: 'Too many attempts. Please try again later.' };
      case 'age_restricted':
        return { message: result.error.message };
      default:
        return { message: 'Could not create the account. Please try again.' };
    }
  }

  await setSessionCookie(result.token, result.expiresAt);
  redirect('/today');
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { fieldErrors: firstIssuePerField(parsed.error.issues) };
  }

  const ctx = await getRequestContext();
  const result = await identity.signIn(parsed.data, ctx);

  if (!result.ok) {
    if (result.error.kind === 'rate_limited') {
      return { message: 'Too many attempts. Please wait a few minutes and try again.' };
    }
    // One message whether the address is unknown or the password is wrong, so
    // the form cannot be used to discover which addresses have accounts.
    return { message: 'That email and password do not match.' };
  }

  await setSessionCookie(result.token, result.expiresAt);
  redirect('/today');
}

export async function signOutAction(): Promise<void> {
  const token = await readSessionCookie();

  if (token) {
    // Deleted server-side, not merely forgotten by the browser — a cleared
    // cookie alone would leave a token that still works if it was captured.
    await identity.signOut(token, await getRequestContext());
  }

  await clearSessionCookie();
  redirect('/sign-in');
}

/**
 * Finish a Google sign-up.
 *
 * The identity comes from the server-side pending row, keyed by an httpOnly
 * cookie — never from the submitted form. Only the age, name and consent are
 * taken from the user, so a crafted POST cannot register a different address.
 */
export async function completeOAuthSignUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = await readPendingRegistrationCookie();
  if (!token) redirect('/sign-in');

  const parsed = completeOAuthSignUpSchema.safeParse({
    displayName: formData.get('displayName'),
    dateOfBirth: formData.get('dateOfBirth'),
    acceptedTerms: formData.get('acceptedTerms') === 'on',
    marketingOptIn: formData.get('marketingOptIn') === 'on',
  });

  if (!parsed.success) {
    return { fieldErrors: firstIssuePerField(parsed.error.issues) };
  }

  const ctx = await getRequestContext();
  const result = await identity.completeOAuthSignUp(token, parsed.data, ctx);

  if (!result.ok) {
    switch (result.error.kind) {
      case 'age_restricted':
        return { message: result.error.message };
      case 'email_taken':
        return { message: 'An account already uses this address. Sign in instead.' };
      case 'expired':
        redirect('/sign-in?error=google_expired');
      default:
        return { message: 'Could not create the account. Please try again.' };
    }
  }

  await clearPendingRegistrationCookie();
  await setSessionCookie(result.token, result.expiresAt);
  redirect('/today');
}
