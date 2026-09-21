import * as repo from './repository';

/**
 * Starter rules, seeded at sign-up.
 *
 * These replace what used to be five hardcoded conditions in the dashboard.
 * Making them rows rather than code means the user can see exactly what is
 * watching their data, change the thresholds, switch any of them off, or
 * delete them — none of which was possible when they were `if` statements.
 *
 * This is configuration, not fabricated history: no balance, streak or trade
 * is invented, and every rule below acts only on records the user creates.
 */
export const STARTER_RULES = [
  {
    name: 'Overdue work',
    triggerType: 'tasks_overdue',
    triggerConfig: { count: 1 },
    actionType: 'notify',
    actionConfig: {
      title: 'You have overdue tasks',
      body: 'Past their due time and still open.',
    },
  },
  {
    name: 'Protect a streak',
    triggerType: 'habit_streak_at_risk',
    triggerConfig: { count: 3 },
    actionType: 'notify',
    actionConfig: {
      title: 'A habit streak is at risk',
      body: 'Not logged yet today.',
    },
  },
  {
    name: 'Goal falling behind',
    triggerType: 'goal_behind_pace',
    triggerConfig: {},
    actionType: 'notify',
    actionConfig: {
      title: 'A goal is behind pace',
      body: 'Less progress than time elapsed.',
    },
  },
  {
    name: 'Budget exceeded',
    triggerType: 'budget_exceeded',
    triggerConfig: {},
    actionType: 'notify',
    actionConfig: {
      title: 'A budget has been exceeded',
      body: 'Spending in a category has passed the limit you set.',
    },
  },
  {
    /**
     * The product thesis as a single row: a run of losses books a review
     * rather than leaving the next trade to be taken on tilt.
     */
    name: 'Review after losing trades',
    triggerType: 'consecutive_losing_trades',
    triggerConfig: { count: 3 },
    actionType: 'create_task',
    actionConfig: {
      title: 'Review the last three losing trades',
      priority: 2,
      schedule: 'today',
    },
  },
] as const;

export async function seedStarterRules(userId: string): Promise<void> {
  for (const rule of STARTER_RULES) {
    try {
      await repo.insertRule(userId, {
        name: rule.name,
        triggerType: rule.triggerType,
        triggerConfig: { ...rule.triggerConfig },
        actionType: rule.actionType,
        actionConfig: { ...rule.actionConfig },
      });
    } catch {
      // The unique index on (userId, name) makes re-seeding a no-op rather
      // than an error, so a retried sign-up cannot duplicate rules.
    }
  }
}
