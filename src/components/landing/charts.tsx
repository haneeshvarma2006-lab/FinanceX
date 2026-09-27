import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Charts for the landing page, drawn as plain SVG.
 *
 * No charting library: these are illustrations of the product with fixed
 * data, and a few dozen lines of path maths render on the server with nothing
 * shipped to the browser. Every chart carries an accessible label that states
 * what it shows, since the shape alone says nothing to a screen reader.
 */

export type Tone = 'tasks' | 'finance' | 'trading';

const STROKE: Record<Tone, string> = {
  tasks: 'stroke-brand-tasks',
  finance: 'stroke-brand-finance',
  trading: 'stroke-brand-trading',
};

const STOP: Record<Tone, string> = {
  tasks: 'var(--brand-tasks)',
  finance: 'var(--brand-finance)',
  trading: 'var(--brand-trading)',
};

/** Map a series into a viewBox, leaving headroom so the line never touches the edge. */
function toPoints(values: readonly number[], width: number, height: number, pad = 0.12) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;

  return values.map((value, i) => ({
    x: i * step,
    y: height - ((value - min) / span) * height * (1 - pad * 2) - height * pad,
  }));
}

/** A smooth path through the points: cubic segments with horizontal handles. */
function smoothPath(points: { x: number; y: number }[]): string {
  return points.reduce((path, point, i) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    const prev = points[i - 1]!;
    const mid = (prev.x + point.x) / 2;
    return `${path} C ${mid} ${prev.y}, ${mid} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

export function AreaChart({
  values,
  tone,
  label,
  className,
  height = 120,
  showEnd = true,
}: {
  values: readonly number[];
  tone: Tone;
  label: string;
  className?: string;
  height?: number;
  showEnd?: boolean;
}) {
  const id = useId();
  const width = 400;
  const points = toPoints(values, width, height);
  const line = smoothPath(points);
  const last = points[points.length - 1]!;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('lp-draw w-full overflow-visible', className)}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: STOP[tone], stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: STOP[tone], stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        className={STROKE[tone]}
      />
      {showEnd && (
        <circle
          cx={last.x}
          cy={last.y}
          r={3.5}
          vectorEffect="non-scaling-stroke"
          className={cn('lp-pop fill-brand-canvas', STROKE[tone])}
          strokeWidth={2}
        />
      )}
    </svg>
  );
}

export function Sparkline({
  values,
  tone,
  label,
  className,
}: {
  values: readonly number[];
  tone: Tone;
  label: string;
  className?: string;
}) {
  const points = toPoints(values, 100, 28, 0.1);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className={cn('lp-draw h-7 w-full', className)}
    >
      <path
        d={smoothPath(points)}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={STROKE[tone]}
      />
    </svg>
  );
}

/**
 * One bar per trade, above or below zero. Wins and losses are told apart by
 * direction as well as colour, so the chart still reads without colour.
 */
export function TradeBars({
  results,
  label,
  className,
}: {
  results: readonly number[];
  label: string;
  className?: string;
}) {
  const max = Math.max(...results.map(Math.abs)) || 1;
  const gap = 3;
  const width = results.length * 10;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      className={cn('h-10 w-full', className)}
    >
      <line x1="0" x2={width} y1="20" y2="20" className="stroke-brand-line" strokeWidth={1} />
      {results.map((r, i) => {
        const h = (Math.abs(r) / max) * 18;
        return (
          <rect
            key={i}
            x={i * 10 + gap / 2}
            y={r >= 0 ? 20 - h : 20}
            width={10 - gap}
            height={Math.max(h, 1)}
            rx={1.5}
            className={cn(
              r >= 0 ? 'lp-bar fill-brand-finance' : 'lp-bar lp-bar-down fill-brand-trading/70',
            )}
            style={{ animationDelay: `${200 + i * 60}ms` }}
          />
        );
      })}
    </svg>
  );
}

/** A labelled horizontal allocation bar, e.g. a portfolio by asset class. */
export function AllocationBar({
  parts,
  className,
  columns = 2,
}: {
  parts: readonly { label: string; share: number; className: string }[];
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.share}%`).join(', ')}
        className="lp-grow flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {parts.map((part) => (
          <span key={part.label} className={part.className} style={{ width: `${part.share}%` }} />
        ))}
      </div>
      <ul className={cn('grid gap-x-3 gap-y-1.5', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-1.5 text-2xs text-brand-ink-muted">
            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', part.className)} />
            {part.label}
            <span className="ml-auto font-figures tabular-nums text-brand-ink">{part.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A thin progress track, used for budgets and goals. */
export function Meter({
  value,
  tone,
  label,
  over = false,
}: {
  value: number;
  tone: Tone;
  label: string;
  /** Past its limit: shown in the warning colour, capped at full width. */
  over?: boolean;
}) {
  const fill = over
    ? 'bg-warning'
    : { tasks: 'bg-brand-tasks', finance: 'bg-brand-finance', trading: 'bg-brand-trading' }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-full bg-brand-line"
    >
      <div
        className={cn('lp-grow h-full rounded-full', fill)}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}
