import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronRight,
  FileUp,
  PieChart,
  Repeat,
  LineChart,
  Scale,
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
import * as decisionsRepo from '@/modules/decisions/repository';
import * as financeRepo from '@/modules/finance/repository';
import { remindDueBills } from '@/modules/finance/service';
import { daysUntil, dueLabel } from '@/modules/finance/recurring';
import { formatMoney, type Currency } from '@nestedflow/domain/money';
import { buildWealth } from '@/modules/dashboard/wealth';
import { WealthPanel } from './wealth-panel';
import { brand } from '@/lib/brand';
import { hideSetupGuide } from './actions';

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
  // The notification is raised now; the email goes after the page is sent.
  await remindDueBills(user.id, snapshot.today, after);
  const [dueDecisions, wealth, recurring, accounts, budgets, jar] = await Promise.all([
    decisionsRepo.listDueDecisions(user.id, snapshot.today),
    buildWealth(user, snapshot.today),
    financeRepo.listSubscriptions(user.id),
    financeRepo.listAccounts(user.id),
    financeRepo.listBudgets(user.id),
    cookies(),
  ]);
  const setup = {
    account: accounts.length > 0,
    budget: budgets.length > 0,
    bill: recurring.length > 0,
  };
  const showGuide =
    !(setup.account && setup.budget && setup.bill) &&
    !jar.has(`nf-setup-hidden-${user.id.slice(0, 8)}`);
  // Bills due within three days, or already late.
  const dueBills = recurring.filter(
    (b) => b.status === 'active' && daysUntil(b.nextDueOn, snapshot.today) <= 3,
  );

  const nothingYet =
    !snapshot.tasks.hasData &&
    !snapshot.goals.hasData &&
    !snapshot.finance.hasData &&
    !snapshot.trading.hasData;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={longDate(snapshot.today)}
        title={
          <>
            {greeting(renderedAt, user.timezone)}, <em>{firstName(user.displayName)}</em>
          </>
        }
      />

      {showGuide ? <SetupGuide done={setup} fresh={nothingYet} /> : nothingYet && <FirstRun />}
      {!nothingYet && <WealthPanel wealth={wealth} locale={user.locale || 'en-IN'} />}

      {(snapshot.tasks.overdue > 0 ||
        snapshot.goals.offTrack.length > 0 ||
        snapshot.finance.overBudget.length > 0 ||
        snapshot.trading.consecutiveLosses >= 3 ||
        dueDecisions.length > 0 ||
        dueBills.length > 0) && (
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

              {snapshot.goals.offTrack.map((goal) => (
                <Attention
                  key={goal.id}
                  href="/tasks/goals"
                  icon={<Target aria-hidden className="size-4" />}
                  accent="goals"
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

              {dueDecisions.length > 0 && (
                <Attention
                  href="/notes/decisions"
                  accent="accent"
                  icon={<Scale aria-hidden className="size-4" />}
                  title={
                    dueDecisions.length === 1
                      ? `Review your decision: ${dueDecisions[0]!.title}`
                      : `${dueDecisions.length} decisions ready to review`
                  }
                  detail="Their review day has come. Was each the right call?"
                />
              )}

              {dueBills.map((bill) => (
                <Attention
                  key={bill.id}
                  href="/finance"
                  accent="finance"
                  icon={<CalendarClock aria-hidden className="size-4" />}
                  title={`${bill.name}: ${dueLabel(bill.nextDueOn, snapshot.today).toLowerCase()}`}
                  detail={`${formatMoney(bill.amountMinor, bill.currency as Currency)}. Tap Paid on Finance once it is done.`}
                />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* ---------------------------------------------------------- goals */}
      {/* Goals sit above everything else: the rest of the page is how they
          get done, so they come first. */}
      {!nothingYet && (
        <Card accent="goals">
          <CardHeader
            title="Your goals"
            accent="goals"
            icon={<Target aria-hidden className="size-4" />}
            description={
              snapshot.goals.hasData
                ? `${snapshot.goals.active} active${snapshot.goals.offTrack.length ? ` · ${snapshot.goals.offTrack.length} behind pace` : ''}`
                : 'What everything else here is for.'
            }
            action={<CardAction href="/tasks/goals">All goals</CardAction>}
          />
          <CardBody className={snapshot.goals.hasData ? 'flex flex-col gap-4' : 'p-0'}>
            {!snapshot.goals.hasData ? (
              <Blank
                icon={<Target aria-hidden className="size-5" />}
                title="Start with a goal"
                body="An emergency fund, a prop challenge, a business. Tasks, money and trades can all point at it."
                href="/tasks/goals?new=goal"
                accent="goals"
                cta="Set your first goal"
              />
            ) : (
              snapshot.goals.items.map((goal) => (
                <div key={goal.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-primary">
                      <span className="truncate">{goal.title}</span>
                      {goal.offTrack && <Badge tone="warning">Behind pace</Badge>}
                    </span>
                    <span className="numeric text-xs text-text-muted">
                      {goal.currentLabel} of {goal.targetLabel}
                      {goal.daysRemaining !== null && goal.daysRemaining >= 0
                        ? ` · ${goal.daysRemaining}d left`
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress
                      value={goal.percent}
                      label={`${goal.title} progress`}
                      tone={goal.offTrack ? 'warning' : 'positive'}
                    />
                    <span className="numeric w-10 shrink-0 text-right text-sm font-semibold text-text-primary">
                      {goal.percent}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      )}

      <div className="cascade-grid grid gap-5 lg:grid-cols-2">
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
                href="/finance?new=account"
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
                href="/trading?new=account"
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
  href: '/tasks' | '/tasks/goals' | '/finance' | '/trading' | '/notes/decisions';
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

/** Each blank's button wears its area's colour, so the four read as four. */
const CTA: Record<Accent, string> = {
  tasks: 'bg-tasks hover:bg-tasks/90',
  goals: 'bg-warning hover:bg-warning/90',
  habits: 'bg-habits hover:bg-habits/90',
  finance: 'bg-finance hover:bg-finance/90',
  trading: 'bg-trading hover:bg-trading/90',
  accent: 'bg-text-primary hover:bg-text-primary/90',
};

const GLOW: Record<Accent, string> = {
  tasks: 'bg-tasks/25',
  goals: 'bg-warning/25',
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
  href: '/tasks' | '/tasks/goals?new=goal' | '/finance?new=account' | '/trading?new=account';
  cta: string;
  accent: Accent;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="float-soft relative mb-4">
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
          'text-surface-sunken shadow-(--shadow-raised)',
          'transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-(--ease-out-soft)',
          'hover:shadow-(--shadow-overlay)',
          CTA[accent],
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

const SETUP_STEPS = [
  {
    key: 'account',
    href: '/finance?new=account',
    icon: Wallet,
    title: 'Add your bank account',
    body: 'The account or card your money moves through. Just a name and a balance, no bank login.',
    cta: 'Add account',
  },
  {
    key: 'budget',
    href: '/finance?new=budget',
    icon: PieChart,
    title: 'Set a monthly budget',
    body: 'A limit for one category, like Food or Fuel. It fills up as you spend and warns you at 80%.',
    cta: 'Set a budget',
  },
  {
    key: 'bill',
    href: '/finance?new=bill',
    icon: Repeat,
    title: 'Add a bill that repeats',
    body: 'Rent, Netflix, an EMI or your phone. You get a reminder three days before it is due.',
    cta: 'Add a bill',
  },
] as const;

/**
 * The setup guide: three steps that make Finance useful from day one, each a
 * tap away and ticked off as it is done. It stays until all three are done
 * or the person hides it.
 */
function SetupGuide({
  done,
  fresh,
}: {
  done: Record<(typeof SETUP_STEPS)[number]['key'], boolean>;
  fresh: boolean;
}) {
  const count = SETUP_STEPS.filter((s) => done[s.key]).length;
  const next = SETUP_STEPS.find((s) => !done[s.key])?.key;
  return (
    <Card className="overflow-hidden" labelledBy="setup-guide">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-finance/15 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-col gap-3">
          {fresh && (
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border-subtle bg-surface-overlay/60 px-3 py-1 text-xs text-text-secondary">
              <span aria-hidden className="flex gap-1">
                <span className="size-1.5 rounded-full bg-tasks" />
                <span className="size-1.5 rounded-full bg-finance" />
                <span className="size-1.5 rounded-full bg-trading" />
              </span>
              Welcome to {brand.name}
            </p>
          )}
          <div>
            <h2
              id="setup-guide"
              className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
            >
              Set up your money in 3 steps
            </h2>
            <p className="mt-1 text-sm text-pretty text-text-secondary">
              Each takes under a minute. {count} of 3 done.
              {fresh &&
                ` ${brand.name} never invents a balance, streak or win rate: every number here comes from you.`}
            </p>
          </div>
          <Progress
            value={count}
            max={3}
            label={`Setup: ${count} of 3 steps done`}
            tone="positive"
          />
        </div>

        <ol className="flex flex-col gap-2.5">
          {SETUP_STEPS.map((step, i) => {
            const finished = done[step.key];
            const current = step.key === next;
            const Icon = step.icon;
            return (
              <li
                key={step.key}
                className={cn(
                  'flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center',
                  current
                    ? 'border-finance/40 bg-surface-overlay shadow-(--shadow-edge)'
                    : 'border-border-subtle bg-surface-overlay/40',
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      finished
                        ? 'bg-positive text-surface-sunken'
                        : current
                          ? 'bg-finance/15 text-finance ring-1 ring-finance/30 ring-inset'
                          : 'bg-surface-sunken text-text-muted',
                    )}
                  >
                    {finished ? <Check className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        finished ? 'text-text-muted line-through' : 'text-text-primary',
                      )}
                    >
                      <span className="sr-only">Step {i + 1}: </span>
                      {step.title}
                      {finished && <span className="sr-only"> (done)</span>}
                    </p>
                    {!finished && (
                      <p className="mt-0.5 text-xs text-pretty text-text-secondary">{step.body}</p>
                    )}
                    {step.key === 'account' && !finished && (
                      <Link
                        href="/finance/import"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-finance hover:underline"
                      >
                        <FileUp aria-hidden className="size-3.5" />
                        Have a bank statement PDF? Import it instead
                      </Link>
                    )}
                  </div>
                </div>
                {!finished && (
                  <Link
                    href={step.href}
                    className={cn(
                      'inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4 text-sm font-medium',
                      current
                        ? 'bg-text-primary text-surface-sunken'
                        : 'border border-border-subtle bg-surface-overlay text-text-primary hover:border-border-strong',
                    )}
                  >
                    {step.cta}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
          {fresh ? (
            <p>
              Or start somewhere else:{' '}
              <Link href="/tasks/goals?new=goal" className="text-text-secondary underline">
                a goal
              </Link>
              ,{' '}
              <Link href="/tasks" className="text-text-secondary underline">
                today&apos;s tasks
              </Link>{' '}
              or{' '}
              <Link href="/trading?new=account" className="text-text-secondary underline">
                a trading journal
              </Link>
              .
            </p>
          ) : (
            <span />
          )}
          <form action={hideSetupGuide}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            >
              Hide this guide
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}

const QUICK_STARTS = [
  {
    href: '/tasks/goals?new=goal',
    accent: 'goals',
    icon: Target,
    title: 'Set a goal',
    body: 'What all of this is for.',
  },
  {
    href: '/tasks',
    accent: 'tasks',
    icon: CheckSquare,
    title: 'Plan the day',
    body: 'One task you want finished today.',
  },
  {
    href: '/finance?new=account',
    accent: 'finance',
    icon: Wallet,
    title: 'Track your money',
    body: 'Add an account, then what you spent.',
  },
  {
    href: '/trading?new=account',
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
            Let&apos;s set up your system
          </h2>
          <p className="mt-2 text-sm text-pretty text-text-secondary">
            Pick the one you&apos;d use tomorrow. {brand.name} never invents a balance, streak or
            win rate. Every number here comes from you.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

/** Morning, afternoon or evening where the user is, not where the server is. */
function greeting(at: number, timeZone: string): string {
  let hour = 12;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(
        new Date(at),
      ),
    );
  } catch {
    // An unknown zone keeps the neutral midday greeting.
  }
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Haneesh Varma" → "Haneesh". A single name is used whole. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
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
