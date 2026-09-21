import * as emailRepo from '@/modules/email/repository';
import { seedNotificationPreferences } from '@/modules/productivity/notifications';

/**
 * Seed a new account's email preferences.
 *
 * Lives here rather than in the email module so the identity service does not
 * import that module's service layer, which would close an import cycle
 * between the two.
 */
export async function seedEmailPreferences(userId: string, marketingOptIn: boolean): Promise<void> {
  await emailRepo.seedPreferences(userId);

  // In-app notifications default on: every one is raised from the user's own
  // records, in response to something they set up themselves.
  await seedNotificationPreferences(userId);

  // Marketing is only ever turned ON by an explicit opt-in; the default is off.
  if (marketingOptIn) {
    await emailRepo.setPreference(userId, 'marketing', true);
    await emailRepo.setPreference(userId, 'product_updates', true);
  }
}
