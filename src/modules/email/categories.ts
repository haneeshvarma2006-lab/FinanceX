/**
 * Email categories.
 *
 * The split that matters legally and operationally is transactional versus
 * marketing. Transactional mail is sent because the user asked for something
 * or because their account security depends on it; marketing mail needs a
 * lawful basis and an unsubscribe path. Conflating them is how products end up
 * sending promotions under the cover of a receipt.
 */

export const EMAIL_CATEGORIES = {
  essential: {
    label: 'Essential account email',
    description:
      'Sign-in verification, password and email changes, and notices about your account. Required — these cannot be turned off while your account is open.',
    transactional: true,
    /** Essential mail ignores preference state; it is not marketing. */
    optional: false,
  },
  security: {
    label: 'Security alerts',
    description:
      'New sign-ins, session revocations, and changes to how you sign in. Strongly recommended.',
    transactional: true,
    optional: true,
  },
  product_updates: {
    label: 'Product updates',
    description: 'Occasional notes about new features and meaningful changes.',
    transactional: false,
    optional: true,
  },
  marketing: {
    label: 'Tips and offers',
    description: 'Onboarding tips, guides, and occasional offers.',
    transactional: false,
    optional: true,
  },
} as const;

export type EmailCategory = keyof typeof EMAIL_CATEGORIES;

export const EMAIL_CATEGORY_KEYS = Object.keys(EMAIL_CATEGORIES) as EmailCategory[];

export function isEmailCategory(value: string): value is EmailCategory {
  return value in EMAIL_CATEGORIES;
}

/** Categories a user may switch off. Essential is deliberately absent. */
export const OPTIONAL_CATEGORIES = EMAIL_CATEGORY_KEYS.filter(
  (key) => EMAIL_CATEGORIES[key].optional,
);

export function isMarketing(category: EmailCategory): boolean {
  return !EMAIL_CATEGORIES[category].transactional;
}

/**
 * Defaults at sign-up.
 *
 * Marketing defaults to OFF. Opt-out marketing is unlawful in several of the
 * markets this product is aimed at, and defaulting it on would mean relying on
 * a consent the user never actually gave.
 */
export function defaultSubscribed(category: EmailCategory): boolean {
  return !isMarketing(category);
}
