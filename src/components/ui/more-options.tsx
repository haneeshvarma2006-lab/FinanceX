'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Progressive disclosure, so the list owns the page rather than the form.
 *
 * Capturing a task has to be one field and one click, because anything slower
 * gets done on paper instead. Everything that refines a task — when, how
 * often, which project — is real and stays one click away, not removed.
 */
export function MoreOptions({ children }: { children: React.ReactNode }) {
  return (
    <details className="group">
      <summary
        className={cn(
          'inline-flex cursor-pointer list-none items-center gap-1',
          'rounded-[var(--radius-control)] py-1 pr-2 pl-1.5',
          'text-xs text-text-secondary select-none',
          'transition-colors duration-[var(--duration-fast)] ease-(--ease-out-soft)',
          'hover:bg-surface-overlay hover:text-text-primary',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 text-text-muted',
            'transition-transform duration-[var(--duration-fast)] ease-(--ease-out-soft)',
            'group-open:rotate-90',
          )}
        />
        More options
      </summary>

      <div className="mt-4 flex flex-col gap-4 border-t border-border-subtle pt-4">{children}</div>
    </details>
  );
}
