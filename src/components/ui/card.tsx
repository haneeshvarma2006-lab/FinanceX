import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CardGlow } from './card-glow';

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

export const ACCENT_CHIP: Record<Accent, string> = {
  tasks: 'bg-tasks/12 text-tasks ring-tasks/25',
  habits: 'bg-habits/12 text-habits ring-habits/25',
  finance: 'bg-finance/12 text-finance ring-finance/25',
  trading: 'bg-trading/12 text-trading ring-trading/25',
  accent: 'bg-accent-soft text-accent ring-accent/25',
};

/**
 * A lit top edge in the domain's colour, fading out at both ends — the same
 * treatment the landing page gives its connected steps. It says which part of
 * the product a card belongs to before a word of it is read.
 */
const GLOW_COLOR: Record<Accent, string> = {
  tasks: 'var(--accent-tasks)',
  habits: 'var(--accent-habits)',
  finance: 'var(--accent-finance)',
  trading: 'var(--accent-trading)',
  accent: 'var(--text-primary)',
};

const ACCENT_EDGE: Record<Accent, string> = {
  tasks: 'before:via-tasks/70',
  habits: 'before:via-habits/70',
  finance: 'before:via-finance/70',
  trading: 'before:via-trading/70',
  accent: 'before:via-accent/70',
};

export function Card({
  children,
  className,
  as: Tag = 'section',
  tone,
  accent,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  /** Tints the border only. The card surface never changes colour. */
  tone?: 'warning' | 'negative' | 'accent';
  /** Lights the top edge in a domain colour. */
  accent?: Accent;
}) {
  const toneBorder = tone
    ? { warning: 'border-warning/35', negative: 'border-negative/35', accent: 'border-accent/35' }[
        tone
      ]
    : 'border-border-subtle';

  return (
    <Tag
      className={cn(
        'group/card relative isolate rounded-2xl border bg-surface-raised/75 backdrop-blur-sm',
        // A whisper of light from above, so the panel reads as material.
        'bg-linear-to-b from-text-primary/3 to-transparent',
        'shadow-[var(--shadow-raised),var(--shadow-edge)]',
        'transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-(--ease-out-soft)',
        'hover:shadow-[var(--shadow-overlay),var(--shadow-edge)]',
        accent &&
          cn(
            'before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px',
            'before:bg-linear-to-r before:from-transparent before:to-transparent',
            ACCENT_EDGE[accent],
          ),
        toneBorder,
        className,
      )}
    >
      <CardGlow color={GLOW_COLOR[accent ?? 'accent']} />
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
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle/70 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span
            aria-hidden
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
              ACCENT_CHIP[accent],
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={id} className="text-sm leading-5 font-semibold tracking-tight text-text-primary">
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
        'group inline-flex items-center gap-0.5 rounded-full border border-border-subtle/70',
        'py-1 pr-1.5 pl-2.5 text-xs text-text-secondary',
        'transition-colors duration-[var(--duration-fast)] ease-(--ease-out-soft)',
        'hover:border-border-strong hover:bg-surface-overlay hover:text-text-primary',
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
          'numeric mt-2 overflow-hidden text-lg leading-tight font-semibold tracking-tight break-words sm:text-xl',
          tone ? valueTone : 'text-text-primary',
        )}
      >
        <span className="stat-roll max-w-full">{value}</span>
      </dd>
      {detail && <p className="numeric mt-1 text-xs text-text-muted">{detail}</p>}
    </div>
  );
}
