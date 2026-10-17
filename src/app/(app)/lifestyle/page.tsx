import type { Metadata } from 'next';
import Link from 'next/link';
import { Flame, NotebookPen, PenLine, Repeat } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/money';
import { Sheet } from '@/components/ui/sheet';
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

export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requireUser();
  const { new: opening } = await searchParams;
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
        icon={<Flame />}
        title="Lifestyle"
        description="The habits that make up your days, and a few lines about each one."
      />

      <Card accent="habits">
        <CardHeader title="Today" description="Tap a habit to mark it done." />
        <CardBody className="p-0">
          {habits.length === 0 ? (
            <EmptyState
              icon={<Repeat aria-hidden className="size-5" />}
              title="No habits yet"
              description="Add one below. One small thing every day beats a list of five you drop."
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
        <CardBody className="border-t border-border-subtle/70">
          <AddHabitForm autoFocus={opening === 'habit'} />
        </CardBody>
      </Card>

      <Card accent="habits">
        <CardHeader
          title="Today's diary"
          description={
            todaysNotes.length > 0
              ? `${todaysNotes.length} entr${todaysNotes.length === 1 ? 'y' : 'ies'} today`
              : 'A few lines about the day'
          }
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
                  hasInk: note.hasInk,
                  mood: note.mood as NoteMood | null,
                  pinned: note.pinned,
                  when: time.format(note.createdAt),
                  edited: note.updatedAt.getTime() - note.createdAt.getTime() > 60_000,
                }}
              />
            ))}
          </div>
        )}
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            {todaysNotes.length > 0
              ? 'Anything else worth remembering?'
              : 'How did today go? It all lives in Notes.'}
          </p>
          <Sheet
            label="Write about today"
            variant="secondary"
            icon={<PenLine />}
            title="Today's diary"
          >
            <NoteComposer />
          </Sheet>
        </CardBody>
      </Card>
    </div>
  );
}
