import { cn } from '@/lib/cn';
import { formatMoney, type Currency } from '@kylix/domain/money';

/**
 * Money on screen.
 *
 * Direction is carried by a sign and by the accessible label, never by colour
 * alone — a red number is invisible information to a colour-blind reader and
 * to anyone printing in greyscale.
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

/**
 * A progress bar.
 *
 * Two pixels of track, a rounded fill, and a width transition. Nothing else —
 * a progress bar that animates its colour or pulses is competing with the
 * number beside it.
 */
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
          'h-full rounded-full transition-[width]',
          'duration-[var(--duration-base)] ease-(--ease-out-soft)',
          bar,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * A badge.
 *
 * Tinted background plus matching text, never a saturated fill — a row of
 * solid pills fights the content it is annotating.
 */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';
}) {
  const tones = {
    neutral: 'border-border-subtle bg-surface-inset text-text-muted',
    positive: 'border-positive/30 bg-positive-soft text-positive',
    negative: 'border-negative/30 bg-negative-soft text-negative',
    warning: 'border-warning/30 bg-warning-soft text-warning',
    accent: 'border-accent/30 bg-accent-soft text-accent',
  }[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5',
        'text-2xs leading-4 font-medium whitespace-nowrap',
        tones,
      )}
    >
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
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-prose text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/**
 * A 30-day activity strip.
 *
 * Small, honest data visualisation: one cell per day, filled when the habit
 * was logged. No axis, no tooltip, no library — the shape is the message.
 */
export function ActivityStrip({
  days,
  label,
}: {
  /** Oldest first, one boolean per day. */
  days: boolean[];
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${days.filter(Boolean).length} of the last ${days.length} days`}
      className="flex items-end gap-0.5"
    >
      {days.map((done, i) => (
        <span
          key={i}
          aria-hidden
          className={cn('h-3.5 w-1 rounded-[1px]', done ? 'bg-accent' : 'bg-surface-inset')}
        />
      ))}
    </div>
  );
}
