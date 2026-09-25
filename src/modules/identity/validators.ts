import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@nestedflow/domain/money';

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
  .min(1, 'Enter your email address')
  .max(320, 'That address is too long')
  .email('That does not look like an email address');

export const signUpSchema = z.object({
  email,
  password,
  displayName: z
    .string()
    .trim()
    .min(1, 'Tell us what to call you')
    .max(120, 'That name is too long'),

  /** Checked against the age policy server-side; see modules/identity/age.ts. */
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth as YYYY-MM-DD'),

  /**
   * Explicit, affirmative consent. A pre-ticked box is not consent, so this is
   * a literal `true` rather than a coerced boolean that an absent field could
   * satisfy.
   */
  acceptedTerms: z.literal(true, {
    message: 'Please accept the terms and privacy notice to continue',
  }),

  /** Opt-IN. Absent means no, which is the only safe reading of silence. */
  marketingOptIn: z.boolean().default(false),

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

export const requestPasswordResetSchema = z.object({ email });

export const completePasswordResetSchema = z.object({
  // base64url of 32 random bytes is 43 characters; anything else is not ours.
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This reset link is not valid'),
  // The full strength rule: a reset is a new password, unlike sign-in.
  password,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type CompletePasswordResetInput = z.infer<typeof completePasswordResetSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

/**
 * Finishing a Google sign-up.
 *
 * Deliberately has no email field: the address comes from the verified pending
 * registration on the server, so a crafted submission cannot register under an
 * address the provider never asserted.
 */
export const completeOAuthSignUpSchema = z.object({
  displayName: z.string().trim().min(1, 'Tell us what to call you').max(120),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth as YYYY-MM-DD'),
  acceptedTerms: z.literal(true, {
    message: 'Please accept the terms and privacy notice to continue',
  }),
  marketingOptIn: z.boolean().default(false),
});

export type CompleteOAuthSignUpInput = z.infer<typeof completeOAuthSignUpSchema>;
