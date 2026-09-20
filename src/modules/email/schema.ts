/**
 * The email tables live in the identity module's schema file because they hang
 * off `users` and share its migration. Re-exported here so this module's own
 * code does not reach across into another module's internals.
 */
export {
  emailLog,
  emailPreferences,
  emailSuppressions,
  emailTokens,
  type EmailPreference,
} from '@/modules/identity/schema';
