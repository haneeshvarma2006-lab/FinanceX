import type { Metadata } from 'next';
import { ChevronDown, Workflow } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Badge, PageHeader } from '@/components/ui/money';
import { Sheet } from '@/components/ui/sheet';
import * as repo from '@/modules/rules/repository';
import { TRIGGERS, isTriggerType } from '@/modules/rules/triggers';
import { ACTIONS, isActionType } from '@/modules/rules/actions';
import { AddRuleForm, PruneButton, RuleRow } from './views';
import { brand } from '@/lib/brand';

export const metadata: Metadata = { title: 'Rules' };

const STATUS_TONE = {
  fired: 'positive',
  not_matched: 'neutral',
  suppressed: 'neutral',
  error: 'negative',
} as const;

const STATUS_LABEL = {
  fired: 'fired',
  not_matched: 'no match',
  suppressed: 'already handled',
  error: 'error',
} as const;

/** Human summary of a stored rule, built from the catalogue. */
function describe(rule: { triggerType: string; triggerConfig: Record<string, unknown> }) {
  if (!isTriggerType(rule.triggerType)) return 'Unknown condition';

  const entry = TRIGGERS[rule.triggerType];
  const parsed = entry.config.safeParse(rule.triggerConfig);
  if (!parsed.success) return entry.label;

  return entry.describe(parsed.data as never);
}

export default async function RulesPage() {
  const user = await requireUser();

  const [rules, runs] = await Promise.all([
    repo.listRules(user.id),
    repo.listRuns(user.id, { limit: 40 }),
  ]);

  const ruleName = new Map(rules.map((r) => [r.id, r.name]));
  // The latest check per rule, not every check: the same five lines
  // repeated once per visit buried the one that mattered.
  const latest = runs.filter((run, i) => runs.findIndex((r) => r.ruleId === run.ruleId) === i);
  const when = new Intl.DateTimeFormat(user.locale || 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: user.timezone,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Automation"
        accent="accent"
        icon={<Workflow />}
        title="Rules"
        description={`What ${brand.name} watches for, and what it does about it.`}
        action={
          <Sheet
            label="New rule"
            description="When something happens, do one thing about it."
            className="w-full sm:w-auto"
          >
            <AddRuleForm
              triggers={Object.entries(TRIGGERS).map(([value, t]) => ({
                value,
                label: t.label,
                // Which extra input the condition needs, if any.
                needs:
                  'count' in t.config.shape
                    ? 'count'
                    : 'amount' in t.config.shape
                      ? 'amount'
                      : null,
              }))}
              actions={Object.entries(ACTIONS).map(([value, a]) => ({ value, label: a.label }))}
            />
          </Sheet>
        }
      />

      <Card accent="accent">
        <CardHeader
          title="Your rules"
          description={`${rules.filter((r) => r.enabled).length} active of ${rules.length}`}
        />
        <CardBody className="p-0">
          {rules.length === 0 ? (
            <EmptyState
              icon={<Workflow aria-hidden className="size-5" />}
              title="No rules yet"
              description="A rule watches one condition in your own records and does one thing when it matches."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={{
                    id: rule.id,
                    name: rule.name,
                    enabled: rule.enabled,
                    condition: describe(rule),
                    action: isActionType(rule.actionType)
                      ? ACTIONS[rule.actionType].label
                      : 'Unknown action',
                    lastFiredAt: rule.lastFiredAt
                      ? rule.lastFiredAt.toISOString().slice(0, 16).replace('T', ' ')
                      : null,
                  }}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card accent="accent">
        <CardHeader
          title="Recent activity"
          description="The last check of each rule, and why it did or didn't act."
          action={runs.length > 0 ? <PruneButton /> : undefined}
        />
        <CardBody className="p-0">
          {runs.length === 0 ? (
            <EmptyState
              title="Nothing evaluated yet"
              description="Rules are checked when you open your dashboard."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {latest.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                      {ruleName.get(run.ruleId) ?? 'Deleted rule'}
                      <Badge tone={STATUS_TONE[run.status as keyof typeof STATUS_TONE]}>
                        {STATUS_LABEL[run.status as keyof typeof STATUS_LABEL] ?? run.status}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-pretty text-text-secondary">{run.reason}</p>
                  </div>
                  <span className="numeric shrink-0 text-xs text-text-muted">
                    {when.format(run.firedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <details className="group rounded-2xl border border-border-subtle/70 px-5 py-4 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-text-primary [&::-webkit-details-marker]:hidden">
          How rules work
          <ChevronDown
            aria-hidden
            className="size-4 text-text-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-pretty text-text-secondary">
          <li>
            Each rule is one condition and one action, picked from a list: data, not code. Nothing
            you type is ever run.
          </li>
          <li>Rules check your own records when you open Today. Nothing outside your account.</li>
          <li>A rule acts once a day at most, so you are never spammed.</li>
          <li>The five you started with are yours to change, pause or delete.</li>
        </ul>
      </details>
    </div>
  );
}
