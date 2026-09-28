'use client';

import { useActionState, useState } from 'react';
import { useClearingField } from '@/components/ui/use-clearing-field';
import { CheckCircle2, Circle, Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckboxField, Field, FormAlert, SelectField, TextareaField } from '@/components/ui/form';
import { Badge, Progress } from '@/components/ui/money';
import { SUPPORTED_CURRENCIES } from '@nestedflow/domain/money';
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

type LinkOption = { id: string; name: string; currency: string };

const SOURCE_LABELS = {
  manual: 'I will check in myself',
  account: 'The balance of a money account',
  trading: 'Profit on a trading account',
} as const;

export function AddGoalForm({
  habits,
  accounts,
  tradingAccounts,
}: {
  habits: { id: string; name: string }[];
  accounts: LinkOption[];
  tradingAccounts: LinkOption[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createGoalAction, {});
  const titleField = useClearingField(state);
  const [kind, setKind] = useState('numeric');
  const [source, setSource] = useState<keyof typeof SOURCE_LABELS>('manual');
  const [accountId, setAccountId] = useState('');
  const [tradingAccountId, setTradingAccountId] = useState('');

  const linked =
    source === 'account'
      ? accounts.find((a) => a.id === accountId)
      : source === 'trading'
        ? tradingAccounts.find((a) => a.id === tradingAccountId)
        : undefined;

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
        label="What are you aiming for?"
        name="title"
        required
        maxLength={200}
        placeholder="Build an emergency fund · Pass the prop challenge"
        value={titleField.value}
        onChange={titleField.onChange}
        error={state.fieldErrors?.title}
      />

      <SelectField
        label="Track progress from"
        name="source"
        value={source}
        onChange={(event) => setSource(event.target.value as keyof typeof SOURCE_LABELS)}
        hint={
          source === 'manual'
            ? 'You record where you are with a check-in.'
            : 'Progress updates by itself as your records change.'
        }
      >
        {(Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[]).map((key) => (
          <option key={key} value={key}>
            {SOURCE_LABELS[key]}
          </option>
        ))}
      </SelectField>

      {source === 'account' && (
        <SelectField
          label="Account"
          name="accountId"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          error={state.fieldErrors?.accountId}
          hint={accounts.length === 0 ? 'Add an account on the Finance page first.' : undefined}
        >
          <option value="">Choose an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      )}

      {source === 'trading' && (
        <SelectField
          label="Trading account"
          name="tradingAccountId"
          value={tradingAccountId}
          onChange={(event) => setTradingAccountId(event.target.value)}
          error={state.fieldErrors?.tradingAccountId}
          hint={
            tradingAccounts.length === 0
              ? 'Add a trading account on the Trading page first.'
              : 'Counts profit on trades closed from the start date.'
          }
        >
          <option value="">Choose a trading account</option>
          {tradingAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      )}

      {source === 'manual' && (
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
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={
            source === 'trading'
              ? `Profit target${linked ? ` (${linked.currency})` : ''}`
              : source === 'account'
                ? `Target balance${linked ? ` (${linked.currency})` : ''}`
                : kind === 'milestone'
                  ? 'Target (1 = done)'
                  : 'Target'
          }
          name="targetValue"
          required
          inputMode="decimal"
          defaultValue={source === 'manual' && kind === 'milestone' ? '1' : ''}
          error={state.fieldErrors?.targetValue}
        />

        {source === 'manual' &&
          (kind === 'financial' ? (
            <SelectField label="Currency" name="currency" error={state.fieldErrors?.currency}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
          ) : (
            <Field label="Unit" name="unit" maxLength={24} placeholder="books, km, sessions" />
          ))}
      </div>

      {source === 'manual' && kind === 'habit' && (
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

      <CheckboxField
        label="Create starter tasks for this goal"
        name="starterTasks"
        defaultChecked
        hint={
          source === 'trading'
            ? 'Weekly: journal review, risk management review, weekly analysis.'
            : source === 'account'
              ? 'Monthly: move money in. Weekly: review spending.'
              : 'Weekly: plan the next step.'
        }
      />

      <Button type="submit" loading={pending} className="self-start">
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

export type GoalTasks = { open: { id: string; title: string }[]; done: number };

export function GoalCard({
  progress,
  source,
  tasks,
}: {
  progress: SerialisedProgress;
  /** "Savings (balance)" or similar when the goal follows an account. */
  source: string | null;
  tasks: GoalTasks;
}) {
  const { goal } = progress;
  const openCount = tasks.open.length;

  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-overlay/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-text-primary">
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

      <div className="mt-4 flex items-center gap-3">
        <Progress
          value={progress.percent}
          label={`${goal.title} progress`}
          tone={progress.offTrack ? 'warning' : 'positive'}
        />
        <span className="numeric shrink-0 text-sm font-semibold text-text-primary">
          {progress.percent}%
        </span>
      </div>

      {goal.description && (
        <p className="mt-3 text-xs text-pretty text-text-secondary">{goal.description}</p>
      )}

      {/* The tasks that serve this goal: how it actually gets done. */}
      <div className="mt-4 rounded-xl border border-border-subtle/70 bg-surface-inset/40 p-3">
        <p className="flex items-center justify-between text-2xs font-medium tracking-wide text-text-muted uppercase">
          <span>Tasks for this goal</span>
          <span className="numeric normal-case">
            {openCount} open · {tasks.done} done
          </span>
        </p>
        {openCount === 0 ? (
          <p className="mt-2 text-xs text-text-muted">
            {tasks.done > 0
              ? 'Everything open is done.'
              : 'None yet — on the Tasks page, pick this goal when you add one.'}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {tasks.open.slice(0, 4).map((task) => (
              <li key={task.id} className="flex items-center gap-2 text-sm text-text-primary">
                <Circle aria-hidden className="size-3.5 shrink-0 text-text-muted" />
                <span className="truncate">{task.title}</span>
              </li>
            ))}
            {openCount > 4 && (
              <li className="pl-5.5 text-xs text-text-muted">and {openCount - 4} more</li>
            )}
          </ul>
        )}
        {tasks.done > 0 && openCount === 0 && (
          <CheckCircle2 aria-hidden className="mt-2 size-4 text-positive" />
        )}
      </div>

      <div className="mt-4">
        {source ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <Link2 aria-hidden className="size-3.5" />
            Updates by itself from {source}
          </p>
        ) : (
          <CheckpointForm goalId={goal.id} unit={goal.unit} />
        )}
      </div>
    </article>
  );
}
