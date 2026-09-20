'use client';

import { useActionState } from 'react';
import { CheckboxField, FormAlert } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { updateEmailPreference, type ActionState } from '../actions';

export function PreferenceToggle({
  category,
  label,
  description,
  optional,
  subscribed,
}: {
  category: string;
  label: string;
  description: string;
  optional: boolean;
  subscribed: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateEmailPreference, {});

  if (!optional) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-text-primary">{label}</span>
          <span className="text-xs text-text-muted">Always on</span>
        </div>
        <p className="text-xs text-pretty text-text-muted">{description}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="category" value={category} />

      <CheckboxField
        name="subscribed"
        label={label}
        hint={description}
        defaultChecked={subscribed}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          Save
        </Button>
        {state.message && (
          <span
            role="status"
            className={state.tone === 'error' ? 'text-xs text-negative' : 'text-xs text-positive'}
          >
            {state.message}
          </span>
        )}
      </div>

      {state.tone === 'error' && state.message && <FormAlert>{state.message}</FormAlert>}
    </form>
  );
}
