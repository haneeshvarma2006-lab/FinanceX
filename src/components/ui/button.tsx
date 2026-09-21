import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Button variants.
 *
 * Four, deliberately. Every additional variant is another decision at every
 * call site and another thing to keep consistent; four covers primary action,
 * secondary action, low-emphasis action, and destructive.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary: cn(
    'bg-accent text-accent-contrast font-medium shadow-(--shadow-raised)',
    // Lifting brightness rather than swapping colour keeps hover subtle at
    // this saturation; a second hue would read as a different button.
    'hover:brightness-110 active:brightness-95',
  ),
  secondary: cn(
    'bg-surface-overlay text-text-primary border border-border-subtle',
    'hover:border-border-strong hover:bg-surface-raised active:brightness-95',
  ),
  ghost: 'text-text-secondary hover:bg-surface-raised hover:text-text-primary active:brightness-95',
  danger: cn(
    'bg-negative text-white font-medium shadow-(--shadow-raised)',
    'hover:brightness-110 active:brightness-95',
  ),
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9.5 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: Props) {
  return (
    <button
      // A loading button stays disabled so a double submit cannot fire twice,
      // and aria-busy tells assistive tech why it is inert.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)]',
        'whitespace-nowrap select-none',
        'transition-[background-color,border-color,filter,opacity]',
        'duration-[var(--duration-fast)] ease-(--ease-out-soft)',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}
