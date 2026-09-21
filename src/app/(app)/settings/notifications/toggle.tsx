'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/form';
import { setNotificationPreferenceAction, type FormState } from '../../notifications/actions';

export function NotificationToggle({
  kind,
  label,
  description,
  enabled,
}: {
  kind: string;
  label: string;
  description: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setNotificationPreferenceAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />

      <CheckboxField name="enabled" label={label} hint={description} defaultChecked={enabled} />

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
    </form>
  );
}
