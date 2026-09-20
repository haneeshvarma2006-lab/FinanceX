import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from './form';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary">Welcome back</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        Sign in to pick up where you left off.
      </p>

      <SignInForm />

      <p className="mt-6 text-center text-sm text-text-secondary">
        New here?{' '}
        <Link href="/sign-up" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
