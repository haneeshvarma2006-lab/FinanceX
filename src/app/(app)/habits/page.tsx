import type { Metadata } from 'next';
import { Repeat } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/money';
import * as productivity from '@/modules/productivity/service';
import { AddHabitForm, HabitRow } from './views';

export const metadata: Metadata = { title: 'Habits' };

/** The user's calendar day, which is what a streak is measured in. */
function todayFor(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export default async function HabitsPage() {
  const user = await requireUser();
  const today = todayFor(user.timezone);

  const habits = await productivity.habitsWithStreaks(user.id, today);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Habits"
        description={`Streaks are counted in your own timezone (${user.timezone}).`}
      />

      <Card>
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

      <Card>
        <CardHeader title="Add a habit" />
        <CardBody>
          <AddHabitForm />
        </CardBody>
      </Card>
    </div>
  );
}
