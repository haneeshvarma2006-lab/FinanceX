import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader, Stat, StatGrid } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/states';
import { todayFor } from '@/modules/dashboard/service';
import * as repo from '@/modules/decisions/repository';
import type { Decision } from '@/modules/decisions/schema';
import type { DecisionArea, Verdict } from '@/modules/decisions/validators';
import { NotesTabs } from '../tabs';
import { DecisionForm, DecisionItem, type DecisionView } from './views';

export const metadata: Metadata = { title: 'Decisions' };

/** Most decisions show their result within a month; the date is editable. */
const DEFAULT_REVIEW_DAYS = 30;

function addDays(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function DecisionsPage() {
  const user = await requireUser();
  const today = todayFor(user.timezone);
  const decisions = await repo.listDecisions(user.id);

  const locale = user.locale || 'en-IN';
  const made = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: user.timezone,
  });
  const reviewDay = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  const toView = (d: Decision): DecisionView => ({
    id: d.id,
    title: d.title,
    area: d.area as DecisionArea,
    reasoning: d.reasoning,
    expected: d.expected,
    confidence: d.confidence,
    madeOn: made.format(d.createdAt),
    reviewOnLabel: d.reviewOn ? reviewDay.format(new Date(`${d.reviewOn}T12:00:00Z`)) : null,
    due: !d.verdict && d.reviewOn !== null && d.reviewOn <= today,
    verdict: d.verdict as Verdict | null,
    outcome: d.outcome,
  });

  const views = decisions.map(toView);
  const due = views.filter((d) => d.due);
  const open = views.filter((d) => !d.verdict && !d.due);
  const reviewed = views.filter((d) => d.verdict);
  const right = reviewed.filter((d) => d.verdict === 'right').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Diary"
        title="Notes"
        description="Write a decision down before you know how it turns out, then judge it later against what you wrote — not against memory."
      />
      <NotesTabs />

      {reviewed.length > 0 && (
        <Card>
          <CardBody>
            <StatGrid columns={3}>
              <Stat label="Decisions logged" value={String(views.length)} />
              <Stat label="Reviewed" value={String(reviewed.length)} />
              <Stat
                label="Right calls"
                value={`${Math.round((right / reviewed.length) * 100)}%`}
                detail={`${right} of ${reviewed.length} reviewed`}
              />
            </StatGrid>
          </CardBody>
        </Card>
      )}

      {due.length > 0 && (
        <section aria-labelledby="decisions-due">
          <Card accent="habits">
            <CardHeader
              id="decisions-due"
              title="Ready to review"
              description="Their review day has come. Was each the right call?"
            />
            <div className="divide-y divide-border-subtle">
              {due.map((d) => (
                <DecisionItem key={d.id} decision={d} />
              ))}
            </div>
          </Card>
        </section>
      )}

      <Card>
        <CardHeader
          title="Log a decision"
          description="Thirty seconds now saves you from hindsight later."
          icon={<Scale className="size-4" />}
        />
        <CardBody>
          <DecisionForm suggestedReview={addDays(today, DEFAULT_REVIEW_DAYS)} />
        </CardBody>
      </Card>

      {views.length === 0 && (
        <Card>
          <EmptyState
            icon={<Scale aria-hidden className="size-5" />}
            title="No decisions yet"
            description="Log the next one that matters — a purchase, a trade plan, a job move. In a month you will know whether your judgement is getting better."
          />
        </Card>
      )}

      {open.length > 0 && (
        <section aria-labelledby="decisions-open">
          <Card>
            <CardHeader id="decisions-open" title="Waiting on the outcome" />
            <div className="divide-y divide-border-subtle">
              {open.map((d) => (
                <DecisionItem key={d.id} decision={d} />
              ))}
            </div>
          </Card>
        </section>
      )}

      {reviewed.length > 0 && (
        <section aria-labelledby="decisions-reviewed">
          <Card>
            <CardHeader id="decisions-reviewed" title="Reviewed" />
            <div className="divide-y divide-border-subtle">
              {reviewed.map((d) => (
                <DecisionItem key={d.id} decision={d} />
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
