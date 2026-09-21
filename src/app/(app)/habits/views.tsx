'use client';

import { useActionState } from 'react';
import { useClearingField } from '@/components/ui/use-clearing-field';
import { Check, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField, TextareaField } from '@/components/ui/form';
import { Badge } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { createHabitAction, toggleHabitAction, type FormState } from './actions';

type Streak = {
  current: number;
  longest: number;
  completedToday: boolean;
  last30: number;
};

export function AddHabitForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createHabitAction, {});
  const titleField = useClearingField(state);

  return (
    <form
      action={action}
      onSubmit={titleField.markSubmitted}
      className="flex flex-col gap-4"
      noValidate
    >
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}

      <Field
        label="Habit"
        name="name"
        required
        maxLength={120}
        value={titleField.value}
        onChange={titleField.onChange}
        error={state.fieldErrors?.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="How often" name="cadence" defaultValue="daily">
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
        </SelectField>

        <Field
          label="Times per period"
          name="targetPerPeriod"
          type="number"
          min="1"
          max="50"
          defaultValue="1"
        />
      </div>

      <TextareaField label="Why this matters" name="description" rows={2} maxLength={500} />

      <Button type="submit" loading={pending}>
        Add habit
      </Button>
    </form>
  );
}

export function HabitRow({
  habit,
  streak,
  today,
}: {
  habit: { id: string; name: string; description: string | null; cadence: string };
  streak: Streak;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(toggleHabitAction, {});

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
          {habit.name}
          {streak.current > 0 && (
            <Badge tone={streak.current >= 7 ? 'positive' : 'neutral'}>
              <span className="inline-flex items-center gap-1">
                <Flame aria-hidden className="size-3" />
                {streak.current} day{streak.current === 1 ? '' : 's'}
              </span>
            </Badge>
          )}
        </p>

        <p className="numeric mt-1 text-xs text-text-muted">
          {streak.longest > 0 ? `best ${streak.longest} · ` : ''}
          {streak.last30} of the last 30 days
        </p>

        {habit.description && (
          <p className="mt-1 text-xs text-pretty text-text-secondary">{habit.description}</p>
        )}

        {state.tone === 'error' && state.message && (
          <p role="alert" className="mt-1 text-xs text-negative">
            {state.message}
          </p>
        )}
      </div>

      <form action={action}>
        <input type="hidden" name="habitId" value={habit.id} />
        <input type="hidden" name="onDate" value={today} />
        <input type="hidden" name="logged" value={String(streak.completedToday)} />

        <Button
          type="submit"
          variant={streak.completedToday ? 'primary' : 'secondary'}
          size="sm"
          loading={pending}
          className={cn(streak.completedToday && 'bg-positive text-surface-base')}
          aria-label={
            streak.completedToday
              ? `Remove today's entry for ${habit.name}`
              : `Log ${habit.name} for today`
          }
          aria-pressed={streak.completedToday}
        >
          <Check aria-hidden className="size-3.5" />
          {streak.completedToday ? 'Done today' : 'Log today'}
        </Button>
      </form>
    </li>
  );
}
