import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

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
  primary: 'bg-accent text-accent-contrast font-medium hover:opacity-90',
  secondary:
    'bg-surface-overlay text-text-primary border border-border-subtle hover:border-border-strong',
  ghost: 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
  danger: 'bg-negative text-white font-medium hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-sm gap-2',
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
        'inline-flex items-center justify-center rounded-[var(--radius-control)]',
        'transition-colors duration-[var(--duration-fast)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
