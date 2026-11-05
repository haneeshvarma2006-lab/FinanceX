'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/result';
import { removeDeviceAction } from './push-actions';

export function RemoveDevice({ id, label }: { id: string; label: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(removeDeviceAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={pending}
        aria-label={`Stop notifications on ${label}`}
      >
        Remove
      </Button>
    </form>
  );
}
