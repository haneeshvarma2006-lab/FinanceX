import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { NotebookPen, PenLine, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/states';
import * as repo from '@/modules/notes/repository';
import type { Note } from '@/modules/notes/schema';
import type { NoteMood } from '@/modules/notes/validators';
import { NotesTabs } from './tabs';
import { NoteComposer, NoteEntry, type NoteView } from './views';

export const metadata: Metadata = { title: 'Notes' };

/** An edit within a minute of writing is still the first draft. */
const EDIT_GRACE_MS = 60_000;

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

/**
 * "Today", "Yesterday", then the weekday and date — with the year only once
 * it stops being this one. All in the user's own timezone, which is the day
 * they lived, not the server's.
 */
function dayLabel(key: string, today: string, yesterday: string, locale: string): string {
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  // Noon UTC keeps the calendar date stable whatever the formatter's zone.
  const date = new Date(`${key}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const search = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? '';

  const [notes, total] = await Promise.all([
    repo.listNotes(user.id, { search }),
    repo.countNotes(user.id),
  ]);

  const locale = user.locale || 'en-IN';
  const now = new Date();
  const today = dayKey(now, user.timezone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), user.timezone);
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: user.timezone,
  });
  const shortDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: user.timezone,
  });

  const toView = (note: Note, withDate: boolean): NoteView => ({
    id: note.id,
    title: note.title,
    body: note.body,
    mood: note.mood as NoteMood | null,
    pinned: note.pinned,
    when: withDate
      ? `${shortDate.format(note.createdAt)}, ${time.format(note.createdAt)}`
      : time.format(note.createdAt),
    edited: note.updatedAt.getTime() - note.createdAt.getTime() > EDIT_GRACE_MS,
  });

  const pinned = notes.filter((n) => n.pinned);
  const days = new Map<string, Note[]>();
  for (const note of notes) {
    if (note.pinned) continue;
    const key = dayKey(note.createdAt, user.timezone);
    days.set(key, [...(days.get(key) ?? []), note]);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Diary"
        title="Notes"
        description="Write what happened, what you decided and why. Come back and change it whenever you like — entries stay private to your account."
      />
      <NotesTabs />

      <Card>
        <CardHeader
          title="New entry"
          description={dayLabel(today, today, yesterday, locale)}
          icon={<PenLine className="size-4" />}
        />
        <CardBody>
          <NoteComposer />
        </CardBody>
      </Card>

      {total > 0 && (
        <Form action="/notes" role="search" className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field
              label="Search your notes"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="A word or phrase"
              maxLength={100}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            icon={<Search aria-hidden className="size-3.5" />}
          >
            Search
          </Button>
        </Form>
      )}

      {search && (
        <p className="text-sm text-text-secondary">
          {notes.length === 0
            ? `Nothing matches “${search}”.`
            : `${notes.length} ${notes.length === 1 ? 'entry matches' : 'entries match'} “${search}”.`}{' '}
          <Link
            href="/notes"
            className="font-medium text-text-primary underline-offset-4 hover:underline"
          >
            Show all
          </Link>
        </p>
      )}

      {total === 0 && (
        <Card>
          <EmptyState
            icon={<NotebookPen aria-hidden className="size-5" />}
            title="Your diary is empty"
            description="Start with one line about today. Over weeks, these become the record of why you did what you did."
          />
        </Card>
      )}

      {pinned.length > 0 && (
        <section aria-labelledby="notes-pinned">
          <Card>
            <CardHeader id="notes-pinned" title="Pinned" />
            <div className="divide-y divide-border-subtle">
              {pinned.map((note) => (
                <NoteEntry key={note.id} note={toView(note, true)} />
              ))}
            </div>
          </Card>
        </section>
      )}

      {[...days].map(([key, entries]) => {
        const headingId = `notes-day-${key}`;
        return (
          <section key={key} aria-labelledby={headingId}>
            <Card>
              <CardHeader
                id={headingId}
                title={dayLabel(key, today, yesterday, locale)}
                description={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
              />
              <div className="divide-y divide-border-subtle">
                {entries.map((note) => (
                  <NoteEntry key={note.id} note={toView(note, false)} />
                ))}
              </div>
            </Card>
          </section>
        );
      })}

      {notes.length === 200 && (
        <p className="text-xs text-text-muted">
          Showing your 200 most recent entries. Search to find older ones.
        </p>
      )}
    </div>
  );
}
