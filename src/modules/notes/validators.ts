import { z } from 'zod';

export const NOTE_MOODS = ['great', 'good', 'okay', 'low', 'rough'] as const;
export type NoteMood = (typeof NOTE_MOODS)[number];

export const NOTE_MOOD_LABELS: Record<NoteMood, string> = {
  great: 'Great',
  good: 'Good',
  okay: 'Okay',
  low: 'Low',
  rough: 'Rough',
};

export const NOTE_BODY_MAX = 20_000;

/** The fields a user writes. An empty title or mood is stored as null. */
export const noteSchema = z.object({
  title: z
    .string()
    .trim()
    .max(160, 'Keep the title under 160 characters')
    .transform((v) => (v ? v : null))
    .optional(),
  body: z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(NOTE_BODY_MAX, `Keep one entry under ${NOTE_BODY_MAX.toLocaleString('en')} characters`),
  mood: z
    .union([z.enum(NOTE_MOODS), z.literal('')])
    .transform((v) => (v ? v : null))
    .optional(),
});

export type NoteInput = z.infer<typeof noteSchema>;

export const noteUpdateSchema = noteSchema.extend({ id: z.string().min(1).max(36) });
