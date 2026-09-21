'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormState } from '@/lib/result';

/**
 * A text field that clears after a successful submit — without ever wiping
 * something the user has since typed.
 *
 * The problem this solves: React 19 automatically resets an *uncontrolled*
 * form once its action resolves. That reset lands at an arbitrary moment after
 * submit, so anything typed in the gap is silently discarded, and a submit
 * landing inside the gap posts an empty form and shows a validation error the
 * user did not cause.
 *
 * An earlier attempt reset the form from an effect. That made it worse: it
 * added a *second*, later wipe. The fix is not to reset more carefully, it is
 * to stop the automatic reset happening at all — a controlled input is never
 * auto-reset by React — and then clear deliberately.
 *
 * The clear is conditional: it only fires when the field still holds exactly
 * what was submitted. If the user has started typing the next entry during
 * the round trip, their text survives.
 */
export function useClearingField(state: FormState, initial = '') {
  const [value, setValue] = useState(initial);

  /**
   * What was in the field at the moment of the last submit, or null when no
   * submit is awaiting its result. Null also disarms the clear, so a re-render
   * that happens to carry a success state cannot wipe the field twice.
   */
  const submitted = useRef<string | null>(null);

  useEffect(() => {
    if (state.tone !== 'success') return;
    // Nothing is awaiting a result, so this success belongs to an earlier
    // submit we have already handled.
    if (submitted.current === null) return;

    const wasSubmitted = submitted.current;
    submitted.current = null;

    // Only clear text the user has not replaced since submitting.
    setValue((current) => (current === wasSubmitted ? initial : current));
  }, [state, initial]);

  return {
    value,
    onChange(event: { target: { value: string } }) {
      setValue(event.target.value);
    },
    /**
     * Call from the form's onSubmit, before the action runs. Arms the clear
     * for this submission — identity of the returned state cannot be relied on
     * to distinguish one success from the next.
     */
    markSubmitted() {
      submitted.current = value;
    },
    /** Escape hatch for callers that need to set the value directly. */
    set: setValue,
  };
}
