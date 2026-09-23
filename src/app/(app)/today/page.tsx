import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckSquare,
  ChevronRight,
  Flame,
  LineChart,
  Target,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { requireUser } from '@/lib/auth/current-user';
import {
  Card,
  CardAction,
  CardBody,
  CardHeader,
  Stat,
  StatGrid,
  type Accent,
} from '@/components/ui/card';
import { Badge, Money, PageHeader, Progress } from '@/components/ui/money';
import { buildTodaySnapshot, runAutomationRules } from '@/modules/dashboard/service';
import { brand } from '@/lib/brand';

export const metadata: Metadata = { title: 'Today' };

/**
 * The dashboard.
 *
 * Every number here is read from the user's own records. A widget with nothing
 * behind it says so and offers the one action that would give it something —
 * it never shows a plausible-looking placeholder, because a fabricated balance
 * or win rate is worse than an honest blank.
 */
export default async function TodayPage() {
  const user = await requireUser();

  const snapshot = await buildTodaySnapshot(user.id, user.timezone, user.baseCurrency);

  // The snapshot reports the instant it was built, so the page renders
  // time-relative state without reading a clock during render.
  const { renderedAt } = snapshot;

  // The user's own rules, evaluated against the same read the page renders,
  // so what they are told always matches what they can see.
  await runAutomationRules(user.id, snapshot);

  const nothingYet =
    !snapshot.tasks.hasData &&
    !snapshot.habits.hasData &&
    !snapshot.goals.hasData &&
    !snapshot.finance.hasData &&
    !snapshot.trading.hasData;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Good to see you, ${user.displayName}`}
        description={`${snapshot.today} · everything below is from your own records.`}
      />

      {nothingYet ? <FirstRun /> : null}

      {(snapshot.tasks.overdue > 0 ||
        snapshot.habits.atRisk.length > 0 ||
        snapshot.goals.offTrack.length > 0 ||
        snapshot.finance.overBudget.length > 0 ||
        snapshot.trading.consecutiveLosses >= 3) && (
        <Card tone="warning">
          <CardHeader
            title="Worth your attention"
            description="Things that changed state and are waiting on a decision."
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-border-subtle">
              {snapshot.tasks.overdue > 0 && (
                <Attention
                  href="/tasks"
                  icon={<AlertTriangle aria-hidden className="size-4" />}
                  accent="tasks"
                  title={`${snapshot.tasks.overdue} overdue task${snapshot.tasks.overdue === 1 ? '' : 's'}`}
                  detail="Past the due time and still open."
                />
              )}

              {snapshot.habits.atRisk.map((habit) => (
                <Attention
                  key={habit.id}
                  href="/habits"
                  icon={<Flame aria-hidden className="size-4" />}
                  accent="habits"
                  title={`${habit.name}: ${habit.streak.current}-day streak`}
                  detail="Not logged yet today."
                />
              ))}

              {snapshot.goals.offTrack.map((goal) => (
                <Attention
                  key={goal.id}
                  href="/goals"
                  icon={<Target aria-hidden className="size-4" />}
                  accent="habits"
                  title={`${goal.title} is behind pace`}
                  detail={`At ${goal.percent}%, with less time left than that.`}
                />
              ))}

              {snapshot.finance.overBudget.length > 0 && (
                <Attention
                  href="/finance"
                  icon={<Wallet aria-hidden className="size-4" />}
                  accent="finance"
                  title={`${snapshot.finance.overBudget.length} budget${snapshot.finance.overBudget.length === 1 ? '' : 's'} exceeded`}
                  detail="Spending has passed the limit you set this month."
                />
              )}

              {snapshot.trading.consecutiveLosses >= 3 && (
                <Attention
                  href="/trading"
                  icon={<LineChart aria-hidden className="size-4" />}
                  accent="trading"
                  title={`${snapshot.trading.consecutiveLosses} losing trades in a row`}
                  detail="Worth reviewing what they had in common before the next one."
                />
              )}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* ---------------------------------------------------------- tasks */}
        <Card>
          <CardHeader
            title="Today's work"
            accent="tasks"
            icon={<CheckSquare aria-hidden className="size-4" />}
            description={
              snapshot.tasks.hasData
                ? `${snapshot.tasks.completedToday} done · ${snapshot.tasks.openTotal} open`
                : undefined
            }
            action={<CardAction href="/tasks">All tasks</CardAction>}
          />
          <CardBody className="p-0">
            {!snapshot.tasks.hasData ? (
              <Blank
                icon={<CheckSquare aria-hidden className="size-5" />}
                title="No tasks yet"
                body="Add the one thing you most want to finish today."
                href="/tasks"
                cta="Add your first task"
              />
            ) : snapshot.tasks.next.length === 0 ? (
              <Blank
                icon={<CheckSquare aria-hidden className="size-5" />}
                title="Nothing open"
                body={`You have completed ${snapshot.tasks.completedToday} today and nothing is outstanding.`}
                href="/tasks"
                cta="Add a task"
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {snapshot.tasks.next.map((task) => {
                  const overdue =
                    task.dueAt !== null && new Date(task.dueAt).getTime() < renderedAt;
                  return (
                    <li key={task.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="min-w-0 truncate text-sm text-text-primary">
                        {task.title}
                      </span>
                      {overdue ? (
                        <Badge tone="negative">Overdue</Badge>
                      ) : task.scheduledFor ? (
                        <span className="numeric shrink-0 text-xs text-text-muted">
                          {task.scheduledFor}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* --------------------------------------------------------- habits */}
        <Card>
          <CardHeader
            title="Habits"
            accent="habits"
            icon={<Flame aria-hidden className="size-4" />}
            description={
              snapshot.habits.hasData
                ? `${snapshot.habits.doneToday} of ${snapshot.habits.items.length} done today`
                : undefined
            }
            action={<CardAction href="/habits">All habits</CardAction>}
          />
          <CardBody className="p-0">
            {!snapshot.habits.hasData ? (
              <Blank
                icon={<Flame aria-hidden className="size-5" />}
                title="No habits yet"
                body="Pick one you could do on your worst day."
                href="/habits"
                cta="Add your first habit"
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {snapshot.habits.items.slice(0, 5).map((habit) => (
                  <li key={habit.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 truncate text-sm text-text-primary">{habit.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {habit.streak.current > 0 && (
                        <span className="numeric text-xs text-text-muted">
                          {habit.streak.current}d
                        </span>
                      )}
                      <Badge tone={habit.streak.completedToday ? 'positive' : 'neutral'}>
                        {habit.streak.completedToday ? 'Done' : 'Not yet'}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* ---------------------------------------------------------- money */}
        <Card>
          <CardHeader
            title="Money this month"
            accent="finance"
            icon={<Wallet aria-hidden className="size-4" />}
            action={<CardAction href="/finance">Finance</CardAction>}
          />
          <CardBody className={snapshot.finance.hasData ? undefined : 'p-0'}>
            {!snapshot.finance.hasData ? (
              <Blank
                icon={<Wallet aria-hidden className="size-5" />}
                title="No accounts yet"
                body="Add an account, then record what you actually spent."
                href="/finance"
                cta="Add an account"
              />
            ) : (
              <StatGrid>
                <Stat
                  label="Balance"
                  value={
                    <Money
                      minor={snapshot.finance.balanceMinor}
                      currency={snapshot.finance.currency}
                    />
                  }
                />
                <Stat
                  label="In"
                  tone="positive"
                  value={
                    <Money
                      minor={snapshot.finance.incomeMinor}
                      currency={snapshot.finance.currency}
                    />
                  }
                />
                <Stat
                  label="Out"
                  tone="negative"
                  value={
                    <Money
                      minor={snapshot.finance.expenseMinor}
                      currency={snapshot.finance.currency}
                    />
                  }
                />
              </StatGrid>
            )}
          </CardBody>
        </Card>

        {/* -------------------------------------------------------- trading */}
        <Card>
          <CardHeader
            title="Trading"
            accent="trading"
            icon={<LineChart aria-hidden className="size-4" />}
            description={snapshot.trading.hasData ? 'Your recorded trades only.' : undefined}
            action={<CardAction href="/trading">Journal</CardAction>}
          />
          <CardBody className={snapshot.trading.hasData ? undefined : 'p-0'}>
            {!snapshot.trading.hasData ? (
              <Blank
                icon={<LineChart aria-hidden className="size-5" />}
                title="No trading account yet"
                body={`Journal trades you placed elsewhere. ${brand.name} places no orders.`}
                href="/trading"
                cta="Set up the journal"
              />
            ) : snapshot.trading.closedTrades === 0 ? (
              <p className="text-sm text-pretty text-text-secondary">
                {snapshot.trading.openTrades > 0
                  ? `${snapshot.trading.openTrades} open position${snapshot.trading.openTrades === 1 ? '' : 's'}. Statistics appear once a trade is closed.`
                  : 'No trades recorded yet. Log one to start building a history.'}
              </p>
            ) : (
              <StatGrid>
                <Stat label="Closed" value={snapshot.trading.closedTrades} />
                <Stat label="Win rate" value={`${snapshot.trading.winRatePercent}%`} />
                <Stat
                  label="Realised"
                  value={
                    <Money
                      minor={snapshot.trading.netPnlMinor}
                      currency={snapshot.trading.currency}
                      signed
                    />
                  }
                />
              </StatGrid>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ----------------------------------------------------------- goals */}
      {snapshot.goals.hasData && snapshot.goals.nearest && (
        <Card>
          <CardHeader
            title="Closest deadline"
            accent="habits"
            icon={<Target aria-hidden className="size-4" />}
            action={<CardAction href="/goals">All goals</CardAction>}
          />
          <CardBody className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text-primary">{snapshot.goals.nearest.title}</span>
              <span className="numeric text-xs text-text-muted">
                {snapshot.goals.nearest.daysRemaining !== null &&
                snapshot.goals.nearest.daysRemaining >= 0
                  ? `${snapshot.goals.nearest.daysRemaining} days left`
                  : 'past its date'}
              </span>
            </div>
            <Progress
              value={snapshot.goals.nearest.percent}
              label={`${snapshot.goals.nearest.title} progress`}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Attention({
  href,
  icon,
  accent,
  title,
  detail,
}: {
  href: '/tasks' | '/habits' | '/goals' | '/finance' | '/trading';
  icon: React.ReactNode;
  /** The domain the item came from, so the row matches its section. */
  accent: Accent;
  title: string;
  detail: string;
}) {
  const iconTone = {
    tasks: 'bg-tasks/12 text-tasks',
    habits: 'bg-habits/12 text-habits',
    finance: 'bg-finance/12 text-finance',
    trading: 'bg-trading/12 text-trading',
    accent: 'bg-accent-soft text-accent',
  }[accent];

  return (
    <li>
      <Link
        href={href}
        className={cn(
          'group relative flex items-center gap-3 py-3 pr-4 pl-5',
          'transition-colors duration-[var(--duration-fast)] ease-(--ease-out-soft)',
          'hover:bg-surface-overlay',
          // A rail that arrives on hover rather than a background that jumps:
          // it points at the row being pointed at.
          'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent',
          'before:scale-y-0 before:transition-transform before:duration-[var(--duration-fast)]',
          'before:ease-(--ease-out-soft) hover:before:scale-y-100',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center',
            'rounded-[var(--radius-control)]',
            iconTone,
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-text-primary">{title}</span>
          <span className="block text-xs text-pretty text-text-muted">{detail}</span>
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-text-muted opacity-0',
            'transition-opacity duration-[var(--duration-fast)] ease-(--ease-out-soft)',
            'group-hover:opacity-100',
          )}
        />
      </Link>
    </li>
  );
}

/** An honest blank: says what is missing and links to the action that fixes it. */
function Blank({
  icon,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: '/tasks' | '/habits' | '/goals' | '/finance' | '/trading';
  cta: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 rounded-full border border-border-subtle bg-surface-inset p-3 text-text-muted">
        {icon}
      </span>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-pretty text-text-secondary">{body}</p>
      <Link
        href={href}
        className="mt-4 rounded-[var(--radius-control)] border border-border-subtle bg-surface-overlay px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-border-strong"
      >
        {cta}
      </Link>
    </div>
  );
}

function FirstRun() {
  return (
    <Card>
      <CardHeader
        title="Nothing here yet — and that is correct"
        description={`${brand.name} will never invent a balance, a streak, or a win rate to make this page look busy.`}
      />
      <CardBody>
        <p className="text-sm text-pretty text-text-secondary">
          Every number on this dashboard comes from something you entered. Pick whichever of these
          you would actually use tomorrow; the rest can wait until you need them.
        </p>
      </CardBody>
    </Card>
  );
}
