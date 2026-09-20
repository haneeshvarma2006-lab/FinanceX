import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { Button } from '@/components/button';

export default async function LandingPage() {
  if (await getCurrentUser()) redirect('/today');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-xs tracking-[0.2em] text-text-muted uppercase">Plan · Track · Grow</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your tasks, your money, your trades.{' '}
          <span className="text-text-secondary">One system.</span>
        </h1>
        <p className="mt-5 max-w-lg text-pretty text-text-secondary">
          Most tools track one of these well. KyliX treats them as one: a run of losing trades books
          a review, a task can carry a goal, and a broken streak shows up tomorrow instead of
          disappearing.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/sign-up">
          <Button>Create an account</Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="secondary">Sign in</Button>
        </Link>
      </div>

      <p className="text-xs text-text-muted">
        KyliX is a working name. This is an early build — no bank, broker, or market-data
        connections are available.
      </p>
    </main>
  );
}
