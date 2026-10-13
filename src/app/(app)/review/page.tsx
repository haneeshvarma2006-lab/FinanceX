import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  CheckSquare,
  Flame,
  LineChart,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader, Stat, StatGrid, type Accent } from '@/components/ui/card';
import { Badge, Money, PageHeader, Progress } from '@/components/ui/money';
import { TaskCategoryTag } from '@/components/ui/task-category';
import { todayFor } from '@/modules/dashboard/service';
import { shiftWeek, weekContaining, type Finding } from '@/modules/review/analysis';
import { reviewWeek } from '@/modules/review/service';
import { formatMoney, ratioToPercent } from '@nestedflow/domain/money';
import { AdoptRule } from './adopt-rule';

export const metadata: Metadata = { title: 'Weekly review' };

const AREA: Record<Finding['area'], { accent: Accent; icon: LucideIcon; label: string }> = {
  trading: { accent: 'trading', icon: LineChart, label: 'Trading' },
  money: { accent: 'finance', icon: Wallet, label: 'Money' },
  tasks: { accent: 'tasks', icon: CheckSquare, label: 'Tasks' },
  lifestyle: { accent: 'habits', icon: Flame, label: 'Lifestyle' },
};

function rangeLabel(start: string, end: string, locale: string): string {
  const fmt = (iso: string, withMonth: boolean) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: withMonth ? 'short' : undefined,
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));
  return start.slice(5, 7) === end.slice(5, 7)
    ? `${fmt(start, false)}–${fmt(end, true)}`
    : `${fmt(start, true)} – ${fmt(end, true)}`;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const user = await requireUser();
  const today = todayFor(user.timezone);
  const thisWeek = weekContaining(today);

  const { week: raw } = await searchParams;
  const asked = Array.isArray(raw) ? raw[0] : raw;
  // Only real past or current weeks; anything else falls back to this one.
  const week =
    asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(asked)) && asked <= today
      ? weekContaining(asked)
      : thisWeek;
  const isCurrent = week.start === thisWeek.start;
  const previous = shiftWeek(week, -1);
  const next = shiftWeek(week, 1);

  const { facts, review, elapsed } = await reviewWeek(user, week, today);
  const locale = user.locale || 'en-IN';
  const { tasks, habits, money, trading } = facts;
  const mistake = review.mistake;
  const MistakeIcon = mistake ? AREA[mistake.area].icon : ShieldCheck;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Weekly review"
        accent="tasks"
        icon={<CalendarRange />}
        title={
          <>
            Week of <em>{rangeLabel(week.start, week.end, locale)}</em>
          </>
        }
        description={
          isCurrent ? `So far: ${elapsed} of 7 days.` : 'How the week went, from your own records.'
        }
      />

      <nav aria-label="Weeks" className="flex flex-wrap items-center gap-2">
        <Link
          href={`/review?week=${previous.start}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle px-3.5 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Previous week
        </Link>
        {!isCurrent && (
          <>
            <Link
              href={next.start === thisWeek.start ? '/review' : `/review?week=${next.start}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle px-3.5 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary"
            >
              Next week
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
            <Link
              href="/review"
              className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-text-primary underline-offset-4 hover:underline"
            >
              This week
            </Link>
          </>
        )}
      </nav>

      {/* ------------------------------------------------ the one thing */}
      <Card
        tone={mistake ? 'warning' : undefined}
        accent={mistake ? AREA[mistake.area].accent : 'accent'}
      >
        <CardHeader
          title={mistake ? 'The one thing to fix' : 'Nothing costly stood out'}
          description={
            mistake
              ? `${AREA[mistake.area].label} · the costliest pattern in this week's records`
              : undefined
          }
          icon={<MistakeIcon className="size-4" />}
          accent={mistake ? AREA[mistake.area].accent : 'accent'}
        />
        {!mistake && (
          <CardBody>
            <p className="max-w-prose text-sm text-pretty text-text-secondary">
              Checked for losing streaks, feelings that cost money, spending above income or well up
              on last week, plans left undone, overdue work and dropped habits. None of them showed
              up.
            </p>
          </CardBody>
        )}
        {mistake && (
          <CardBody className="flex flex-col gap-4">
            <div>
              <p className="text-lg font-semibold tracking-tight text-pretty text-text-primary sm:text-xl">
                {mistake.title}
              </p>
              <p className="mt-1.5 max-w-prose text-sm text-pretty text-text-secondary">
                {mistake.detail}
              </p>
            </div>
            {mistake.suggestion.kind === 'rule' ? (
              <AdoptRule template={mistake.suggestion.template} label={mistake.suggestion.label} />
            ) : mistake.suggestion.kind === 'covered' ? (
              <p className="inline-flex items-center gap-2 text-sm text-text-secondary">
                <ShieldCheck aria-hidden className="size-4 text-positive" />
                {mistake.suggestion.label}
              </p>
            ) : (
              <Link
                href={mistake.suggestion.href}
                className="inline-flex h-9.5 items-center gap-2 self-start rounded-[var(--radius-control)] border border-border-subtle bg-surface-overlay px-4 text-sm text-text-primary shadow-(--shadow-edge) hover:border-border-strong"
              >
                {mistake.suggestion.label}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            )}
          </CardBody>
        )}
      </Card>

      {review.wins.length > 0 && (
        <Card>
          <CardHeader title="What went well" icon={<Sparkles className="size-4" />} />
          <CardBody className="p-0">
            <ul className="divide-y divide-border-subtle">
              {review.wins.map((win) => {
                const Icon = AREA[win.area].icon;
                return (
                  <li
                    key={win.text}
                    className="flex items-center gap-3 px-5 py-3 text-sm text-text-primary"
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-positive" />
                    {win.text}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="cascade-grid grid items-start gap-5 lg:grid-cols-2">
        {/* --------------------------------------------------------- tasks */}
        <Card accent="tasks">
          <CardHeader title="Tasks" accent="tasks" icon={<CheckSquare className="size-4" />} />
          <CardBody className="flex flex-col gap-4">
            <StatGrid>
              <Stat label="Done" value={tasks.completed} />
              <Stat
                label="Planned, done"
                value={tasks.planned > 0 ? `${tasks.plannedDone}/${tasks.planned}` : '—'}
              />
              <Stat
                label="Overdue now"
                value={tasks.overdueOpen}
                tone={tasks.overdueOpen > 0 ? 'negative' : undefined}
              />
            </StatGrid>
            {Object.keys(tasks.byCategory).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
                {Object.entries(tasks.byCategory).map(([category, n]) => (
                  <span key={category} className="inline-flex items-center gap-1.5">
                    <TaskCategoryTag category={category} />
                    <span className="numeric text-xs text-text-muted">×{n}</span>
                  </span>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* ----------------------------------------------------- lifestyle */}
        <Card accent="habits">
          <CardHeader title="Lifestyle" accent="habits" icon={<Flame className="size-4" />} />
          <CardBody className="flex flex-col gap-3">
            {habits.length === 0 ? (
              <p className="text-sm text-text-secondary">No habits to count yet.</p>
            ) : (
              habits.map((h) => {
                const percent =
                  h.target > 0 ? Math.min(100, Math.round((h.done / h.target) * 100)) : 0;
                return (
                  <div key={h.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-text-primary">{h.name}</span>
                      <span className="numeric shrink-0 text-xs text-text-muted">
                        {h.done} of {h.target}
                      </span>
                    </div>
                    <Progress
                      value={percent}
                      label={`${h.name}: ${h.done} of ${h.target}`}
                      tone={h.target > 0 && h.done * 2 < h.target ? 'warning' : 'positive'}
                    />
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        {/* --------------------------------------------------------- money */}
        <Card accent="finance">
          <CardHeader
            title="Money"
            accent="finance"
            icon={<Wallet className="size-4" />}
            description={money ? `In ${money.currency}, transfers excluded` : undefined}
          />
          <CardBody className="flex flex-col gap-4">
            {!money ? (
              <p className="text-sm text-text-secondary">No transactions this week.</p>
            ) : (
              <>
                <StatGrid>
                  <Stat
                    label="In"
                    tone="positive"
                    value={
                      <Money minor={money.incomeMinor} currency={money.currency} locale={locale} />
                    }
                  />
                  <Stat
                    label="Out"
                    tone="negative"
                    value={
                      <Money minor={money.expenseMinor} currency={money.currency} locale={locale} />
                    }
                    detail={
                      money.previousExpenseMinor > 0n
                        ? `${money.expenseMinor > money.previousExpenseMinor ? 'up' : 'down'} from ${formatMoney(money.previousExpenseMinor, money.currency, { locale })} last week`
                        : undefined
                    }
                  />
                  <Stat
                    label="Kept"
                    value={
                      money.incomeMinor > 0n
                        ? `${ratioToPercent(money.incomeMinor - money.expenseMinor, money.incomeMinor)}%`
                        : '—'
                    }
                  />
                </StatGrid>
                {money.topCategory && (
                  <p className="border-t border-border-subtle pt-4 text-sm text-text-secondary">
                    Biggest spend:{' '}
                    <span className="text-text-primary">{money.topCategory.name}</span>{' '}
                    <Money
                      minor={money.topCategory.spentMinor}
                      currency={money.currency}
                      locale={locale}
                    />
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* ------------------------------------------------------- trading */}
        <Card accent="trading">
          <CardHeader title="Trading" accent="trading" icon={<LineChart className="size-4" />} />
          <CardBody className="flex flex-col gap-4">
            {!trading || trading.closed === 0 ? (
              <p className="text-sm text-text-secondary">No trades closed this week.</p>
            ) : (
              <>
                <StatGrid>
                  <Stat label="Closed" value={trading.closed} />
                  <Stat
                    label="Win rate"
                    value={`${Math.round((trading.wins / trading.closed) * 100)}%`}
                  />
                  <Stat
                    label="Net"
                    value={
                      <Money
                        minor={trading.netPnlMinor}
                        currency={trading.currency}
                        locale={locale}
                        signed
                      />
                    }
                  />
                </StatGrid>
                {trading.biggestLoss && (
                  <p className="border-t border-border-subtle pt-4 text-sm text-text-secondary">
                    Biggest loss:{' '}
                    <span className="text-text-primary">{trading.biggestLoss.symbol}</span>{' '}
                    <Money
                      minor={trading.biggestLoss.pnlMinor}
                      currency={trading.currency}
                      locale={locale}
                      signed
                    />
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Journal" icon={<NotebookPen className="size-4" />} />
        <CardBody>
          <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <Badge>
              {facts.notesWritten} diary {facts.notesWritten === 1 ? 'entry' : 'entries'}
            </Badge>
            <Badge>{facts.decisions.made} decisions logged</Badge>
            {facts.decisions.reviewed > 0 && (
              <Badge tone="positive">
                {facts.decisions.right} of {facts.decisions.reviewed} reviewed were right calls
              </Badge>
            )}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
