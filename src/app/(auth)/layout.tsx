import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { brand } from '@/lib/brand';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Wordmark } from '@/components/ui/wordmark';

/**
 * The account screens share the landing page's atmosphere — one horizon of
 * light and a fine grain — so signing up feels like stepping further into the
 * same product rather than onto a different site.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Someone already signed in has no business on the sign-in form.
  if (await getCurrentUser()) redirect('/today');

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* The landing page's light and grain, so signing up feels like
          stepping further into the same place. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-240">
        <div className="lp-horizon lp-breathe absolute inset-0" />
      </div>
      <div aria-hidden className="lp-noise" />

      <ThemeToggle className="absolute top-4 right-4" />

      <div className="enter w-full max-w-sm">
        <Link href="/" className="mb-8 flex flex-col items-center gap-3 text-center">
          <Wordmark className="text-3xl tracking-tighter text-text-primary" />
          <span className="inline-flex items-center gap-2 text-xs text-text-muted">
            <span aria-hidden className="flex gap-1">
              <span className="size-1.5 rounded-full bg-tasks" />
              <span className="size-1.5 rounded-full bg-finance" />
              <span className="size-1.5 rounded-full bg-trading" />
            </span>
            {brand.category}
          </span>
        </Link>

        <div className="ui-card rounded-3xl p-6 shadow-[var(--shadow-sheet)] backdrop-blur-xl sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
