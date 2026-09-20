import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@/lib/money';

/**
 * A length floor rather than a character-class maze. Composition rules push
 * people toward "Passw0rd!" while a long passphrase they can actually remember
 * is stronger; NIST 800-63B says the same.
 */
const password = z
  .string()
  .min(12, 'Use at least 12 characters — a memorable phrase works well')
  .max(256, 'That is longer than 256 characters');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(320)
  .email('That does not look like an email address');

export const signUpSchema = z.object({
  email,
  password,
  displayName: z
    .string()
    .trim()
    .min(1, 'Tell us what to call you')
    .max(120, 'That name is too long'),
  timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
  baseCurrency: z.enum(SUPPORTED_CURRENCIES).default('INR'),
});

export const signInSchema = z.object({
  email,
  // Deliberately not the strong `password` schema: an existing account must be
  // able to sign in even if the rules tighten later, and validating length here
  // would leak which inputs are plausible passwords.
  password: z.string().min(1, 'Enter your password').max(256),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
