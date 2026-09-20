import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from './form';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        One place for your tasks, your money and your trades.
      </p>

      <SignUpForm />

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have one?{' '}
        <Link href="/sign-in" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
