'use client';

import { useActionState, useEffect, useState } from 'react';
import { RotateCcw, Scale, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField, TextareaField } from '@/components/ui/form';
import { Badge } from '@/components/ui/money';
import { useClearingField } from '@/components/ui/use-clearing-field';
import { cn } from '@/lib/cn';
import {
  DECISION_AREA_LABELS,
  DECISION_AREAS,
  VERDICT_LABELS,
  VERDICTS,
  type DecisionArea,
  type Verdict,
} from '@/modules/decisions/validators';
import {
  createDecisionAction,
  deleteDecisionAction,
  reopenDecisionAction,
  reviewDecisionAction,
  type FormState,
} from './actions';

const CONFIDENCE = {
  1: '1 — a guess',
  2: '2 — leaning',
  3: '3 — fairly sure',
  4: '4 — confident',
  5: '5 — certain',
} as const;

const VERDICT_TONE = { right: 'positive', mixed: 'warning', wrong: 'negative' } as const;

const VERDICT_SELECTED: Record<Verdict, string> = {
  right: 'border-positive/50 bg-positive-soft text-positive',
  mixed: 'border-warning/50 bg-warning-soft text-warning',
  wrong: 'border-negative/50 bg-negative-soft text-negative',
};

export function DecisionForm({ suggestedReview }: { suggestedReview: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createDecisionAction, {});
  const title = useClearingField(state);
  const reasoning = useClearingField(state);
  const expected = useClearingField(state);

  return (
    <form
      action={action}
      onSubmit={() => {
        title.markSubmitted();
        reasoning.markSubmitted();
        expected.markSubmitted();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}

      <Field
        label="What did you decide?"
        name="title"
        required
        maxLength={200}
        placeholder="e.g. Move ₹20,000 a month into an index fund"
        value={title.value}
        onChange={title.onChange}
        error={state.fieldErrors?.title}
      />

      <TextareaField
        label="Why"
        name="reasoning"
        rows={3}
        maxLength={4000}
        hint="Your reasons today. Later you will judge the decision against these, not against memory."
        value={reasoning.value}
        onChange={reasoning.onChange}
        error={state.fieldErrors?.reasoning}
      />

      <TextareaField
        label="What do you expect to happen?"
        name="expected"
        rows={2}
        maxLength={2000}
        value={expected.value}
        onChange={expected.onChange}
        error={state.fieldErrors?.expected}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Area" name="area" defaultValue="life">
          {DECISION_AREAS.map((area) => (
            <option key={area} value={area}>
              {DECISION_AREA_LABELS[area]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="How sure are you?"
          name="confidence"
          defaultValue=""
          error={state.fieldErrors?.confidence}
        >
          <option value="">Not saying</option>
          {Object.entries(CONFIDENCE).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <Field
          label="Review on"
          name="reviewOn"
          type="date"
          defaultValue={suggestedReview}
          hint="When the result should be clear."
          error={state.fieldErrors?.reviewOn}
        />
      </div>

      <Button type="submit" loading={pending} className="self-start">
        Log decision
      </Button>
    </form>
  );
}

export type DecisionView = {
  id: string;
  title: string;
  area: DecisionArea;
  reasoning: string | null;
  expected: string | null;
  confidence: number | null;
  /** Formatted on the server, in the user's timezone. */
  madeOn: string;
  reviewOnLabel: string | null;
  due: boolean;
  verdict: Verdict | null;
  outcome: string | null;
};

export function DecisionItem({ decision }: { decision: DecisionView }) {
  const [reviewing, setReviewing] = useState(false);

  return (
    <article className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="numeric">{decision.madeOn}</span>
            <Badge>{DECISION_AREA_LABELS[decision.area]}</Badge>
            {decision.confidence && <span>sure {decision.confidence}/5</span>}
            {decision.verdict ? (
              <Badge tone={VERDICT_TONE[decision.verdict]}>
                {VERDICT_LABELS[decision.verdict]}
              </Badge>
            ) : decision.due ? (
              <Badge tone="warning">Ready to review</Badge>
            ) : decision.reviewOnLabel ? (
              <span>review {decision.reviewOnLabel}</span>
            ) : null}
          </p>
          <h3 className="mt-1.5 text-base font-semibold tracking-tight text-pretty text-text-primary">
            {decision.title}
          </h3>
        </div>
        <DecisionActions decision={decision} onReview={() => setReviewing(true)} />
      </div>

      {(decision.reasoning || decision.expected) && (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {decision.reasoning && (
            <div>
              <dt className="text-xs font-medium text-text-muted">Why</dt>
              <dd className="mt-0.5 break-words whitespace-pre-wrap text-text-secondary">
                {decision.reasoning}
              </dd>
            </div>
          )}
          {decision.expected && (
            <div>
              <dt className="text-xs font-medium text-text-muted">Expected</dt>
              <dd className="mt-0.5 break-words whitespace-pre-wrap text-text-secondary">
                {decision.expected}
              </dd>
            </div>
          )}
        </dl>
      )}

      {decision.verdict && decision.outcome && (
        <div className="mt-3 rounded-xl border border-border-subtle bg-surface-inset/50 px-3.5 py-2.5 text-sm">
          <p className="text-xs font-medium text-text-muted">What happened</p>
          <p className="mt-0.5 break-words whitespace-pre-wrap text-text-secondary">
            {decision.outcome}
          </p>
        </div>
      )}

      {reviewing && <ReviewForm decision={decision} onDone={() => setReviewing(false)} />}
    </article>
  );
}

function DecisionActions({ decision, onReview }: { decision: DecisionView; onReview: () => void }) {
  const [reopenState, reopenAction, reopening] = useActionState<FormState, FormData>(
    reopenDecisionAction,
    {},
  );
  const [deleteState, deleteAction, deleting] = useActionState<FormState, FormData>(
    deleteDecisionAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const error =
    (reopenState.tone === 'error' && reopenState.message) ||
    (deleteState.tone === 'error' && deleteState.message);

  if (confirming) {
    return (
      <form action={deleteAction} className="flex shrink-0 items-center gap-1.5">
        <input type="hidden" name="id" value={decision.id} />
        <span className="text-xs text-text-secondary max-sm:sr-only">Delete for good?</span>
        <Button type="submit" variant="danger" size="sm" loading={deleting}>
          Delete
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Keep
        </Button>
      </form>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-0.5">
        {decision.verdict ? (
          <form action={reopenAction}>
            <input type="hidden" name="id" value={decision.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              loading={reopening}
              aria-label={`Reopen ${decision.title}`}
              title="Judge it again later"
              className="px-2"
            >
              {!reopening && <RotateCcw aria-hidden className="size-3.5" />}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant={decision.due ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onReview}
            aria-label={`Review ${decision.title}`}
          >
            <Scale aria-hidden className="size-3.5" />
            Review
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${decision.title}`}
          title="Delete"
          className="px-2 hover:text-negative"
        >
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

function ReviewForm({ decision, onDone }: { decision: DecisionView; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reviewDecisionAction, {});
  const [verdict, setVerdict] = useState('');

  // Close once the review lands. The parent owns the open state, so this
  // must wait for commit — updating a parent while rendering a child is an error.
  useEffect(() => {
    if (state.tone === 'success') onDone();
  }, [state, onDone]);

  return (
    <form
      action={action}
      className="mt-4 flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-inset/40 p-4"
      noValidate
    >
      <input type="hidden" name="id" value={decision.id} />
      <input type="hidden" name="verdict" value={verdict} />
      {state.tone === 'error' && state.message && (
        <FormAlert tone="error">{state.message}</FormAlert>
      )}

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-text-secondary">
          Looking back, was it the right call?
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {VERDICTS.map((v) => {
            const selected = verdict === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={selected}
                onClick={() => setVerdict(v)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)]',
                  selected
                    ? VERDICT_SELECTED[v]
                    : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary',
                )}
              >
                {VERDICT_LABELS[v]}
              </button>
            );
          })}
        </div>
        {state.fieldErrors?.verdict && (
          <p role="alert" className="mt-1.5 text-xs text-negative">
            {state.fieldErrors.verdict}
          </p>
        )}
      </fieldset>

      <TextareaField
        label="What actually happened?"
        name="outcome"
        rows={3}
        maxLength={4000}
        error={state.fieldErrors?.outcome}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          Save review
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
