import { differenceInYears, isValid, parseISO } from 'date-fns';
import { brand } from '@/lib/brand';

/**
 * Age gating policy.
 *
 * READ docs/AGE-POLICY.md BEFORE CHANGING ANY NUMBER HERE. The thresholds
 * below are a product policy informed by the rules of the intended markets;
 * they are NOT a claim of legal compliance, and a self-declared date of birth
 * is NOT legal age verification in any jurisdiction that requires verified
 * identity. Where a market demands verified age assurance, that needs a named
 * provider and a separate design — see the policy document.
 */

/**
 * Minimum age to hold an account at all.
 *
 * 18 is chosen because Nested Flow handles personal financial records and a trading
 * journal, and because India's DPDP Act treats everyone under 18 as a child
 * requiring verifiable parental consent — machinery this product does not have.
 * Rather than build a half-working consent flow, under-18s are not onboarded.
 */
export const MINIMUM_AGE_YEARS = 18;

/**
 * The oldest plausible date of birth. Anything earlier is a typo or a probe,
 * not a user, and accepting it would let a caller store arbitrary dates.
 */
export const MAXIMUM_AGE_YEARS = 120;

export type AgeCheck =
  | { eligible: true; age: number }
  | { eligible: false; reason: 'underage' | 'implausible' | 'invalid' | 'future'; age?: number };

/**
 * Evaluate a self-declared date of birth against the policy.
 *
 * `now` is injectable so the boundary cases — the day before an 18th birthday
 * and the day itself — are testable rather than dependent on the wall clock.
 */
export function checkAge(dateOfBirth: string, now: Date = new Date()): AgeCheck {
  const dob = parseISO(dateOfBirth);

  if (!isValid(dob)) return { eligible: false, reason: 'invalid' };
  if (dob.getTime() > now.getTime()) return { eligible: false, reason: 'future' };

  const age = differenceInYears(now, dob);

  if (age > MAXIMUM_AGE_YEARS) return { eligible: false, reason: 'implausible', age };
  if (age < MINIMUM_AGE_YEARS) return { eligible: false, reason: 'underage', age };

  return { eligible: true, age };
}

/**
 * User-facing copy. Deliberately does not state the person's computed age back
 * to them, which would tell a probing caller exactly how far off the threshold
 * a guessed date is.
 */
export function ageRejectionMessage(
  reason: Exclude<AgeCheck, { eligible: true }>['reason'],
): string {
  switch (reason) {
    case 'underage':
      return `You need to be ${MINIMUM_AGE_YEARS} or over to use ${brand.name}.`;
    case 'future':
      return 'That date is in the future.';
    case 'implausible':
      return 'Please check that date of birth.';
    case 'invalid':
      return 'Enter a valid date of birth.';
  }
}
