import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Someone already signed in has no business on the sign-in form.
  if (await getCurrentUser()) redirect('/today');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <span className="text-2xl font-semibold tracking-tight text-text-primary">
            Kyli<span className="text-accent">X</span>
          </span>
          <span className="mt-1 block text-xs tracking-[0.2em] text-text-muted uppercase">
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
