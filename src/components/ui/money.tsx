import { cn } from '@/lib/cn';
import { formatMoney, type Currency } from '@nestedflow/domain/money';

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
          'grow-x h-full rounded-full transition-[width]',
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

const EYEBROW_TEXT = {
  tasks: 'text-tasks',
  goals: 'text-warning',
  habits: 'text-habits',
  finance: 'text-finance',
  trading: 'text-trading',
  accent: 'text-text-muted',
} as const;

const ICON_TILE = {
  tasks: 'bg-tasks/14 text-tasks ring-tasks/30 shadow-[0_8px_32px_-8px_var(--accent-tasks)]',
  goals: 'bg-warning/14 text-warning ring-warning/30 shadow-[0_8px_32px_-8px_var(--warning)]',
  habits: 'bg-habits/14 text-habits ring-habits/30 shadow-[0_8px_32px_-8px_var(--accent-habits)]',
  finance:
    'bg-finance/14 text-finance ring-finance/30 shadow-[0_8px_32px_-8px_var(--accent-finance)]',
  trading:
    'bg-trading/14 text-trading ring-trading/30 shadow-[0_8px_32px_-8px_var(--accent-trading)]',
  accent: 'bg-surface-raised text-text-primary ring-border-strong',
} as const;

const WASH = {
  tasks: 'var(--accent-tasks)',
  goals: 'var(--warning)',
  habits: 'var(--accent-habits)',
  finance: 'var(--accent-finance)',
  trading: 'var(--accent-trading)',
  accent: 'var(--text-primary)',
} as const;

/**
 * The top of every screen, and the clearest signal of where you are.
 *
 * Each area owns a colour — Tasks blue, Goals amber, Finance
 * green, Trading violet — and its header says so three ways at once: a soft
 * wash of that colour behind the title, a lit icon tile, and the eyebrow set
 * in it. The label always says the same thing, so colour is never the only
 * signal.
 */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  icon,
  accent = 'accent',
}: {
  /** An <em> inside is set in softer ink, as on the landing page. */
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  /** The area's icon, shown in a lit tile beside the title. */
  icon?: React.ReactNode;
  accent?: keyof typeof EYEBROW_TEXT;
}) {
  return (
    <header className="relative pb-1">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 -z-10 h-72 w-[min(42rem,100vw)] opacity-[0.22] blur-3xl sm:-top-32"
        style={{
          background: `radial-gradient(closest-side, ${WASH[accent]}, transparent)`,
        }}
      />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-4">
            {icon && (
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset sm:size-14',
                  '[&>svg]:size-6 sm:[&>svg]:size-7',
                  ICON_TILE[accent],
                )}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <p
                  className={cn(
                    'mb-1 text-xs font-semibold tracking-widest uppercase',
                    EYEBROW_TEXT[accent],
                  )}
                >
                  {eyebrow}
                </p>
              )}
              <h1 className="ui-ink text-3xl leading-tight font-semibold tracking-tighter text-balance sm:text-5xl">
                {title}
              </h1>
            </div>
          </div>
          {description && (
            <p className="mt-3 max-w-prose text-sm text-pretty text-text-secondary sm:text-base">
              {description}
            </p>
          )}
        </div>
        {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
      </div>
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
          className={cn('h-4 w-1 rounded-full', done ? 'bg-accent' : 'bg-surface-inset')}
        />
      ))}
    </div>
  );
}
