import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { brand } from '@/lib/brand';
import { Wordmark } from '@/components/ui/wordmark';

/**
 * The account screens share the landing page's atmosphere — the fading grid
 * and one soft glow per domain — so signing up feels like stepping further
 * into the same product rather than onto a different site.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Someone already signed in has no business on the sign-in form.
  if (await getCurrentUser()) redirect('/today');

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="lp-grid pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-96 -translate-x-full rounded-full bg-tasks/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 size-80 rounded-full bg-trading/10 blur-3xl"
      />

      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex flex-col items-center gap-3 text-center">
          <Wordmark className="text-2xl text-text-primary" />
          <span className="inline-flex items-center gap-2 text-xs text-text-muted">
            <span aria-hidden className="flex gap-1">
              <span className="size-1.5 rounded-full bg-tasks" />
              <span className="size-1.5 rounded-full bg-finance" />
              <span className="size-1.5 rounded-full bg-trading" />
            </span>
            {brand.category}
          </span>
        </Link>

        <div className="rounded-2xl border border-border-subtle bg-surface-raised/80 p-6 shadow-[var(--shadow-sheet),var(--shadow-edge)] backdrop-blur-xl sm:p-7">
          {children}
        </div>
      </div>
    </main>
  );
}
