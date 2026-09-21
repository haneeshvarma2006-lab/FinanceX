import type { Metadata } from 'next';
import { Target } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/money';
import * as repo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { AddGoalForm, GoalCard } from './views';

export const metadata: Metadata = { title: 'Goals' };

function todayFor(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export default async function GoalsPage() {
  const user = await requireUser();
  const today = todayFor(user.timezone);

  const [goals, habits] = await Promise.all([repo.listGoals(user.id), repo.listHabits(user.id)]);

  const active = goals.filter((g) => g.status === 'active');
  const closed = goals.filter((g) => g.status !== 'active');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals"
        description="Measurable targets, with the history of how you got there."
      />

      <Card>
        <CardHeader title="Active" description={`${active.length} in progress`} />
        <CardBody className={active.length === 0 ? 'p-0' : 'flex flex-col gap-5'}>
          {active.length === 0 ? (
            <EmptyState
              icon={<Target aria-hidden className="size-5" />}
              title="No goals yet"
              description="A goal is a target with a number and a date. Without both, it is a wish — start with one you could check off this quarter."
            />
          ) : (
            active.map((goal) => (
              <GoalCard
                key={goal.id}
                progress={JSON.parse(JSON.stringify(productivity.describeProgress(goal, today)))}
              />
            ))
          )}
        </CardBody>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader title="Completed" description={`${closed.length} finished`} />
          <CardBody className="p-0">
            <ul className="divide-y divide-border-subtle">
              {closed.map((goal) => (
                <li
                  key={goal.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <span className="text-text-secondary">{goal.title}</span>
                  <span className="numeric text-xs text-positive">
                    {goal.achievedAt
                      ? `achieved ${goal.achievedAt.toISOString().slice(0, 10)}`
                      : goal.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Set a goal" />
        <CardBody>
          <AddGoalForm habits={habits.map((h) => ({ id: h.id, name: h.name }))} />
        </CardBody>
      </Card>
    </div>
  );
}
