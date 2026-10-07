import { cn } from '@/lib/cn';

const ACCENT_DOT = {
  finance: 'bg-finance',
  trading: 'bg-trading',
  tasks: 'bg-tasks',
} as const;

/**
 * A trend line inside a stat tile.
 *
 * One series, so no legend: the tile's label names it. The line is drawn in
 * muted ink and only the latest point wears the section's colour — the eye
 * goes to "now", and the history reads as context. Geometry is computed in
 * integer arithmetic from minor units, so money never passes through a float
 * on its way to the screen. The accessible name carries the actual values,
 * which is the table view for a chart this small.
 */
export function Sparkline({
  values,
  label,
  accent,
  className,
}: {
  values: readonly bigint[];
  /** A sentence with the values, read in place of the drawing. */
  label: string;
  accent: keyof typeof ACCENT_DOT;
  className?: string;
}) {
  if (values.length < 2) return null;

  const SCALE = 1000n;
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  // 0 at the bottom, 1000 at the top; a flat series sits in the middle.
  const y = (v: bigint) => (span === 0n ? 500 : Number(((v - min) * SCALE) / span));
  const x = (i: number) => Math.round((i / (values.length - 1)) * 1000);

  const points = values.map((v, i) => `${x(i)},${1000 - y(v)}`).join(' ');
  const last = values[values.length - 1]!;

  return (
    <div role="img" aria-label={label} className={cn('relative h-8 w-full', className)}>
      <svg
        aria-hidden
        viewBox="-10 -60 1020 1120"
        preserveAspectRatio="none"
        className="size-full overflow-visible text-text-muted"
      >
        <polyline
          points={points}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="spark-draw"
        />
      </svg>
      {/* The latest point: an HTML dot, so the stretched SVG cannot make it an ellipse. */}
      <span
        aria-hidden
        className={cn(
          'absolute right-0 size-2 translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-surface-raised',
          ACCENT_DOT[accent],
        )}
        style={{ bottom: `${(span === 0n ? 500 : y(last)) / 10}%` }}
      />
    </div>
  );
}
