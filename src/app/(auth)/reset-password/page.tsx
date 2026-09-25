import type { Metadata } from 'next';
import Link from 'next/link';
import { isResetLinkLive } from '@/modules/identity/password-reset';
import { ResetPasswordForm } from './form';

export const metadata: Metadata = { title: 'Choose a new password' };

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Checked, not consumed: mail scanners open every link in a message, and a
  // page view that used up the token would break it before its owner clicked.
  const live =
    typeof token === 'string' && TOKEN_SHAPE.test(token) && (await isResetLinkLive(token));

  if (!live) {
    return (
      <>
        <h1 className="text-lg font-semibold text-text-primary">This link has expired</h1>
        <p className="mt-2 text-sm text-pretty text-text-secondary">
          Reset links work once and only for a short time, and a newer request replaces an older
          one. Ask for a fresh link and use the most recent email.
        </p>
        <p className="mt-6 text-center text-sm">
          <Link href="/forgot-password" className="text-accent hover:underline">
            Send a new reset link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary">Choose a new password</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        Every device signed in to your account will be signed out.
      </p>
      <ResetPasswordForm token={token} />
    </>
  );
}
