import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@kylix/domain/money';
import { SUPPORTED_FREQUENCIES } from '@kylix/domain/productivity';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'That is not a real date');

/**
 * An optional free-text field.
 *
 * `.optional()` comes LAST: applying it before `.transform()` leaves the key
 * required-but-possibly-undefined in the inferred type, which forces every
 * caller to pass an explicit `undefined`.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : undefined))
    .optional();

export const TASK_STATUSES = ['todo', 'doing', 'done', 'cancelled'] as const;
export const PRIORITY_LABELS = {
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
  4: 'Low',
} as const;

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Give the project a name').max(120),
  description: optionalText(500),
  color: optionalText(16),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'What needs doing?').max(240),
  notes: optionalText(4000),
  projectId: z.string().length(36).optional().or(z.literal('')),
  priority: z.coerce.number().int().min(1).max(4).default(3),

  /** datetime-local, or blank. */
  dueAt: z.string().trim().max(40).optional().or(z.literal('')),
  scheduledFor: isoDate.optional().or(z.literal('')),
  estimateMinutes: z.coerce.number().int().min(1).max(1440).optional(),

  repeat: z.enum(SUPPORTED_FREQUENCIES).optional().or(z.literal('')),
  repeatInterval: z.coerce.number().int().min(1).max(365).default(1),
});

export const habitSchema = z.object({
  name: z.string().trim().min(1, 'Name the habit').max(120),
  description: optionalText(500),
  cadence: z.enum(['daily', 'weekly']).default('daily'),
  targetPerPeriod: z.coerce.number().int().min(1).max(50).default(1),
  color: optionalText(16),
});

export const habitEntrySchema = z.object({
  habitId: z.string().length(36),
  onDate: isoDate,
  count: z.coerce.number().int().min(1).max(50).default(1),
  note: optionalText(500),
});

export const GOAL_KINDS = ['numeric', 'financial', 'habit', 'milestone'] as const;

export const goalSchema = z
  .object({
    title: z.string().trim().min(1, 'What are you aiming for?').max(200),
    description: optionalText(4000),
    kind: z.enum(GOAL_KINDS).default('numeric'),

    /** Kept as a string so a financial target keeps exact minor-unit precision. */
    targetValue: z.string().trim().min(1, 'Set a target').max(32),
    unit: optionalText(24),
    currency: z.enum(SUPPORTED_CURRENCIES).optional().or(z.literal('')),

    habitId: z.string().length(36).optional().or(z.literal('')),
    startsOn: isoDate.optional().or(z.literal('')),
    targetDate: isoDate.optional().or(z.literal('')),
  })
  .refine((v) => v.kind !== 'financial' || Boolean(v.currency), {
    message: 'Choose a currency for a money goal',
    path: ['currency'],
  })
  .refine((v) => v.kind !== 'habit' || Boolean(v.habitId), {
    message: 'Choose which habit this goal tracks',
    path: ['habitId'],
  })
  .refine((v) => !v.startsOn || !v.targetDate || v.startsOn <= v.targetDate, {
    message: 'The target date cannot be before the start date',
    path: ['targetDate'],
  });

export const checkpointSchema = z.object({
  goalId: z.string().length(36),
  value: z.string().trim().min(1, 'Enter a value').max(32),
  note: optionalText(500),
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type HabitInput = z.infer<typeof habitSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type CheckpointInput = z.infer<typeof checkpointSchema>;
