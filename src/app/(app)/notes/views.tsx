'use client';

import { useActionState, useEffect, useState } from 'react';
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, TextareaField } from '@/components/ui/form';
import { Badge } from '@/components/ui/money';
import { useClearingField } from '@/components/ui/use-clearing-field';
import { cn } from '@/lib/cn';
import {
  NOTE_BODY_MAX,
  NOTE_MOOD_LABELS,
  NOTE_MOODS,
  type NoteMood,
} from '@/modules/notes/validators';
import {
  createNoteAction,
  deleteNoteAction,
  pinNoteAction,
  updateNoteAction,
  type FormState,
} from './actions';

const MOOD_TONE = {
  great: 'positive',
  good: 'positive',
  okay: 'neutral',
  low: 'warning',
  rough: 'negative',
} as const satisfies Record<NoteMood, string>;

const MOOD_SELECTED: Record<NoteMood, string> = {
  great: 'border-positive/50 bg-positive-soft text-positive',
  good: 'border-positive/50 bg-positive-soft text-positive',
  okay: 'border-border-strong bg-surface-raised text-text-primary',
  low: 'border-warning/50 bg-warning-soft text-warning',
  rough: 'border-negative/50 bg-negative-soft text-negative',
};

/** One tap, optional, and tappable again to clear. */
function MoodPicker({ value, onChange }: { value: string; onChange: (mood: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-text-secondary">
        How was it? <span className="font-normal text-text-muted">(optional)</span>
      </legend>
      <input type="hidden" name="mood" value={value} />
      <div className="flex flex-wrap gap-1.5">
        {NOTE_MOODS.map((mood) => {
          const selected = value === mood;
          return (
            <button
              key={mood}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? '' : mood)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)]',
                selected
                  ? MOOD_SELECTED[mood]
                  : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary',
              )}
            >
              {NOTE_MOOD_LABELS[mood]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Ctrl/⌘ + Enter saves from inside the writing area, as in most editors. */
function submitOnModEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

export function NoteComposer() {
  const [state, action, pending] = useActionState<FormState, FormData>(createNoteAction, {});
  const title = useClearingField(state);
  const body = useClearingField(state);
  const [mood, setMood] = useState('');

  // The mood clears with the text once a save lands. Adjusted during render
  // rather than in an effect, so there is no frame showing the old mood.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.tone === 'success') setMood('');
  }

  return (
    <form
      action={action}
      onSubmit={() => {
        title.markSubmitted();
        body.markSubmitted();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}

      <Field
        label="Title"
        name="title"
        placeholder="Optional"
        maxLength={160}
        value={title.value}
        onChange={title.onChange}
        error={state.fieldErrors?.title}
      />

      <TextareaField
        label="Entry"
        name="body"
        rows={6}
        required
        maxLength={NOTE_BODY_MAX}
        placeholder="What happened today? What did you decide, and why?"
        value={body.value}
        onChange={body.onChange}
        onKeyDown={submitOnModEnter}
        error={state.fieldErrors?.body}
        className="text-base leading-7"
      />

      <MoodPicker value={mood} onChange={setMood} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Save entry
        </Button>
        <span className="text-xs text-text-muted max-sm:hidden">or Ctrl + Enter</span>
      </div>
    </form>
  );
}

export type NoteView = {
  id: string;
  title: string | null;
  body: string;
  mood: NoteMood | null;
  pinned: boolean;
  /** Already formatted in the user's timezone on the server. */
  when: string;
  edited: boolean;
};

/** Long entries open folded so a week of writing stays scannable. */
const FOLD_AT = 420;

export function NoteEntry({ note }: { note: NoteView }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const long = note.body.length > FOLD_AT || note.body.split('\n').length > 6;

  if (editing) return <NoteEditor note={note} onDone={() => setEditing(false)} />;

  return (
    <article className="group px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="numeric">{note.when}</span>
            {note.edited && <span>· edited</span>}
            {note.mood && <Badge tone={MOOD_TONE[note.mood]}>{NOTE_MOOD_LABELS[note.mood]}</Badge>}
            {note.pinned && (
              <span className="inline-flex items-center gap-1 text-accent">
                <Pin aria-hidden className="size-3" />
                Pinned
              </span>
            )}
          </p>
          {note.title && (
            <h3 className="mt-1.5 text-base font-semibold tracking-tight text-text-primary">
              {note.title}
            </h3>
          )}
        </div>
        <NoteActions note={note} onEdit={() => setEditing(true)} />
      </div>

      <p
        className={cn(
          'mt-2 text-sm leading-7 break-words whitespace-pre-wrap text-text-secondary sm:text-base sm:leading-7',
          long && !open && 'line-clamp-6',
        )}
      >
        {note.body}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-text-primary underline-offset-4 hover:underline"
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </article>
  );
}

function NoteActions({ note, onEdit }: { note: NoteView; onEdit: () => void }) {
  const [pinState, pinAction, pinning] = useActionState<FormState, FormData>(pinNoteAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<FormState, FormData>(
    deleteNoteAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const label = note.title ?? 'this entry';
  const error =
    (pinState.tone === 'error' && pinState.message) ||
    (deleteState.tone === 'error' && deleteState.message);

  if (confirming) {
    return (
      <form action={deleteAction} className="flex shrink-0 items-center gap-1.5">
        <input type="hidden" name="id" value={note.id} />
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
        <form action={pinAction}>
          <input type="hidden" name="id" value={note.id} />
          <input type="hidden" name="pinned" value={String(!note.pinned)} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            loading={pinning}
            aria-label={note.pinned ? `Unpin ${label}` : `Pin ${label}`}
            title={note.pinned ? 'Unpin' : 'Pin to top'}
            className="px-2"
          >
            {!pinning &&
              (note.pinned ? (
                <PinOff aria-hidden className="size-3.5" />
              ) : (
                <Pin aria-hidden className="size-3.5" />
              ))}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          title="Edit"
          className="px-2"
        >
          <Pencil aria-hidden className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${label}`}
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

function NoteEditor({ note, onDone }: { note: NoteView; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateNoteAction, {});
  const [mood, setMood] = useState<string>(note.mood ?? '');

  useEffect(() => {
    if (state.tone === 'success') onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-4 bg-surface-inset/40 px-5 py-4" noValidate>
      <input type="hidden" name="id" value={note.id} />
      {state.tone === 'error' && state.message && (
        <FormAlert tone="error">{state.message}</FormAlert>
      )}

      <Field
        label="Title"
        name="title"
        placeholder="Optional"
        maxLength={160}
        defaultValue={note.title ?? ''}
        error={state.fieldErrors?.title}
      />
      <TextareaField
        // Editing picks up where the entry ends, with the caret after the last word.
        autoFocus
        onFocus={(event) => {
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
        }}
        label="Entry"
        name="body"
        rows={8}
        required
        maxLength={NOTE_BODY_MAX}
        defaultValue={note.body}
        onKeyDown={submitOnModEnter}
        error={state.fieldErrors?.body}
        className="text-base leading-7"
      />
      <MoodPicker value={mood} onChange={setMood} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
