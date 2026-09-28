'use client';

import { useId, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isCommonPassword, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { controlClass } from './form';

/**
 * A password field that helps rather than scolds.
 *
 * Only two things are required — the length, and not being a well-known
 * password — and the server enforces exactly those. Capitals, numbers and
 * symbols are shown as ways to make a password stronger, ticking as you type,
 * so nobody is made to satisfy a checklist to get in. A strength bar sums it
 * up, and the eye button shows what you typed, which prevents more mistakes
 * than a second "confirm" box ever did.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
  error,
  required,
}: {
  label: string;
  name: string;
  autoComplete: 'new-password' | 'current-password';
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);

  const checks = [
    {
      label: `${PASSWORD_MIN_LENGTH} or more characters`,
      met: value.length >= PASSWORD_MIN_LENGTH,
      required: true,
    },
    { label: 'Upper and lower case', met: /[a-z]/.test(value) && /[A-Z]/.test(value) },
    { label: 'A number', met: /\d/.test(value) },
    { label: 'A symbol', met: /[^A-Za-z0-9]/.test(value) },
  ];
  const common = value.length > 0 && isCommonPassword(value);
  const strength = score(value, common);
  const meter = STRENGTH[strength];

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          className={controlClass(cn('pr-11', error && 'border-negative focus:border-negative'))}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide characters' : 'Show characters'}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-text-muted transition-colors hover:text-text-primary"
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>

      <div id={`${id}-help`} className="flex flex-col gap-2 pt-1">
        {/* Four segments that fill and change colour as the password grows. */}
        <div className="flex items-center gap-3">
          <div aria-hidden className="grid flex-1 grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((segment) => (
              <span
                key={segment}
                className={cn(
                  'h-1 rounded-full transition-colors duration-[var(--duration-base)]',
                  strength >= segment ? meter.bar : 'bg-surface-inset',
                )}
              />
            ))}
          </div>
          <span
            className={cn('w-16 text-right text-2xs font-medium', meter.text)}
            aria-live="polite"
          >
            {value ? meter.label : ''}
          </span>
        </div>

        {error ? (
          <p className="text-xs text-negative">{error}</p>
        ) : common ? (
          <p className="text-xs text-warning">
            That is one of the most common passwords — add a word or two to make it yours.
          </p>
        ) : null}

        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {checks.map((check) => (
            <li
              key={check.label}
              className={cn(
                'inline-flex items-center gap-1.5 text-2xs transition-colors',
                check.met ? 'text-text-primary' : 'text-text-muted',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                  check.met
                    ? 'border-positive bg-positive text-surface-sunken'
                    : 'border-border-strong',
                )}
              >
                {check.met && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              {check.label}
              {!check.required && <span className="sr-only">(optional, makes it stronger)</span>}
            </li>
          ))}
        </ul>
        <p className="text-2xs text-pretty text-text-muted">
          Only the length is required. Tip: three random words — like “river lamp cactus” — make a
          password that is strong and easy to remember.
        </p>
      </div>
    </div>
  );
}

/** 0 too short or common · 1 weak · 2 fair · 3 good · 4 strong. */
function score(value: string, common: boolean): 0 | 1 | 2 | 3 | 4 {
  if (value.length < PASSWORD_MIN_LENGTH || common) return 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  let points = 1;
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;
  if (variety >= 3) points += 1;
  if (variety === 4) points += 1;
  return Math.min(points, 4) as 1 | 2 | 3 | 4;
}

const STRENGTH = {
  0: { label: 'Too short', bar: 'bg-negative', text: 'text-negative' },
  1: { label: 'Weak', bar: 'bg-warning', text: 'text-warning' },
  2: { label: 'Fair', bar: 'bg-warning', text: 'text-warning' },
  3: { label: 'Good', bar: 'bg-positive', text: 'text-positive' },
  4: { label: 'Strong', bar: 'bg-positive', text: 'text-positive' },
} as const;
