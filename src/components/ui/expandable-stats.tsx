'use client';

import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ExpandableStat = {
  key: string;
  label: string;
  value: ReactNode;
  tone?: 'positive' | 'negative';
  /** What opens under the row: the history behind the figure. */
  detail: ReactNode;
  /** Names the button, e.g. "Show what you spent this month". */
  action: string;
};

/**
 * A row of headline figures, each with a chevron that opens the history
 * behind it — the accounts behind a balance, the payments behind an income,
 * the categories and purchases behind a month's spending. One opens at a
 * time, in a panel that grows under the row.
 */
export function ExpandableStats({ stats }: { stats: readonly ExpandableStat[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();
  const current = stats.find((s) => s.key === open);

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          'grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border-subtle',
          'max-sm:[&>*:first-child]:col-span-2',
        )}
      >
        {stats.map((stat, i) => {
          const expanded = open === stat.key;
          return (
            // Label and figure share one parent, so the pair reads (and is
            // found) as one unit; the chevron sits in its top corner.
            <div
              key={stat.key}
              className={cn(
                'relative min-w-0 sm:px-5',
                i === 0 && 'sm:pl-0',
                i === stats.length - 1 && 'sm:pr-0',
              )}
            >
              <p className="pr-9 text-2xs font-medium tracking-wide text-text-muted uppercase">
                {stat.label}
              </p>
              <p
                className={cn(
                  'numeric mt-2 overflow-hidden text-lg leading-tight font-semibold tracking-tight break-words sm:text-xl',
                  i === 0 && 'max-sm:text-3xl',
                  stat.tone === 'positive' && 'text-positive',
                  stat.tone === 'negative' && 'text-negative',
                  !stat.tone && 'text-text-primary',
                )}
              >
                <span className="stat-roll max-w-full">{stat.value}</span>
              </p>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : stat.key)}
                aria-expanded={expanded}
                aria-controls={`${baseId}-panel`}
                aria-label={stat.action}
                title={stat.action}
                className={cn(
                  'absolute -top-1 right-0 inline-flex size-7 items-center justify-center rounded-full border',
                  'transition-colors duration-[var(--duration-fast)]',
                  i !== stats.length - 1 && 'sm:right-5',
                  expanded
                    ? 'border-border-strong bg-surface-overlay text-text-primary'
                    : 'border-border-subtle text-text-muted hover:border-border-strong hover:text-text-primary',
                )}
              >
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-4 transition-transform duration-[var(--duration-base)] ease-(--ease-out-soft)',
                    expanded && 'rotate-180',
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} aria-live="polite">
        <AnimatePresence initial={false} mode="wait">
          {current && (
            <motion.div
              key={current.key}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-5 border-t border-border-subtle pt-5">{current.detail}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
