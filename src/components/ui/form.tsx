'use client';

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * One control style, shared by every input, select and textarea.
 *
 * Heights match the Button scale (h-9.5 at md) so a field and the button
 * beside it align without per-page correction.
 */
const CONTROL = [
  'w-full rounded-[var(--radius-control)] border bg-surface-inset',
  'px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
  'transition-[border-color,background-color] duration-[var(--duration-fast)]',
  'ease-(--ease-out-soft)',
  'disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');

/**
 * The same control surface for anything that is not a labelled Field — the
 * filter bars, mainly. Exported so a one-off `<select>` cannot quietly drift
 * into its own padding and its own focus behaviour.
 */
export function controlClass(className?: string) {
  // An explicit height, unlike the multi-line controls: a filter bar puts an
  // input and two selects side by side, and their intrinsic heights differ by
  // a couple of pixels, which is exactly the kind of ragged baseline that
  // reads as unfinished.
  return cn(CONTROL, borderFor(), 'h-9.5 py-0', className);
}

function borderFor(error?: string) {
  return error
    ? 'border-negative focus:border-negative'
    : 'border-border-subtle hover:border-border-strong';
}

type Shared = { label: string; hint?: string; error?: string };

/**
 * Hint and error text are wired to the control through aria-describedby and
 * aria-invalid, so a screen reader announces them with the field rather than
 * leaving them as unassociated text nearby.
 */
function useFieldIds(id: string | undefined, hint?: string, error?: string) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  return {
    controlId,
    hintId,
    errorId,
    describedBy: cn(hint && !error && hintId, error && errorId) || undefined,
  };
}

function Messages({
  hint,
  error,
  hintId,
  errorId,
}: {
  hint?: string;
  error?: string;
  hintId: string;
  errorId: string;
}) {
  return (
    <>
      {hint && !error && (
        <p id={hintId} className="text-xs text-pretty text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-negative">
          {error}
        </p>
      )}
    </>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  id,
  trailing,
  ...props
}: InputHTMLAttributes<HTMLInputElement> &
  Shared & {
    /**
     * A control that belongs beside the input — a submit button on a
     * single-field form, typically. It sits in the input's own row, so the two
     * align without the caller guessing at the height of the label above.
     */
    trailing?: ReactNode;
  }) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);

  const input = (
    <input
      id={controlId}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className={cn(CONTROL, borderFor(error), 'h-9.5', className)}
      {...props}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      {trailing ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{input}</div>
          {trailing}
        </div>
      ) : (
        input
      )}
      <Messages hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & Shared) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <select
        id={controlId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, borderFor(error), 'h-9.5 pr-8', className)}
        {...props}
      >
        {children}
      </select>
      <Messages hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & Shared) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <textarea
        id={controlId}
        rows={4}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, borderFor(error), 'resize-y', className)}
        {...props}
      />
      <Messages hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

export function CheckboxField({
  label,
  hint,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;

  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        id={controlId}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          'mt-0.5 size-4 shrink-0 rounded border-border-strong bg-surface-inset',
          'accent-[var(--accent)]',
          className,
        )}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={controlId} className="text-sm text-text-primary">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="mt-0.5 text-xs text-pretty text-text-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Form-level message. role="alert" so a failed submit is announced. */
export function FormAlert({
  children,
  tone = 'error',
}: {
  children: React.ReactNode;
  tone?: 'error' | 'success';
}) {
  return (
    <p
      role="alert"
      className={cn(
        'rounded-[var(--radius-control)] border border-l-2 px-3 py-2 text-xs',
        tone === 'error'
          ? 'border-negative/30 border-l-negative bg-negative-soft text-negative'
          : 'border-positive/30 border-l-positive bg-positive-soft text-positive',
      )}
    >
      {children}
    </p>
  );
}
