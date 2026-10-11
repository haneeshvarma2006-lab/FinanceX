'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { PenTool, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
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
import { INK_LINE_GAP, INK_WIDTH, type Ink } from '@/modules/notes/ink';
import {
  createNoteAction,
  deleteNoteAction,
  loadInkAction,
  pinNoteAction,
  updateNoteAction,
  type FormState,
} from './actions';
import { InkPad } from './ink-pad';

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

/**
 * One entry, the way Apple Notes works: words, and if you like a drawing
 * under them. The words can be typed, or written with Apple Pencil straight
 * into the box — iPadOS turns the handwriting into text on the iPad itself
 * (Scribble); nothing here reads or sends it. The drawing is kept exactly as
 * drawn.
 */
export function NoteComposer() {
  const [state, action, pending] = useActionState<FormState, FormData>(createNoteAction, {});
  const title = useClearingField(state);
  const body = useClearingField(state);
  const [mood, setMood] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [ink, setInk] = useState<Ink | null>(null);
  const [page, setPage] = useState(0);

  // A saved entry makes way for a fresh one. Adjusted during render rather
  // than in an effect, so no frame shows the old mood or drawing.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.tone === 'success') {
      setMood('');
      setInk(null);
      setDrawing(false);
      setPage((n) => n + 1);
    }
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
      <input type="hidden" name="ink" value={ink ? JSON.stringify(ink) : ''} />

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
        required={!ink}
        maxLength={NOTE_BODY_MAX}
        placeholder="What happened today? What did you decide, and why?"
        hint="Type, or on iPad write here with Apple Pencil — iPadOS turns your handwriting into text."
        value={body.value}
        onChange={body.onChange}
        onKeyDown={submitOnModEnter}
        error={state.fieldErrors?.body}
        className="text-base leading-7"
      />

      {drawing ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-text-secondary">Drawing</p>
            <button
              type="button"
              onClick={() => {
                setDrawing(false);
                setInk(null);
              }}
              className="text-xs text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
            >
              Remove drawing
            </button>
          </div>
          <InkPad key={page} onChange={setInk} />
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDrawing(true)}
          icon={<PenTool aria-hidden className="size-4" />}
          className="self-start"
        >
          Add drawing
        </Button>
      )}

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
  /** A handwritten page; its drawing is loaded when it scrolls into view. */
  hasInk?: boolean;
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
          !note.body && 'hidden',
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
      {note.hasInk && <InkPage id={note.id} label={note.title ?? 'Drawing'} />}
    </article>
  );
}

/**
 * A stored handwritten page, drawn as vectors in the theme's ink. The
 * drawing is fetched when the page is about to scroll into view, so a long
 * diary does not download every page at once.
 */
function InkPage({ id, label }: { id: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<{ path: string; height: number } | null | 'missing'>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        void loadInkAction(id).then((result) => {
          if (!cancelled) setPage(result ?? 'missing');
        });
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id]);

  const height = page && page !== 'missing' ? page.height + INK_LINE_GAP : 0;

  return (
    <div
      ref={ref}
      className="mt-3 overflow-hidden rounded-xl border border-border-subtle bg-surface-inset/50"
    >
      {page === null ? (
        <div className="h-40 animate-pulse" aria-label="Loading the page" />
      ) : page === 'missing' ? (
        <p className="px-4 py-6 text-sm text-text-muted">This page could not be loaded.</p>
      ) : (
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${INK_WIDTH} ${height}`}
          className="block h-auto w-full text-text-primary"
        >
          {Array.from({ length: Math.floor(height / INK_LINE_GAP) }, (_, i) => (
            <line
              key={i}
              x1={0}
              x2={INK_WIDTH}
              y1={(i + 1) * INK_LINE_GAP}
              y2={(i + 1) * INK_LINE_GAP}
              className="stroke-border-subtle"
              strokeWidth={1.5}
            />
          ))}
          <path d={page.path} fill="currentColor" />
        </svg>
      )}
    </div>
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
        required={!note.hasInk}
        hint={note.hasInk ? 'Optional: this entry has a drawing.' : undefined}
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
