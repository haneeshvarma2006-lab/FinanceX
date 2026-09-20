import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

/**
 * The non-happy paths, as first-class components.
 *
 * Block 7 requires every workflow to handle loading, empty, error, and
 * permission-denied. Having them here means a screen gets them by composing
 * rather than by each author reinventing a slightly different version.
 */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full border border-border-subtle bg-surface-inset p-3 text-text-muted">
        {icon ?? <Inbox aria-hidden className="size-5" />}
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-pretty text-text-secondary">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full border border-negative/40 bg-negative/10 p-3 text-negative">
        <AlertTriangle aria-hidden className="size-5" />
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-pretty text-text-secondary">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden className="size-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

export function PermissionDenied({
  description = 'You do not have access to this. If you think that is wrong, check you are signed in to the right account.',
}: {
  description?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full border border-border-subtle bg-surface-inset p-3 text-text-muted">
        <Lock aria-hidden className="size-5" />
      </div>
      <p className="text-sm font-medium text-text-primary">Not available</p>
      <p className="mt-1 max-w-sm text-sm text-pretty text-text-secondary">{description}</p>
    </div>
  );
}

/** Shape-matched placeholder, so the layout does not jump when data lands. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded bg-surface-overlay', className)} />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
