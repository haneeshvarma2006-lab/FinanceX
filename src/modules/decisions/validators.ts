import { z } from 'zod';

export const DECISION_AREAS = ['work', 'money', 'trading', 'life'] as const;
export type DecisionArea = (typeof DECISION_AREAS)[number];
export const DECISION_AREA_LABELS: Record<DecisionArea, string> = {
  work: 'Work',
  money: 'Money',
  trading: 'Trading',
  life: 'Life',
};

export const VERDICTS = ['right', 'mixed', 'wrong'] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABELS: Record<Verdict, string> = {
  right: 'Right call',
  mixed: 'Mixed',
  wrong: 'Wrong call',
};

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'That is not a real date');

/** Blank becomes null, so "not written" and "deleted" read the same in the database. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v ? v : null))
    .optional();

export const decisionSchema = z.object({
  title: z.string().trim().min(1, 'What did you decide?').max(200, 'Keep it to one line'),
  area: z.enum(DECISION_AREAS).default('life'),
  reasoning: optionalText(4000, 'Keep the reasoning under 4,000 characters'),
  expected: optionalText(2000, 'Keep the expectation under 2,000 characters'),
  confidence: z
    .union([z.coerce.number().int().min(1).max(5), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .optional(),
  reviewOn: z
    .union([isoDate, z.literal('')])
    .transform((v) => (v ? v : null))
    .optional(),
});

export type DecisionInput = z.infer<typeof decisionSchema>;

export const decisionReviewSchema = z.object({
  id: z.string().min(1).max(36),
  verdict: z.enum(VERDICTS, { message: 'Was it the right call?' }),
  outcome: optionalText(4000, 'Keep the outcome under 4,000 characters'),
});

export type DecisionReviewInput = z.infer<typeof decisionReviewSchema>;
