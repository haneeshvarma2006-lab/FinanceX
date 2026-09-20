import { cn } from '@/lib/cn';
import { formatMoney, type Currency } from '@/lib/money';

/**
 * Money on screen.
 *
 * Sign is carried by a symbol and by the accessible label, not by colour alone
 * — a red number is invisible information to a colour-blind user and to anyone
 * printing in greyscale.
 */
export function Money({
  minor,
  currency,
  locale = 'en-IN',
  signed = false,
  className,
}: {
  minor: bigint;
  currency: Currency;
  locale?: string;
  /** Show +/- and tint by direction. For P&L and cashflow, not for balances. */
  signed?: boolean;
  className?: string;
}) {
  const formatted = formatMoney(minor, currency, {
    locale,
    signDisplay: signed ? 'always' : 'auto',
  });

  const tone = !signed || minor === 0n ? '' : minor > 0n ? 'text-positive' : 'text-negative';

  return (
    <span
      className={cn('numeric', tone, className)}
      // Without this, a screen reader can read "-1,234" ambiguously.
      aria-label={
        signed && minor !== 0n
          ? `${minor > 0n ? 'gain' : 'loss'} of ${formatMoney(minor < 0n ? -minor : minor, currency, { locale })}`
          : undefined
      }
    >
      {formatted}
    </span>
  );
}

export function Progress({
  value,
  max = 100,
  label,
  tone = 'accent',
}: {
  value: number;
  max?: number;
  label: string;
  tone?: 'accent' | 'positive' | 'warning' | 'negative';
}) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  const bar = {
    accent: 'bg-accent',
    positive: 'bg-positive',
    warning: 'bg-warning',
    negative: 'bg-negative',
  }[tone];

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-inset"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-[var(--duration-base)]',
          bar,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';
}) {
  const tones = {
    neutral: 'border-border-subtle text-text-muted',
    positive: 'border-positive/40 text-positive',
    negative: 'border-negative/40 text-negative',
    warning: 'border-warning/40 text-warning',
    accent: 'border-accent/40 text-accent',
  }[tone];

  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-xs whitespace-nowrap', tones)}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-pretty text-text-secondary">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
