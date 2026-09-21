import { addDays, parseISO } from 'date-fns';
import { conflict, invalid, notFound, ok, type Result } from '@/lib/result';
import type { TodaySnapshot } from '@/modules/dashboard/service';
import { notify } from '@/modules/productivity/notifications';
import * as productivityRepo from '@/modules/productivity/repository';
import * as repo from './repository';
import { ACTIONS, isActionType, type ActionType } from './actions';
import { TRIGGERS, isTriggerType, type TriggerType } from './triggers';
import type { AutomationRule } from './schema';

/**
 * The rules engine.
 *
 * Evaluation is: read the day's snapshot once, run every enabled rule against
 * it, record what each decided, and perform the actions that matched.
 *
 * Three properties it guarantees:
 *
 * 1. **Nothing user-supplied is executed.** A rule names a trigger and an
 *    action from fixed catalogues and supplies a config that Zod validates.
 *    There is no expression language, so there is nothing to escape.
 * 2. **Every evaluation is recorded**, including the misses. A rule that
 *    quietly does nothing is otherwise indistinguishable from a broken one.
 * 3. **Firing is idempotent per occurrence.** Each trigger contributes a
 *    dedupe suffix, so re-evaluating the same condition on the same day cannot
 *    act twice — which matters because the dashboard evaluates on every load.
 */

export type EvaluationOutcome = {
  ruleId: string;
  ruleName: string;
  status: 'fired' | 'not_matched' | 'suppressed' | 'error';
  reason: string;
};

/** Parse a stored rule, or explain why it cannot be run. */
function resolve(rule: AutomationRule):
  | {
      ok: true;
      trigger: TriggerType;
      triggerConfig: unknown;
      action: ActionType;
      actionConfig: unknown;
    }
  | { ok: false; reason: string } {
  if (!isTriggerType(rule.triggerType)) {
    return { ok: false, reason: `Unknown trigger "${rule.triggerType}"` };
  }
  if (!isActionType(rule.actionType)) {
    return { ok: false, reason: `Unknown action "${rule.actionType}"` };
  }

  // Configs are re-validated on read, not trusted because they were valid on
  // write — the catalogue can change under stored rows.
  const triggerConfig = TRIGGERS[rule.triggerType].config.safeParse(rule.triggerConfig);
  if (!triggerConfig.success) {
    return { ok: false, reason: 'This rule’s condition settings are no longer valid' };
  }

  const actionConfig = ACTIONS[rule.actionType].config.safeParse(rule.actionConfig);
  if (!actionConfig.success) {
    return { ok: false, reason: 'This rule’s action settings are no longer valid' };
  }

  return {
    ok: true,
    trigger: rule.triggerType,
    triggerConfig: triggerConfig.data,
    action: rule.actionType,
    actionConfig: actionConfig.data,
  };
}

async function perform(
  userId: string,
  rule: AutomationRule,
  trigger: TriggerType,
  action: ActionType,
  config: unknown,
  snapshot: TodaySnapshot,
  dedupeSuffix: string,
): Promise<boolean> {
  const dedupeKey = `rule:${rule.id}:${dedupeSuffix}`;

  if (action === 'notify') {
    const { title, body } = config as { title: string; body?: string };
    return notify(userId, {
      // Derived from the trigger, not fixed, so a rule about overdue tasks is
      // still governed by the "Overdue tasks" switch in Settings.
      kind: TRIGGERS[trigger].notificationKind,
      title,
      body,
      href: '/rules',
      entityType: 'automation_rule',
      entityId: rule.id,
      dedupeKey,
    });
  }

  const { title, priority, schedule } = config as {
    title: string;
    priority: number;
    schedule: 'today' | 'tomorrow';
  };

  /**
   * Creating a task needs its own idempotency check: unlike a notification,
   * tasks have no unique constraint that would absorb a duplicate. The run log
   * is the source of truth for whether this occurrence already acted.
   */
  const alreadyActed = await repo.listRuns(userId, { ruleId: rule.id, limit: 20 });
  if (alreadyActed.some((run) => run.status === 'fired' && run.reason.includes(dedupeSuffix))) {
    return false;
  }

  const on =
    schedule === 'today'
      ? snapshot.today
      : addDays(parseISO(snapshot.today), 1).toISOString().slice(0, 10);

  await productivityRepo.insertTask(userId, {
    projectId: null,
    title,
    notes: `Created automatically by your rule “${rule.name}”.`,
    priority,
    dueAt: null,
    scheduledFor: on,
    estimateMinutes: null,
    rrule: null,
  });

  return true;
}

