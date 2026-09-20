import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
};

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90 disabled:opacity-50 font-medium',
  secondary:
    'bg-surface-overlay text-text-primary border border-border-subtle hover:border-border-strong',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-surface-raised',
};

export function Button({ variant = 'primary', fullWidth, className, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)]',
        'px-4 py-2.5 text-sm transition-colors duration-[var(--duration-fast)]',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
}
