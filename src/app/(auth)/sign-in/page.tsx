import type { Metadata } from 'next';
import Link from 'next/link';
import { isGoogleConfigured } from '@/modules/identity/oauth';
import { SignInForm } from './form';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  google_unavailable: 'Google sign-in is not configured on this deployment.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_invalid: 'Google sign-in could not be completed. Please try again.',
  google_expired: 'That sign-in attempt expired. Please try again.',
  google_email_unverified:
    'Google has not verified that email address, so it cannot be used to sign in.',
  google_already_linked_elsewhere:
    'That Google account is already connected to a different KyliX account.',
  google_local_account_unverified:
    'An account already uses that address but has never confirmed it. Sign in with your password, then connect Google from Settings.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Looked up in a fixed table: nothing from the query string is rendered.
  const message = error ? ERRORS[error] : undefined;

  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary">Welcome back</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        Sign in to pick up where you left off.
      </p>

      <SignInForm googleEnabled={isGoogleConfigured()} initialMessage={message} />

      <p className="mt-6 text-center text-sm text-text-secondary">
        New here?{' '}
        <Link href="/sign-up" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
