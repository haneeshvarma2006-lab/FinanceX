import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * The card is the product's primary container.
 *
 * It sits one step above the page surface and carries a hairline border, a
 * contact shadow, and a one-pixel lit top edge. That edge is the whole trick:
 * it is what makes a dark panel read as a raised material rather than a
 * rectangle of lighter paint, and it costs no gradient and no glow to say it.
 */

/** Which domain a card belongs to. Colour is never the only signal. */
export type Accent = 'tasks' | 'habits' | 'finance' | 'trading' | 'accent';

const ACCENT_CHIP: Record<Accent, string> = {
  tasks: 'bg-tasks/12 text-tasks',
  habits: 'bg-habits/12 text-habits',
  finance: 'bg-finance/12 text-finance',
  trading: 'bg-trading/12 text-trading',
  accent: 'bg-accent-soft text-accent',
};

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
        'rounded-[var(--radius-card)] border bg-surface-raised',
        'shadow-[var(--shadow-raised),var(--shadow-edge)]',
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
  icon,
  accent = 'accent',
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * A small tinted chip carrying the domain's accent. It is what connects a
   * card on the dashboard to its section in the navigation without either one
   * relying on colour alone — the label says the same thing.
   */
  icon?: ReactNode;
  accent?: Accent;
  id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            aria-hidden
            className={cn(
              'mt-px inline-flex size-7 shrink-0 items-center justify-center',
              'rounded-[var(--radius-control)]',
              ACCENT_CHIP[accent],
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={id} className="text-sm leading-5 font-medium tracking-tight text-text-primary">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * The link out of a card to the section it summarises.
 *
 * A chevron rather than an underline: the card is a summary, and the arrow
 * says "there is more of this over here" without competing with the figures
 * it sits beside.
 */
export function CardAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href as '/tasks'}
      className={cn(
        'group inline-flex items-center gap-0.5 rounded-[var(--radius-control)]',
        'py-0.5 pr-1 pl-1.5 text-xs text-text-secondary',
        'transition-colors duration-[var(--duration-fast)] ease-(--ease-out-soft)',
        'hover:bg-surface-overlay hover:text-text-primary',
      )}
    >
      {children}
      <ChevronRight
        aria-hidden
        className={cn(
          'size-3.5 text-text-muted',
          'transition-transform duration-[var(--duration-fast)] ease-(--ease-out-soft)',
          'group-hover:translate-x-0.5',
        )}
      />
    </Link>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

/**
 * A row of figures.
 *
 * Hairline rules between the columns rather than whitespace alone: a set of
 * numbers that is visibly one object reads as a summary, where three floating
 * numbers read as three unrelated facts. The rules disappear when the columns
 * stack, because a horizontal rule between stacked rows would say the wrong
 * thing.
 */
export function StatGrid({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns];

  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-4',
        cols,
        'sm:gap-0 sm:divide-x sm:divide-border-subtle',
        // Pulls the first column flush with the card padding while the
        // dividers still sit centred in the gutter.
        'sm:[&>*]:px-5 sm:[&>*:first-child]:pl-0 sm:[&>*:last-child]:pr-0',
      )}
    >
      {children}
    </dl>
  );
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
          'numeric mt-1.5 text-lg leading-tight tracking-tight break-words sm:text-xl',
          tone ? valueTone : 'text-text-primary',
        )}
      >
        {value}
      </dd>
      {detail && <p className="numeric mt-1 text-xs text-text-muted">{detail}</p>}
    </div>
  );
}
