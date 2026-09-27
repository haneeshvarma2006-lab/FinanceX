import type { Metadata } from 'next';
import Link from 'next/link';
import { isGoogleConfigured } from '@/modules/identity/oauth';
import { SignUpForm } from './form';

export const metadata: Metadata = { title: 'Create an account' };

// Only a plausible address is carried over from the landing page; anything
// else is dropped rather than echoed into the form.
const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const initialEmail = typeof email === 'string' && EMAIL_SHAPE.test(email) ? email : undefined;

  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        One place for your tasks, your money and your trades.
      </p>

      <SignUpForm googleEnabled={isGoogleConfigured()} initialEmail={initialEmail} />

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have one?{' '}
        <Link href="/sign-in" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
