import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/current-user';

export const metadata: Metadata = { title: 'Today' };

/**
 * Placeholder. The real Today surface composes tasks, habits, budget alerts and
 * trading prompts, and arrives with M2 onward — it is not stubbed with fake
 * numbers here, because a dashboard of invented data is worse than an honest
 * empty state.
 */
export default async function TodayPage() {
  const user = await requireUser();

  const modules = [
    { name: 'Tasks & focus', milestone: 'M2', accent: 'text-tasks' },
    { name: 'Habits & goals', milestone: 'M2', accent: 'text-tasks' },
    { name: 'Finance tracker', milestone: 'M3', accent: 'text-finance' },
    { name: 'Trading journal', milestone: 'M4', accent: 'text-trading' },
    { name: 'Connections & rules', milestone: 'M5', accent: 'text-accent' },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Good to see you, {user.displayName}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your account is set up with {user.baseCurrency} as the base currency.
        </p>
      </div>

      <section
        aria-labelledby="whats-next"
        className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised p-6"
      >
        <h2 id="whats-next" className="text-sm font-medium text-text-primary">
          What is built so far
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Accounts, sessions and the security baseline are done. The feature modules land next, in
          this order:
        </p>

        <ul className="mt-5 flex flex-col divide-y divide-border-subtle">
          {modules.map((m) => (
            <li key={m.name} className="flex items-center justify-between gap-4 py-3">
              <span className={`text-sm ${m.accent}`}>{m.name}</span>
              <span className="numeric rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
                {m.milestone}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
