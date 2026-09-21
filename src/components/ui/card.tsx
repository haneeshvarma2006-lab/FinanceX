import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The card is the product's primary container.
 *
 * It sits one step above the page surface and carries a hairline border plus
 * a contact shadow — enough separation to read as a distinct object without
 * a gradient or a glow doing the work.
 */
export function Card({
  children,
  className,
  as: Tag = 'section',
  tone,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  /** Tints the border only. The card surface never changes colour. */
  tone?: 'warning' | 'negative' | 'accent';
}) {
  const toneBorder = tone
    ? { warning: 'border-warning/35', negative: 'border-negative/35', accent: 'border-accent/35' }[
        tone
      ]
    : 'border-border-subtle';

  return (
    <Tag
      className={cn(
        'rounded-[var(--radius-card)] border bg-surface-raised shadow-(--shadow-raised)',
        toneBorder,
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-sm leading-5 font-medium text-text-primary">
          {title}
        </h2>
        {description && <p className="mt-1 text-xs text-text-secondary">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

/**
 * A single figure with its label.
 *
 * Extracted because a KPI rendered slightly differently on each page is the
 * clearest sign of a template rather than a product.
 */
export function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'positive' | 'negative' | 'muted';
}) {
  const valueTone = {
    positive: 'text-positive',
    negative: 'text-negative',
    muted: 'text-text-secondary',
  }[tone ?? 'muted'];

  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium tracking-wide text-text-muted uppercase">{label}</dt>
      <dd
        className={cn(
          // Never truncated: an elided figure is worse than a wrapped one,
          // and money is the whole reason the tile exists.
          'numeric mt-1.5 text-lg leading-tight break-words sm:text-xl',
          tone ? valueTone : 'text-text-primary',
        )}
      >
        {value}
      </dd>
      {detail && <p className="numeric mt-1 text-xs text-text-muted">{detail}</p>}
    </div>
  );
}
