import { cn } from '@/lib/cn';

/**
 * The mark: three nested rounded squares with one stroke running through
 * them — the same drawing as the app icon and the opening splash, in the
 * theme's own colours.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-7 shrink-0', className)}
    >
      <rect width="64" height="64" rx="16" className="fill-surface-overlay stroke-border-strong" />
      <rect
        x="13"
        y="13"
        width="38"
        height="38"
        rx="11"
        strokeWidth="3"
        className="stroke-tasks"
        strokeOpacity={0.45}
      />
      <rect
        x="22"
        y="22"
        width="20"
        height="20"
        rx="6"
        strokeWidth="3"
        className="stroke-tasks"
        strokeOpacity={0.75}
      />
      <path d="M14 44c8 0 10-24 18-24s10 24 18 24" strokeWidth="4.5" className="stroke-tasks" />
    </svg>
  );
}
