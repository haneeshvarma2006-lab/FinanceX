'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { Keyboard, PenTool, Pencil, Pin, PinOff, ScanText, Trash2 } from 'lucide-react';
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
  readHandwritingAction,
  updateNoteAction,
  type FormState,
} from './actions';
import { InkPad, renderForReading } from './ink-pad';

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
 * Write an entry by typing or by hand. The two are separate forms so that
 * switching never loses what was written in the other.
 */
export function NoteComposer({ canRecognize }: { canRecognize: boolean }) {
  const [mode, setMode] = useState<'type' | 'hand'>('type');
  const tab = (active: boolean) =>
    cn(
      'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm transition-colors duration-[var(--duration-fast)]',
      active
        ? 'bg-text-primary font-medium text-surface-sunken'
        : 'text-text-secondary hover:text-text-primary',
    );

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="How to write"
        className="ui-card inline-flex gap-1 self-start rounded-full p-1"
      >
        <button
          type="button"
          aria-pressed={mode === 'type'}
          onClick={() => setMode('type')}
          className={tab(mode === 'type')}
        >
          <Keyboard aria-hidden className="size-4" />
          Type
        </button>
        <button
          type="button"
          aria-pressed={mode === 'hand'}
          onClick={() => setMode('hand')}
          className={tab(mode === 'hand')}
        >
          <PenTool aria-hidden className="size-4" />
          Handwrite
        </button>
      </div>
      <div hidden={mode !== 'type'}>
        <TypedComposer />
      </div>
      <div hidden={mode !== 'hand'}>
        <HandwrittenComposer canRecognize={canRecognize} />
      </div>
    </div>
  );
}

function HandwrittenComposer({ canRecognize }: { canRecognize: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createNoteAction, {});
  const [ink, setInk] = useState<Ink | null>(null);
  const [page, setPage] = useState(0);
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [mood, setMood] = useState('');
  const [read, setRead] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [reading, startReading] = useTransition();

  // A saved page makes way for a fresh one.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.tone === 'success') {
      setPage((n) => n + 1);
      setInk(null);
      setTitle('');
      setTranscript('');
      setMood('');
      setRead(null);
    }
  }

  function readPage() {
    if (!ink) return;
    setRead(null);
    startReading(async () => {
      const result = await readHandwritingAction(renderForReading(ink));
      if (result.ok) {
        setTranscript(result.text);
        setRead({
          tone: 'success',
          text: result.text
            ? 'Read. Check the words below and fix anything it got wrong.'
            : 'No writing could be read on this page.',
        });
      } else {
        setRead({ tone: 'error', text: result.message });
      }
    });
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}
      <input type="hidden" name="ink" value={ink ? JSON.stringify(ink) : ''} />

      <Field
        label="Page title"
        name="title"
        placeholder="Optional"
        maxLength={160}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={state.fieldErrors?.title}
      />

      <InkPad key={page} onChange={setInk} />

      <div className="flex flex-col gap-2">
        {canRecognize ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={readPage}
              loading={reading}
              disabled={!ink}
              icon={<ScanText aria-hidden className="size-4" />}
              className="self-start"
            >
              Read my handwriting
            </Button>
            <p className="text-xs text-pretty text-text-muted">
              Sends an image of this page to Anthropic&apos;s Claude to read it into text, so the
              page becomes searchable. Nothing is sent until you tap.
            </p>
          </>
        ) : (
          <p className="text-xs text-pretty text-text-muted">
            Handwriting recognition is not switched on yet, so pages are saved as you write them. On
            an iPad with Apple Pencil you can also write straight into the Type box — iPadOS turns
            it into text as you go.
          </p>
        )}
        {read && <FormAlert tone={read.tone}>{read.text}</FormAlert>}
      </div>

      {(canRecognize || transcript) && (
        <TextareaField
          label="What it says"
          name="body"
          rows={4}
          maxLength={NOTE_BODY_MAX}
          placeholder={canRecognize ? 'Tap “Read my handwriting”, or type it here' : 'Optional'}
          hint="Optional. These words are what search finds."
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          error={state.fieldErrors?.body}
        />
      )}

      <MoodPicker value={mood} onChange={setMood} />

      <Button type="submit" loading={pending} disabled={!ink} className="self-start">
        Save page
      </Button>
    </form>
  );
}

function TypedComposer() {
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

      {note.hasInk && <InkPage id={note.id} label={note.title ?? 'Handwritten page'} />}
      {note.hasInk && (
        <p className="mt-3 text-xs font-medium text-text-muted">
          {note.body ? 'What it says' : 'Not read into text yet — edit to add the words.'}
        </p>
      )}
      <p
        className={cn(
          'mt-2 text-sm leading-7 break-words whitespace-pre-wrap text-text-secondary sm:text-base sm:leading-7',
          note.hasInk && 'mt-1',
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
        label={note.hasInk ? 'What it says' : 'Entry'}
        name="body"
        rows={8}
        required={!note.hasInk}
        hint={
          note.hasInk
            ? 'The words on your handwritten page. Optional; search finds these.'
            : undefined
        }
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
