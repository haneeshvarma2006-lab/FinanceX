'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import type { FormState } from '@/lib/result';
import * as repo from '@/modules/productivity/repository';
import { isNotificationKind } from '@/modules/productivity/notifications';

export type { FormState };

export async function markReadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  // Scoped by userId in the repository: only your own can be marked.
  await repo.markNotificationRead(user.id, String(formData.get('id') ?? ''));

  revalidatePath('/notifications');
  revalidatePath('/today');
  return { message: 'Marked read', tone: 'success' };
}

export async function markAllReadAction(): Promise<FormState> {
  const user = await requireUser();
  const count = await repo.markAllNotificationsRead(user.id);

  revalidatePath('/notifications');
  revalidatePath('/today');
  return { message: `${count} marked read`, tone: 'success' };
}

export async function setNotificationPreferenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const kind = String(formData.get('kind') ?? '');
  if (!isNotificationKind(kind)) return { message: 'Unknown notification type', tone: 'error' };

  await repo.setNotificationPreference(user.id, kind, formData.get('enabled') === 'on');

  revalidatePath('/settings/notifications');
  return { message: 'Saved', tone: 'success' };
}
