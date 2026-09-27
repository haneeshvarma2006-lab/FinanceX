import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bell,
  CalendarDays,
  CandlestickChart,
  Flag,
  GraduationCap,
  ListChecks,
  PieChart,
  Rocket,
  Sprout,
  Target,
  TrendingDown,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Tone } from './charts';

/** Icons referenced by name from data.ts, so the data stays serialisable. */
export const ICONS = {
  activity: Activity,
  bell: Bell,
  calendar: CalendarDays,
  candlestick: CandlestickChart,
  flag: Flag,
  graduationCap: GraduationCap,
  listChecks: ListChecks,
  pieChart: PieChart,
  rocket: Rocket,
  sprout: Sprout,
  target: Target,
  trendingDown: TrendingDown,
  trophy: Trophy,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const TONE_TEXT: Record<Tone, string> = {
  tasks: 'text-brand-tasks',
  finance: 'text-brand-finance',
  trading: 'text-brand-trading',
};

export const TONE_SOFT: Record<Tone, string> = {
  tasks: 'bg-brand-tasks/10 text-brand-tasks ring-brand-tasks/20',
  finance: 'bg-brand-finance/10 text-brand-finance ring-brand-finance/20',
  trading: 'bg-brand-trading/10 text-brand-trading ring-brand-trading/20',
};

export const TONE_DOT: Record<Tone, string> = {
  tasks: 'bg-brand-tasks',
  finance: 'bg-brand-finance',
  trading: 'bg-brand-trading',
};

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-5 sm:px-8', className)}>{children}</div>;
}

/** A tinted square holding an icon, in its domain's colour. */
export function ToneChip({
  tone,
  icon,
  size = 'md',
}: {
  tone: Tone;
  icon: IconName;
  size?: 'sm' | 'md';
}) {
  const Icon = ICONS[icon];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
        size === 'md' ? 'size-9' : 'size-7',
        TONE_SOFT[tone],
      )}
    >
      <Icon className={size === 'md' ? 'size-4' : 'size-3.5'} strokeWidth={1.75} />
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'lp-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5',
        'text-xs text-brand-ink-muted',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  body,
  align = 'center',
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div className={cn('flex flex-col gap-5', align === 'center' && 'items-center text-center')}>
      <p className="inline-flex items-center gap-3 text-xs font-medium tracking-brand text-brand-ink-subtle uppercase">
        <span
          aria-hidden
          className="h-px w-8 bg-linear-to-r from-transparent to-brand-ink-subtle"
        />
        {eyebrow}
        <span
          aria-hidden
          className="h-px w-8 bg-linear-to-l from-transparent to-brand-ink-subtle"
        />
      </p>
      {/* An <em> in the title is set in the serif italic: the one word that
          carries the feeling, against Geist's engineering. */}
      <h2 className="lp-ink max-w-4xl pb-1 text-4xl leading-[1.02] font-semibold tracking-tighter text-balance sm:text-6xl [&_em]:pr-1 [&_em]:font-serif [&_em]:font-normal [&_em]:tracking-normal">
        {title}
      </h2>
      {body && (
        <p className="max-w-2xl text-base text-pretty text-brand-ink-muted sm:text-lg">{body}</p>
      )}
    </div>
  );
}

/**
 * Link-buttons for the marketing page. Primary is ink on canvas — the
 * inverted, high-contrast treatment the brief's references share — rather
 * than a saturated brand fill competing with the three domain colours.
 */
export function ButtonLink({
  href,
  children,
  variant = 'primary',
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  return (
    <Link
      href={href as '/'}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5.5 text-sm font-medium',
        'transition-[background-color,border-color,color,box-shadow] duration-[var(--duration-fast)]',
        'ease-(--ease-out-soft) focus-visible:outline-offset-4',
        variant === 'primary'
          ? // A soft halo of the ink itself: the button glows rather than floats.
            'lp-btn-glow bg-brand-ink text-brand-canvas hover:bg-brand-ink/90'
          : 'lp-card text-brand-ink backdrop-blur hover:text-brand-ink',
        className,
      )}
    >
      {children}
    </Link>
  );
}
