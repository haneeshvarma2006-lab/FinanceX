import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { Wordmark } from '@/components/ui/wordmark';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Someone already signed in has no business on the sign-in form.
  if (await getCurrentUser()) redirect('/today');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <Wordmark className="text-2xl text-text-primary" />
          <span className="mt-1 block text-xs tracking-brand text-text-muted uppercase">
            Plan · Track · Grow
          </span>
        </Link>

        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised p-6 shadow-2xl shadow-black/20">
          {children}
        </div>
      </div>
    </main>
  );
}
