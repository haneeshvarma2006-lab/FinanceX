import type { Metadata } from 'next';
import Link from 'next/link';
import { canDeliverToUsers } from '@/modules/email/service';
import { ForgotPasswordForm } from './form';

export const metadata: Metadata = { title: 'Reset your password' };

// Whether email can reach users is read at request time: it depends on the
// deployment's configuration, and must not be frozen into a prerendered page.
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  const available = canDeliverToUsers();

  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary">Reset your password</h1>

      {available ? (
        <>
          <p className="mt-1 mb-6 text-sm text-text-secondary">
            Enter the address you signed up with and we will email you a link to choose a new
            password.
          </p>
          <ForgotPasswordForm />
        </>
      ) : (
        <p className="mt-2 text-sm text-pretty text-text-secondary">
          Password reset needs email, and this deployment cannot send email yet. Nothing you entered
          would reach you, so the form is switched off rather than pretending otherwise.
        </p>
      )}

      <p className="mt-6 text-center text-sm text-text-secondary">
        Remembered it?{' '}
        <Link href="/sign-in" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
