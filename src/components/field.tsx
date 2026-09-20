import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Field({ label, hint, error, className, id, ...props }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm text-text-secondary">
        {label}
      </label>

      <input
        id={inputId}
        // Screen readers announce the error and the hint with the field itself,
        // rather than leaving them as text floating nearby.
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          'rounded-[var(--radius-control)] border bg-surface-inset px-3 py-2.5',
          'text-sm text-text-primary placeholder:text-text-muted',
          'transition-colors duration-[var(--duration-fast)]',
          error ? 'border-negative' : 'border-border-subtle hover:border-border-strong',
          className,
        )}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
