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
  ACCENT_CHIP,
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
        eyebrow={longDate(snapshot.today)}
        title={`Good to see you, ${user.displayName}`}
        description="Everything below is from your own records."
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
                  accent="tasks"
                  icon={<AlertTriangle aria-hidden className="size-4" />}
                  title={`${snapshot.tasks.overdue} overdue task${snapshot.tasks.overdue === 1 ? '' : 's'}`}
                  detail="Past the due time and still open."
                />
              )}

              {snapshot.habits.atRisk.map((habit) => (
                <Attention
                  key={habit.id}
                  href="/habits"
                  accent="habits"
                  icon={<Flame aria-hidden className="size-4" />}
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
                  accent="finance"
                  icon={<Wallet aria-hidden className="size-4" />}
                  title={`${snapshot.finance.overBudget.length} budget${snapshot.finance.overBudget.length === 1 ? '' : 's'} exceeded`}
                  detail="Spending has passed the limit you set this month."
                />
              )}

              {snapshot.trading.consecutiveLosses >= 3 && (
                <Attention
                  href="/trading"
                  accent="trading"
                  icon={<LineChart aria-hidden className="size-4" />}
                  title={`${snapshot.trading.consecutiveLosses} losing trades in a row`}
                  detail="Worth reviewing what they had in common before the next one."
                />
              )}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="cascade-grid grid items-start gap-5 lg:grid-cols-2">
        {/* ---------------------------------------------------------- tasks */}
        <Card accent="tasks">
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
                accent="tasks"
                cta="Add your first task"
              />
            ) : snapshot.tasks.next.length === 0 ? (
              <Blank
                icon={<CheckSquare aria-hidden className="size-5" />}
                title="Nothing open"
                body={`You have completed ${snapshot.tasks.completedToday} today and nothing is outstanding.`}
                href="/tasks"
                accent="tasks"
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
        <Card accent="habits">
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
                accent="habits"
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
        <Card accent="finance">
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
                accent="finance"
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
        <Card accent="trading">
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
                accent="trading"
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
        <Card accent="habits">
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
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
            ACCENT_CHIP[accent],
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

const GLOW: Record<Accent, string> = {
  tasks: 'bg-tasks/25',
  habits: 'bg-habits/25',
  finance: 'bg-finance/25',
  trading: 'bg-trading/25',
  accent: 'bg-accent/25',
};

/** An honest blank: says what is missing and links to the action that fixes it. */
function Blank({
  icon,
  title,
  body,
  href,
  cta,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: '/tasks' | '/habits' | '/goals' | '/finance' | '/trading';
  cta: string;
  accent: Accent;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="relative mb-4">
        <span aria-hidden className={cn('absolute inset-0 rounded-2xl blur-xl', GLOW[accent])} />
        <span
          className={cn(
            'relative inline-flex size-12 items-center justify-center rounded-2xl ring-1 ring-inset',
            'bg-surface-overlay shadow-(--shadow-edge)',
            ACCENT_CHIP[accent],
          )}
        >
          {icon}
        </span>
      </span>
      <p className="text-base font-semibold tracking-tight text-text-primary">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-pretty text-text-secondary">{body}</p>
      <Link
        href={href}
        className={cn(
          'group mt-5 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium',
          'bg-text-primary text-surface-sunken shadow-(--shadow-raised)',
          'transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-(--ease-out-soft)',
          'hover:bg-text-primary/90 hover:shadow-(--shadow-overlay)',
        )}
      >
        {cta}
        <ChevronRight
          aria-hidden
          className="size-3.5 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  );
}

const QUICK_STARTS = [
  {
    href: '/tasks',
    accent: 'tasks',
    icon: CheckSquare,
    title: 'Plan the day',
    body: 'One task you want finished today.',
  },
  {
    href: '/finance',
    accent: 'finance',
    icon: Wallet,
    title: 'Track your money',
    body: 'Add an account, then what you spent.',
  },
  {
    href: '/trading',
    accent: 'trading',
    icon: LineChart,
    title: 'Journal a trade',
    body: 'Record fills; the P&L is worked out.',
  },
] as const;

/**
 * The first screen a new account sees. Three ways in, one per domain, and a
 * plain statement of the promise — no invented figures to make it look busy.
 */
function FirstRun() {
  return (
    <Card className="overflow-hidden">
      <div aria-hidden className="lp-grid pointer-events-none absolute inset-0 opacity-50" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-trading/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-tasks/15 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 p-6 sm:p-8">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-overlay/60 px-3 py-1 text-xs text-text-secondary">
            <span aria-hidden className="flex gap-1">
              <span className="size-1.5 rounded-full bg-tasks" />
              <span className="size-1.5 rounded-full bg-finance" />
              <span className="size-1.5 rounded-full bg-trading" />
            </span>
            Welcome to {brand.name}
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            Nothing here yet — and that is correct
          </h2>
          <p className="mt-2 text-sm text-pretty text-text-secondary">
            {brand.name} will never invent a balance, a streak, or a win rate to make this page look
            busy. Every number on this dashboard comes from something you entered — start with
            whichever you would actually use tomorrow.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {QUICK_STARTS.map(({ href, accent, icon: Icon, title, body }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'group flex h-full items-start gap-3 rounded-xl border border-border-subtle',
                  'bg-surface-overlay/50 p-4 shadow-(--shadow-edge)',
                  'transition-[border-color,background-color,transform] duration-[var(--duration-base)] ease-(--ease-out-soft)',
                  'hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-overlay',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                    ACCENT_CHIP[accent],
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-medium text-text-primary">
                    {title}
                    <ChevronRight
                      aria-hidden
                      className="size-4 text-text-muted transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5 group-hover:text-text-primary"
                    />
                  </span>
                  <span className="mt-0.5 block text-xs text-pretty text-text-muted">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** `2026-09-27` → `Sunday, 27 September`. The ISO day is already the user's own. */
function longDate(isoDay: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoDay}T00:00:00Z`));
}
