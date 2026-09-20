import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readPendingRegistrationCookie } from '@/lib/auth/cookies';
import { hashToken } from '@/lib/security/tokens';
import * as repo from '@/modules/identity/repository';
import { CompleteSignUpForm } from './form';

export const metadata: Metadata = { title: 'Finish signing up', robots: { index: false } };

/**
 * Where a new Google user lands.
 *
 * The identity has already been verified against Google, but an account is not
 * created until the age gate and consent are satisfied — the OAuth path must
 * not be a way around either.
 */
export default async function CompleteSignUpPage() {
  const token = await readPendingRegistrationCookie();
  if (!token) redirect('/sign-in');

  const pending = await repo.findPendingRegistration(hashToken(token), new Date());
  if (!pending) redirect('/sign-in?error=google_expired');

  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary">Almost there</h1>
      <p className="mt-1 mb-6 text-sm text-pretty text-text-secondary">
        Signed in as <span className="text-text-primary">{pending.email}</span>. Two things left
        before your account is created.
      </p>

      <CompleteSignUpForm defaultName={pending.displayName ?? ''} />

      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link href="/sign-in" className="text-accent hover:underline">
          Use a different account
        </Link>
      </p>
    </>
  );
}