export async function evaluateAll(
  userId: string,
  snapshot: TodaySnapshot,
): Promise<EvaluationOutcome[]> {
  const rules = await repo.listEnabledRules(userId);
  const outcomes: EvaluationOutcome[] = [];

  for (const rule of rules) {
    const resolved = resolve(rule);

    if (!resolved.ok) {
      await repo.insertRun({
        userId,
        ruleId: rule.id,
        status: 'error',
        reason: resolved.reason,
        observed: null,
      });
      outcomes.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'error',
        reason: resolved.reason,
      });
      continue;
    }

    let observation;
    try {
      observation = TRIGGERS[resolved.trigger].evaluate(
        // Each trigger's own Zod schema produced this value.
        resolved.triggerConfig as never,
        snapshot,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not evaluate';
      await repo.insertRun({ userId, ruleId: rule.id, status: 'error', reason, observed: null });
      outcomes.push({ ruleId: rule.id, ruleName: rule.name, status: 'error', reason });
      continue;
    }

    if (!observation.matched) {
      await repo.insertRun({
        userId,
        ruleId: rule.id,
        status: 'not_matched',
        reason: observation.reason,
        observed: observation.observed,
      });
      outcomes.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'not_matched',
        reason: observation.reason,
      });
      continue;
    }

    const acted = await perform(
      userId,
      rule,
      resolved.trigger,
      resolved.action,
      resolved.actionConfig,
      snapshot,
      observation.dedupeSuffix,
    );

    /**
     * "Suppressed" is a first-class outcome, not a failure: the condition
     * matched but the action was deduplicated or turned off by a notification
     * preference. Recording it separately is what keeps the log honest.
     */
    const status = acted ? 'fired' : 'suppressed';
    const reason = acted
      ? `${observation.reason} [${observation.dedupeSuffix}]`
      : `${observation.reason} — already handled, or this notification type is switched off`;

    await repo.insertRun({
      userId,
      ruleId: rule.id,
      status,
      reason,
      observed: observation.observed,
    });

    if (acted) await repo.markRuleFired(userId, rule.id, new Date());

    outcomes.push({ ruleId: rule.id, ruleName: rule.name, status, reason });
  }

  return outcomes;
}

/* ------------------------------------------------------------ authoring --- */

export type RuleInput = {
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
};

export async function createRule(
  userId: string,
  input: RuleInput,
): Promise<Result<AutomationRule>> {
  if (!isTriggerType(input.triggerType)) {
    return invalid('triggerType', 'Choose a condition');
  }
  if (!isActionType(input.actionType)) {
    return invalid('actionType', 'Choose an action');
  }

  const trigger = TRIGGERS[input.triggerType].config.safeParse(input.triggerConfig);
  if (!trigger.success) {
    return invalid(
      'triggerConfig',
      trigger.error.issues[0]?.message ?? 'Check the condition settings',
    );
  }

  const action = ACTIONS[input.actionType].config.safeParse(input.actionConfig);
  if (!action.success) {
    return invalid('actionConfig', action.error.issues[0]?.message ?? 'Check the action settings');
  }

  try {
    return ok(
      await repo.insertRule(userId, {
        name: input.name,
        triggerType: input.triggerType,
        triggerConfig: trigger.data as Record<string, unknown>,
        actionType: input.actionType,
        actionConfig: action.data as Record<string, unknown>,
      }),
    );
  } catch {
    return invalid('name', 'You already have a rule with that name');
  }
}

export async function setEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<Result<null>> {
  return (await repo.setRuleEnabled(userId, id, enabled)) ? ok(null) : notFound();
}

export async function removeRule(userId: string, id: string): Promise<Result<null>> {
  return (await repo.deleteRule(userId, id)) ? ok(null) : notFound();
}

/**
 * Run one rule immediately, ignoring deduplication.
 *
 * "Test this rule" needs to show what the condition currently sees without
 * acting, so the user can check a rule before trusting it.
 */
export async function previewRule(
  userId: string,
  id: string,
  snapshot: TodaySnapshot,
): Promise<Result<{ matched: boolean; reason: string }>> {
  const rule = await repo.findRule(userId, id);
  if (!rule) return notFound();

  const resolved = resolve(rule);
  if (!resolved.ok) return conflict(resolved.reason, 'rule_invalid');

  const observation = TRIGGERS[resolved.trigger].evaluate(
    resolved.triggerConfig as never,
    snapshot,
  );

  return ok({ matched: observation.matched, reason: observation.reason });
}
