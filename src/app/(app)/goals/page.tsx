import type { Metadata } from 'next';
import { Target } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/money';
import * as repo from '@/modules/productivity/repository';
import * as financeRepo from '@/modules/finance/repository';
import * as tradingRepo from '@/modules/trading/repository';
import * as productivity from '@/modules/productivity/service';
import { AddGoalForm, GoalCard, type GoalTasks } from './views';

export const metadata: Metadata = { title: 'Goals' };

function todayFor(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export default async function GoalsPage() {
  const user = await requireUser();
  const today = todayFor(user.timezone);

  // Goals that follow an account are brought up to date before they render.
  await productivity.syncLinkedGoals(user.id);

  const [goals, habits, accounts, tradingAccounts] = await Promise.all([
    repo.listGoals(user.id),
    repo.listHabits(user.id),
    financeRepo.listAccounts(user.id),
    tradingRepo.listTradingAccounts(user.id),
  ]);

  const active = goals.filter((g) => g.status === 'active');
  const closed = goals.filter((g) => g.status !== 'active');

  const linkedTasks = await repo.listTasks(user.id, {
    goalIds: active.map((g) => g.id),
    status: ['todo', 'doing', 'done'],
    limit: 500,
  });
  const tasksFor = (goalId: string): GoalTasks => {
    const mine = linkedTasks.filter((t) => t.goalId === goalId);
    return {
      open: mine.filter((t) => t.status !== 'done').map((t) => ({ id: t.id, title: t.title })),
      done: mine.filter((t) => t.status === 'done').length,
    };
  };
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const tradingName = new Map(tradingAccounts.map((a) => [a.id, a.name]));
  const sourceFor = (goal: (typeof goals)[number]): string | null =>
    goal.accountId
      ? `the balance of ${accountName.get(goal.accountId) ?? 'a linked account'}`
      : goal.tradingAccountId
        ? `profit on ${tradingName.get(goal.tradingAccountId) ?? 'a trading account'}`
        : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Start here"
        accent="habits"
        title="Goals"
        description="What you are building toward. Tasks, money and trades all point here — each goal shows the work that moves it and can follow an account by itself."
      />

      <Card accent="habits">
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
                source={sourceFor(goal)}
                tasks={tasksFor(goal.id)}
              />
            ))
          )}
        </CardBody>
      </Card>

      {closed.length > 0 && (
        <Card accent="habits">
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

      <Card accent="habits">
        <CardHeader title="Set a goal" />
        <CardBody>
          <AddGoalForm
            habits={habits.map((h) => ({ id: h.id, name: h.name }))}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
            tradingAccounts={tradingAccounts.map((a) => ({
              id: a.id,
              name: a.name,
              currency: a.currency,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
