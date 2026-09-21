'use client';

import { useActionState, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField, TextareaField } from '@/components/ui/form';
import { Badge, Progress } from '@/components/ui/money';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { GOAL_KINDS } from '@/modules/productivity/validators';
import {
  createGoalAction,
  deleteGoalAction,
  recordCheckpointAction,
  type FormState,
} from './actions';

/**
 * Serialised form of GoalProgress. Server Components cannot hand a Date across
 * the boundary, so the page JSON-round-trips it and this is the shape that
 * arrives.
 */
type SerialisedProgress = {
  goal: {
    id: string;
    title: string;
    description: string | null;
    kind: string;
    status: string;
    unit: string | null;
    targetDate: string | null;
  };
  percent: number;
  currentLabel: string;
  targetLabel: string;
  daysRemaining: number | null;
  offTrack: boolean;
};

const KIND_LABELS: Record<string, string> = {
  numeric: 'Count toward a number',
  financial: 'Reach a money target',
  habit: 'Sustain a habit',
  milestone: 'Done or not done',
};

export function AddGoalForm({ habits }: { habits: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createGoalAction, {});
  const [kind, setKind] = useState('numeric');

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}

      <Field
        label="What are you aiming for?"
        name="title"
        required
        maxLength={200}
        error={state.fieldErrors?.title}
      />

      <SelectField
        label="Kind"
        name="kind"
        value={kind}
        onChange={(event) => setKind(event.target.value)}
      >
        {GOAL_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={kind === 'milestone' ? 'Target (1 = done)' : 'Target'}
          name="targetValue"
          required
          inputMode="decimal"
          defaultValue={kind === 'milestone' ? '1' : ''}
          error={state.fieldErrors?.targetValue}
        />

        {kind === 'financial' ? (
          <SelectField label="Currency" name="currency" error={state.fieldErrors?.currency}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        ) : (
          <Field label="Unit" name="unit" maxLength={24} placeholder="books, km, sessions" />
        )}
      </div>

      {kind === 'habit' && (
        <SelectField label="Which habit" name="habitId" error={state.fieldErrors?.habitId}>
          <option value="">Choose a habit</option>
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </SelectField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Starting"
          name="startsOn"
          type="date"
          hint="Used to tell whether you are on pace."
          error={state.fieldErrors?.startsOn}
        />
        <Field label="By" name="targetDate" type="date" error={state.fieldErrors?.targetDate} />
      </div>

      <TextareaField label="Why" name="description" rows={2} maxLength={4000} />

      <Button type="submit" loading={pending}>
        Set goal
      </Button>
    </form>
  );
}

function CheckpointForm({ goalId, unit }: { goalId: string; unit: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordCheckpointAction, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="goalId" value={goalId} />

      <div className="w-32">
        <Field
          label="Now at"
          name="value"
          required
          inputMode="decimal"
          hint={unit ?? undefined}
          error={state.fieldErrors?.value}
        />
      </div>

      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Record
      </Button>

      {state.message && (
        <span
          role="status"
          className={state.tone === 'error' ? 'text-xs text-negative' : 'text-xs text-positive'}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

function DeleteGoalButton({ id }: { id: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(deleteGoalAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" loading={pending} aria-label="Delete goal">
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
    </form>
  );
}

export function GoalCard({ progress }: { progress: SerialisedProgress }) {
  const { goal } = progress;

  return (
    <article className="rounded-[var(--radius-control)] border border-border-subtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
            {goal.title}
            {progress.offTrack && <Badge tone="warning">Behind pace</Badge>}
          </h3>
          <p className="numeric mt-1 text-xs text-text-muted">
            {progress.currentLabel} of {progress.targetLabel}
            {goal.unit ? ` ${goal.unit}` : ''}
            {progress.daysRemaining !== null
              ? progress.daysRemaining >= 0
                ? ` · ${progress.daysRemaining} day${progress.daysRemaining === 1 ? '' : 's'} left`
                : ` · ${Math.abs(progress.daysRemaining)} days overdue`
              : ''}
          </p>
        </div>
        <DeleteGoalButton id={goal.id} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Progress
          value={progress.percent}
          label={`${goal.title} progress`}
          tone={progress.offTrack ? 'warning' : 'accent'}
        />
        <span className="numeric shrink-0 text-xs text-text-secondary">{progress.percent}%</span>
      </div>

      {goal.description && (
        <p className="mt-3 text-xs text-pretty text-text-secondary">{goal.description}</p>
      )}

      <div className="mt-4">
        <CheckpointForm goalId={goal.id} unit={goal.unit} />
      </div>
    </article>
  );
}
