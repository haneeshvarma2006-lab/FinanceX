import type { Metadata } from 'next';
import Link from 'next/link';
import { NotebookPen, Repeat } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/money';
import * as productivity from '@/modules/productivity/service';
import * as notesRepo from '@/modules/notes/repository';
import type { NoteMood } from '@/modules/notes/validators';
import { NoteComposer, NoteEntry } from '../notes/views';
import { AddHabitForm, HabitRow } from './views';

export const metadata: Metadata = { title: 'Lifestyle' };

/** The user's calendar day, which is what a streak is measured in. */
function todayFor(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at);
}

export default async function HabitsPage() {
  const user = await requireUser();
  const today = todayFor(user.timezone);

  const [habits, recentNotes] = await Promise.all([
    productivity.habitsWithStreaks(user.id, today),
    notesRepo.listNotes(user.id, { limit: 20 }),
  ]);

  // Today's diary: the entries written on the user's calendar day.
  const time = new Intl.DateTimeFormat(user.locale || 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: user.timezone,
  });
  const todaysNotes = recentNotes.filter(
    (n) => !n.pinned && todayFor(user.timezone, n.createdAt) === today,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Daily life"
        accent="habits"
        title="Lifestyle"
        description={`The habits that make up your days. Streaks are counted in your own timezone (${user.timezone}).`}
      />

      <Card accent="habits">
        <CardHeader title="Today" description="Tap to log. Logging twice does not count twice." />
        <CardBody className="p-0">
          {habits.length === 0 ? (
            <EmptyState
              icon={<Repeat aria-hidden className="size-5" />}
              title="No habits yet"
              description="Start with one you can do on your worst day. A streak of one small thing beats an abandoned list of five."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {habits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={{
                    id: habit.id,
                    name: habit.name,
                    description: habit.description,
                    cadence: habit.cadence,
                  }}
                  streak={habit.streak}
                  today={today}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card accent="habits">
        <CardHeader
          title="Today's diary"
          description="A few lines about the day. Everything you write lives in Notes."
          icon={<NotebookPen className="size-4" />}
          accent="habits"
          action={
            <Link
              href="/notes"
              className="text-xs font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              All notes
            </Link>
          }
        />
        {todaysNotes.length > 0 && (
          <div className="divide-y divide-border-subtle border-b border-border-subtle">
            {todaysNotes.map((note) => (
              <NoteEntry
                key={note.id}
                note={{
                  id: note.id,
                  title: note.title,
                  body: note.body,
                  mood: note.mood as NoteMood | null,
                  pinned: note.pinned,
                  when: time.format(note.createdAt),
                  edited: note.updatedAt.getTime() - note.createdAt.getTime() > 60_000,
                }}
              />
            ))}
          </div>
        )}
        <CardBody>
          <NoteComposer />
        </CardBody>
      </Card>

      <Card accent="habits">
        <CardHeader title="Add a habit" />
        <CardBody>
          <AddHabitForm />
        </CardBody>
      </Card>
    </div>
  );
}
