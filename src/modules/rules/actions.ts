import { z } from 'zod';
import type { NotificationKind } from '@/modules/productivity/notifications';

/**
 * Action catalogue.
 *
 * Like triggers, actions are named types with validated config. An action
 * never receives a free-form template from the user — titles come from the
 * config as plain text and are length-bounded, so nothing here can be turned
 * into an injection vector for the notification body or a link target.
 */

const notifyConfig = z.object({
  title: z.string().trim().min(1, 'Give the alert a title').max(120),
  body: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v ? v : undefined))
    .optional(),
});

const createTaskConfig = z.object({
  title: z.string().trim().min(1, 'What task should this create?').max(240),
  priority: z.coerce.number().int().min(1).max(4).default(2),
  /** Relative, so a rule does not go stale the day after it is written. */
  schedule: z.enum(['today', 'tomorrow']).default('today'),
});

export const ACTIONS = {
  notify: {
    label: 'Send me an in-app notification',
    config: notifyConfig,
    /** Which notification kind it raises, so per-kind preferences still gate it. */
    notificationKind: 'rule_fired' satisfies NotificationKind,
  },
  create_task: {
    label: 'Create a task',
    config: createTaskConfig,
    notificationKind: 'rule_fired' satisfies NotificationKind,
  },
} as const;

export type ActionType = keyof typeof ACTIONS;
export const ACTION_TYPES = Object.keys(ACTIONS) as ActionType[];

export function isActionType(value: string): value is ActionType {
  return value in ACTIONS;
}

export type NotifyConfig = z.infer<typeof notifyConfig>;
export type CreateTaskConfig = z.infer<typeof createTaskConfig>;
