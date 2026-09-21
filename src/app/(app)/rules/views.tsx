'use client';

import { useActionState, useState } from 'react';
import { useClearingField } from '@/components/ui/use-clearing-field';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField, TextareaField } from '@/components/ui/form';
import { Badge } from '@/components/ui/money';
import {
  createRuleAction,
  deleteRuleAction,
  previewRuleAction,
  pruneRunsAction,
  toggleRuleAction,
  type FormState,
} from './actions';

type TriggerOption = { value: string; label: string; needs: 'count' | 'amount' | null };
type ActionOption = { value: string; label: string };

export function AddRuleForm({
  triggers,
  actions,
}: {
  triggers: TriggerOption[];
  actions: ActionOption[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRuleAction, {});
  const nameField = useClearingField(state);

  const [triggerType, setTriggerType] = useState(triggers[0]?.value ?? '');
  const [actionType, setActionType] = useState(actions[0]?.value ?? '');

  const needs = triggers.find((t) => t.value === triggerType)?.needs ?? null;

  return (
    <form
      action={action}
      onSubmit={nameField.markSubmitted}
      className="flex flex-col gap-4"
      noValidate
    >
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}

      <Field
        label="Name this rule"
        name="name"
        required
        maxLength={120}
        value={nameField.value}
        onChange={nameField.onChange}
        error={state.fieldErrors?.name}
      />

      <fieldset className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border-subtle p-4">
        <legend className="px-1 text-xs tracking-wide text-text-muted uppercase">When</legend>

        <SelectField
          label="Condition"
          name="triggerType"
          value={triggerType}
          onChange={(event) => setTriggerType(event.target.value)}
          error={state.fieldErrors?.triggerType}
        >
          {triggers.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectField>

        {needs === 'count' && (
          <Field
            label="Threshold"
            name="count"
            type="number"
            min="1"
            max="100"
            defaultValue="1"
            hint="How many before the rule acts."
            error={state.fieldErrors?.triggerConfig}
          />
        )}

        {needs === 'amount' && (
          <Field
            label="Amount"
            name="amount"
            inputMode="decimal"
            placeholder="10000.00"
            hint="Compared exactly, to the paisa."
            error={state.fieldErrors?.triggerConfig}
          />
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border-subtle p-4">
        <legend className="px-1 text-xs tracking-wide text-text-muted uppercase">Then</legend>

        <SelectField
          label="Action"
          name="actionType"
          value={actionType}
          onChange={(event) => setActionType(event.target.value)}
          error={state.fieldErrors?.actionType}
        >
          {actions.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </SelectField>

        <Field
          label={actionType === 'create_task' ? 'Task title' : 'Alert title'}
          name="title"
          required
          maxLength={240}
          error={state.fieldErrors?.actionConfig}
        />

        {actionType === 'notify' ? (
          <TextareaField label="Detail" name="body" rows={2} maxLength={300} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Priority" name="priority" defaultValue="2">
              <option value="1">Urgent</option>
              <option value="2">High</option>
              <option value="3">Normal</option>
              <option value="4">Low</option>
            </SelectField>
            <SelectField label="Schedule for" name="schedule" defaultValue="today">
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
            </SelectField>
          </div>
        )}
      </fieldset>

      <Button type="submit" loading={pending} className="self-start">
        Create rule
      </Button>
    </form>
  );
}

export function RuleRow({
  rule,
}: {
  rule: {
    id: string;
    name: string;
    enabled: boolean;
    condition: string;
    action: string;
    lastFiredAt: string | null;
  };
}) {
  const [toggleState, toggle, toggling] = useActionState<FormState, FormData>(toggleRuleAction, {});
  const [previewState, preview, previewing] = useActionState<FormState, FormData>(
    previewRuleAction,
    {},
  );
  const [, remove, removing] = useActionState<FormState, FormData>(deleteRuleAction, {});

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
          {rule.name}
          {!rule.enabled && <Badge>paused</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-pretty text-text-secondary">
          When {rule.condition} → {rule.action.toLowerCase()}
        </p>
        {rule.lastFiredAt && (
          <p className="numeric mt-0.5 text-xs text-text-muted">
            last fired {rule.lastFiredAt} UTC
          </p>
        )}

        {previewState.message && (
          <p
            role="status"
            className={`mt-2 text-xs ${previewState.tone === 'success' ? 'text-positive' : 'text-text-muted'}`}
          >
            {previewState.message}
          </p>
        )}
        {toggleState.tone === 'error' && toggleState.message && (
          <p role="alert" className="mt-2 text-xs text-negative">
            {toggleState.message}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <form action={preview}>
          <input type="hidden" name="id" value={rule.id} />
          <Button type="submit" variant="ghost" size="sm" loading={previewing}>
            Test
          </Button>
        </form>

        <form action={toggle}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="enabled" value={String(rule.enabled)} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={toggling}
            aria-label={rule.enabled ? `Pause ${rule.name}` : `Resume ${rule.name}`}
          >
            {rule.enabled ? 'Pause' : 'Resume'}
          </Button>
        </form>

        <form action={remove}>
          <input type="hidden" name="id" value={rule.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            loading={removing}
            aria-label={`Delete ${rule.name}`}
          >
            <Trash2 aria-hidden className="size-3.5" />
          </Button>
        </form>
      </div>
    </li>
  );
}

export function PruneButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async () => pruneRunsAction(),
    {},
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        Clear old activity
      </Button>
      {state.message && (
        <span role="status" className="text-xs text-text-muted">
          {state.message}
        </span>
      )}
    </form>
  );
}
