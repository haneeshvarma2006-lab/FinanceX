'use client';

import { useActionState } from 'react';
import { Check, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adoptRuleAction, type FormState } from './actions';

/** The review's one tap: turn the suggestion into a rule that watches for it. */
export function AdoptRule({ template, label }: { template: string; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(adoptRuleAction, {});

  if (state.tone === 'success') {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-sm font-medium text-positive">
        <Check aria-hidden className="size-4" />
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="template" value={template} />
      <Button type="submit" loading={pending} icon={<Workflow aria-hidden className="size-4" />}>
        {label}
      </Button>
      {state.tone === 'error' && (
        <p role="alert" className="text-xs text-negative">
          {state.message}
        </p>
      )}
    </form>
  );
}
