'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/current-user';
import { clearSessionCookie, readSessionCookie } from '@/lib/auth/cookies';
import { getRequestContext } from '@/lib/auth/request-context';
import { hashToken } from '@/lib/security/tokens';
import { verifyPassword } from '@/lib/security/password';
import * as repo from '@/modules/identity/repository';
import { canUnlink } from '@/modules/identity/linking';
import * as emailRepo from '@/modules/email/repository';
import { isEmailCategory, EMAIL_CATEGORIES } from '@/modules/email/categories';
import { CURRENT_DOCUMENT_VERSIONS } from '@/modules/identity/consent';

export type ActionState = { message?: string; tone?: 'error' | 'success' };

/* -------------------------------------------------------- email prefs --- */

export async function updateEmailPreference(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const category = String(formData.get('category') ?? '');
  const subscribed = formData.get('subscribed') === 'on';

  if (!isEmailCategory(category)) return { message: 'Unknown category', tone: 'error' };

  // Essential mail has no off switch while the account is open; enforced here
  // rather than only by omitting the control from the page.
  if (!EMAIL_CATEGORIES[category].optional) {
    return { message: 'Essential account email cannot be turned off', tone: 'error' };
  }

  await emailRepo.setPreference(user.id, category, subscribed);

  // Marketing consent is a record, not just a flag — revoke it when switched off.
  if (category === 'marketing') {
    if (subscribed) {
      await repo.insertConsent({
        userId: user.id,
        kind: 'marketing_email',
        documentVersion: CURRENT_DOCUMENT_VERSIONS.marketing_email,
        ...(await getRequestContext()),
      });
    } else {
      await repo.revokeConsent(user.id, 'marketing_email');
    }
  }

  revalidatePath('/settings/email');
  return { message: 'Saved', tone: 'success' };
}

/* ----------------------------------------------------------- sessions --- */

export async function revokeSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const sessionId = String(formData.get('sessionId') ?? '');

  // Scoped by userId in the repository: you can only revoke your own.
  const removed = await repo.deleteSessionForUser(user.id, sessionId);
  if (!removed) return { message: 'That session no longer exists', tone: 'error' };

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'session.revoked',
    entityType: 'session',
    entityId: sessionId,
    ...(await getRequestContext()),
  });

  revalidatePath('/settings/security');
  return { message: 'Session signed out', tone: 'success' };
}

export async function revokeOtherSessions(): Promise<ActionState> {
  const user = await requireUser();
  const token = await readSessionCookie();
  if (!token) redirect('/sign-in');

  const currentId = await repo.findSessionIdByTokenHash(hashToken(token));
  if (!currentId) redirect('/sign-in');

  const count = await repo.deleteOtherSessionsForUser(user.id, currentId);

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'session.revoked_others',
    metadata: { count },
    ...(await getRequestContext()),
  });

  revalidatePath('/settings/security');
  return { message: `Signed out of ${count} other session(s)`, tone: 'success' };
}

/* ------------------------------------------------------------ linking --- */

export async function unlinkProvider(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const accountId = String(formData.get('accountId') ?? '');

  // Refusing to remove the last way in is a server-side rule: hiding the
  // button would not stop the form being posted directly.
  if (!(await canUnlink(user, accountId))) {
    return {
      message: 'Set a password before removing your only way to sign in',
      tone: 'error',
    };
  }

  const removed = await repo.deleteOAuthAccount(user.id, accountId);
  if (!removed) return { message: 'That connection no longer exists', tone: 'error' };

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'oauth.unlinked',
    entityId: accountId,
    ...(await getRequestContext()),
  });

  revalidatePath('/settings/security');
  return { message: 'Disconnected', tone: 'success' };
}

/* ----------------------------------------------------------- deletion --- */

/**
 * Deleting an account is irreversible and removes real financial history, so
 * it requires the current password, not just a confirmation click.
 */
export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');

  if (confirmation !== 'DELETE') {
    return { message: 'Type DELETE to confirm', tone: 'error' };
  }

  const linked = await repo.listOAuthAccountsForUser(user.id);
  const hasPassword = user.passwordHash !== repo.NO_PASSWORD;

  if (hasPassword) {
    if (!(await verifyPassword(user.passwordHash, password))) {
      return { message: 'That password is not correct', tone: 'error' };
    }
  } else if (linked.length === 0) {
    return { message: 'Cannot verify this account', tone: 'error' };
  }

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'account.deleted',
    entityType: 'user',
    entityId: user.id,
    ...(await getRequestContext()),
  });

  // Every child table cascades from users.id, so this removes the data rather
  // than hiding it.
  await repo.hardDeleteUser(user.id);
  await clearSessionCookie();

  redirect('/?deleted=1');
}
