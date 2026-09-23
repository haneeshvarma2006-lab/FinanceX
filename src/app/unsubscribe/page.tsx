import type { Metadata } from 'next';
import Link from 'next/link';
import { EMAIL_CATEGORIES, isEmailCategory } from '@/modules/email/categories';
import { unsubscribeByToken } from '@/modules/email/service';
import { brand } from '@/lib/brand';
import { Wordmark } from '@/components/ui/wordmark';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };

/**
 * One-click unsubscribe landing page.
 *
 * The token identifies the account and the category, so unsubscribing never
 * requires signing in — an unsubscribe link that demands a login is one most
 * people cannot use, which is the point of RFC 8058.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await unsubscribeByToken(token) : undefined;

  const label =
    result && isEmailCategory(result.category) ? EMAIL_CATEGORIES[result.category].label : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 py-16">
      <Link href="/">
        <Wordmark className="text-sm" />
      </Link>

      {label ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            You are unsubscribed
          </h1>
          <p className="text-sm text-pretty text-text-secondary">
            You will no longer receive <strong className="text-text-primary">{label}</strong> from
            {brand.name}. Your other email settings are unchanged, and essential account email
            continues while your account is open.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            This link has expired
          </h1>
          <p className="text-sm text-pretty text-text-secondary">
            Unsubscribe links work once. If you have already used this one, you are already
            unsubscribed. You can change every email setting from your account.
          </p>
        </>
      )}

      <p className="text-sm text-text-secondary">
        <Link href="/settings/email" className="text-accent hover:underline">
          Manage all email preferences
        </Link>
      </p>
    </main>
  );
}
