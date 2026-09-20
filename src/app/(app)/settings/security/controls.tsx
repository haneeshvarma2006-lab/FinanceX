'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { revokeOtherSessions, revokeSession, unlinkProvider, type ActionState } from '../actions';

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(revokeSession, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Sign out
      </Button>
      {state.message && (
        <span role="status" className="text-xs text-text-muted">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function RevokeOthersButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async () => revokeOtherSessions(),
    {},
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Sign out everywhere else
      </Button>
      {state.message && (
        <span role="status" className="text-xs text-text-muted">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function UnlinkButton({ accountId, disabled }: { accountId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(unlinkProvider, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        disabled={disabled}
        title={disabled ? 'Set a password first — this is your only way to sign in' : undefined}
      >
        Disconnect
      </Button>
      {state.message && (
        <span
          role="status"
          className={state.tone === 'error' ? 'text-xs text-negative' : 'text-xs text-text-muted'}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
