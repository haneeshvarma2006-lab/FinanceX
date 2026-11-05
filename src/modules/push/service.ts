import webpush from 'web-push';
import { getEnv } from '@/lib/env';
import { invalid, ok, type Result } from '@/lib/result';
import { deviceLabel, isAllowedPushEndpoint } from './endpoint';
import * as repo from './repository';
import type { PushSubscriptionRow } from './schema';

/**
 * Web Push: a notification on the person's phone or computer, even with the
 * app closed.
 *
 * Every push mirrors an in-app notification that has just been created, so
 * the same preferences decide both, and nothing is pushed that the person
 * could not also see on the Notifications page. Sending never fails the
 * work that raised it: a slow or broken push service costs a log line, not
 * a lost reminder.
 */

export const MAX_DEVICES = 10;
/** A device whose deliveries keep failing is dropped after this many in a row. */
const MAX_FAILURES = 5;

export type PushMessage = {
  title: string;
  body?: string | null;
  /** A path on this site to open when the notification is tapped. */
  href?: string | null;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string | null;
  urgency?: 'normal' | 'high';
};

export type Keys = { publicKey: string; privateKey: string; subject: string };

function keys(): Keys | null {
  const env = getEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

/** Whether this server can send pushes at all. */
export function pushConfigured(): boolean {
  return keys() !== null;
}

/** The key browsers subscribe with; public by design. Null when push is off. */
export function publicKey(): string | null {
  return keys()?.publicKey ?? null;
}

/* ----------------------------------------------------------- transport --- */

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type DeliveryOutcome = 'delivered' | 'gone' | 'failed';
export type PushTransport = (
  target: PushTarget,
  payload: string,
  message: PushMessage,
) => Promise<DeliveryOutcome>;

/** How each push is sent: signed with the server's keys, kept a day, given up after 5 s. */
export function sendOptions(message: PushMessage, vapid: Keys): webpush.RequestOptions {
  return {
    vapidDetails: vapid,
    // Kept a day for a phone that is off; a reminder older than that is stale.
    TTL: 60 * 60 * 24,
    urgency: message.urgency ?? 'normal',
    timeout: 5000,
  };
}

const webPushTransport: PushTransport = async (target, payload, message) => {
  const k = keys();
  if (!k) return 'failed';
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      sendOptions(message, k),
    );
    return 'delivered';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404 and 410: the browser unsubscribed or the subscription expired.
    return status === 404 || status === 410 ? 'gone' : 'failed';
  }
};

/** For tests: each push goes to the log and counts as delivered. */
const logTransport: PushTransport = async (target, payload) => {
  console.warn(`[push:log] to=${new URL(target.endpoint).host} payload=${payload}`);
  return 'delivered';
};

let transport: PushTransport | undefined;

/** Swappable so tests can see what would be sent without a push service. */
export function setPushTransport(next: PushTransport | undefined): void {
  transport = next;
}

/* -------------------------------------------------------------- devices --- */

export type SubscriptionInput = {
  endpoint: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
};

const KEY = /^[A-Za-z0-9_-]+={0,2}$/;

/** Save this device for push, after checking it is a real push service's address. */
export async function subscribe(
  userId: string,
  input: SubscriptionInput,
  userAgent: string | null,
): Promise<Result<null>> {
  if (!pushConfigured()) return invalid('push', 'Notifications are not set up on this server yet');
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint : '';
  const p256dh = typeof input.keys?.p256dh === 'string' ? input.keys.p256dh : '';
  const auth = typeof input.keys?.auth === 'string' ? input.keys.auth : '';
  if (!isAllowedPushEndpoint(endpoint)) {
    return invalid('push', 'This browser’s push service is not one we can send to');
  }
  if (!KEY.test(p256dh) || p256dh.length > 200 || !KEY.test(auth) || auth.length > 100) {
    return invalid('push', 'That subscription is not complete');
  }

  const mine = await repo.listForUser(userId);
  if (!mine.some((d) => d.endpoint === endpoint) && mine.length >= MAX_DEVICES) {
    return invalid('push', `Notifications can be on for at most ${MAX_DEVICES} devices`);
  }
  await repo.upsert({ userId, endpoint, p256dh, auth, label: deviceLabel(userAgent) });
  return ok(null);
}

export async function unsubscribe(userId: string, endpoint: string): Promise<boolean> {
  return repo.removeEndpoint(userId, endpoint);
}

export async function removeDevice(userId: string, id: string): Promise<boolean> {
  return repo.removeById(userId, id);
}

export async function devices(userId: string): Promise<PushSubscriptionRow[]> {
  return repo.listForUser(userId);
}

/* -------------------------------------------------------------- sending --- */

/**
 * Push a message to every device the person has turned notifications on
 * for. Returns how many received it. Devices the push service says are
 * gone are forgotten; ones that keep failing are dropped.
 */
export async function pushToUser(userId: string, message: PushMessage): Promise<number> {
  if (!transport && !pushConfigured()) return 0;
  const send = transport ?? (getEnv().PUSH_TRANSPORT === 'log' ? logTransport : webPushTransport);
  const targets = await repo.listForUser(userId);
  if (targets.length === 0) return 0;

  const payload = JSON.stringify({
    title: message.title.slice(0, 120),
    body: message.body?.slice(0, 300) ?? undefined,
    href: message.href ?? '/notifications',
    tag: message.tag?.slice(0, 64) ?? undefined,
  });

  const outcomes = await Promise.all(
    targets.map(async (t) => {
      const outcome = await send(t, payload, message).catch((): DeliveryOutcome => 'failed');
      if (outcome === 'delivered') await repo.markDelivered(t.id);
      else if (outcome === 'gone') await repo.removeDead(t.id);
      else if ((await repo.markFailed(t.id)) >= MAX_FAILURES) await repo.removeDead(t.id);
      return outcome;
    }),
  );
  return outcomes.filter((o) => o === 'delivered').length;
}
