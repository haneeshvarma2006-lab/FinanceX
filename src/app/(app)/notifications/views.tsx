'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { markAllReadAction, markReadAction, type FormState } from './actions';

export function MarkReadButton({ id }: { id: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(markReadAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        Mark read
      </Button>
    </form>
  );
}

export function MarkAllReadButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async () => markAllReadAction(),
    {},
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Mark all read
      </Button>
      {state.message && (
        <span role="status" className="text-xs text-text-muted">
          {state.message}
        </span>
      )}
    </form>
  );
}
