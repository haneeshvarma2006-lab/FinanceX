'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import type { FormState } from '@/lib/result';
import { consume, RULES } from '@/lib/security/rate-limit';
import * as push from '@/modules/push/service';

export type PushResult = { ok: true } | { ok: false; message: string };

/** Save this device's push subscription, as the browser gave it. */
export async function subscribePushAction(subscription: {
  endpoint: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
}): Promise<PushResult> {
  const user = await requireUser();
  const gate = await consume(`push:subscribe:${user.id}`, RULES.pushSubscribePerHour);
  if (!gate.allowed) return { ok: false, message: 'Too many tries. Wait a little and try again.' };

  const result = await push.subscribe(
    user.id,
    { endpoint: subscription?.endpoint, keys: subscription?.keys ?? null },
    (await headers()).get('user-agent'),
  );
  revalidatePath('/settings/notifications');
  return result.ok ? { ok: true } : { ok: false, message: result.error.message };
}

/** Forget this device: called after the browser has unsubscribed. */
export async function unsubscribePushAction(endpoint: string): Promise<PushResult> {
  const user = await requireUser();
  if (typeof endpoint === 'string' && endpoint.length <= 1000) {
    await push.unsubscribe(user.id, endpoint);
  }
  revalidatePath('/settings/notifications');
  return { ok: true };
}

/** Remove another of the person's devices from the list. */
export async function removeDeviceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const removed = id.length === 36 && (await push.removeDevice(user.id, id));
  revalidatePath('/settings/notifications');
  return removed
    ? { message: 'Removed', tone: 'success' }
    : { message: 'That device is already gone', tone: 'error' };
}

/** A test notification to every device with push on. */
export async function testPushAction(): Promise<PushResult> {
  const user = await requireUser();
  const gate = await consume(`push:test:${user.id}`, RULES.pushTestPerTenMinutes);
  if (!gate.allowed)
    return { ok: false, message: 'That is plenty of tests for now. Try again soon.' };

  const delivered = await push.pushToUser(user.id, {
    title: 'Notifications are on',
    body: 'Bill reminders and price alerts will reach this device, even with the app closed.',
    href: '/notifications',
    tag: 'test',
  });
  revalidatePath('/settings/notifications');
  return delivered > 0
    ? { ok: true }
    : {
        ok: false,
        message: 'No device received it. Turn notifications off and on again on this device.',
      };
}

/**
 * The browser renewed this device's subscription. The new one replaces the
 * old only if the old is still saved, so a device removed from another
 * phone's settings does not come back by itself.
 */
export async function resyncPushAction(
  previousEndpoint: string,
  subscription: { endpoint: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null },
): Promise<PushResult> {
  const user = await requireUser();
  if (typeof previousEndpoint !== 'string' || previousEndpoint.length > 1000) {
    return { ok: false, message: 'Unknown device' };
  }
  const known = (await push.devices(user.id)).some((d) => d.endpoint === previousEndpoint);
  if (!known) return { ok: false, message: 'This device was removed' };
  const result = await push.subscribe(
    user.id,
    { endpoint: subscription?.endpoint, keys: subscription?.keys ?? null },
    (await headers()).get('user-agent'),
  );
  if (!result.ok) return { ok: false, message: result.error.message };
  if (subscription.endpoint !== previousEndpoint) await push.unsubscribe(user.id, previousEndpoint);
  return { ok: true };
}
