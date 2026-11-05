import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import webpush from 'web-push';
import { getPool } from '@/lib/db/client';
import { resetEnvCache } from '@/lib/env';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import { notify } from '@/modules/productivity/notifications';
import * as productivityRepo from '@/modules/productivity/repository';
import * as push from '@/modules/push/service';
import * as pushRepo from '@/modules/push/repository';

/**
 * Push notifications against the real database, with the push service stood
 * in for: devices saved only at genuine push addresses, a phone moving
 * between accounts, every new notification pushed once to every device, and
 * devices the push service has forgotten dropped.
 */

const ctx = { ip: '203.0.113.99', userAgent: 'vitest' };
const KEY =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const sub = (id: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: KEY, auth: AUTH },
});

let sent: { endpoint: string; payload: Record<string, unknown> }[] = [];
let outcome: push.DeliveryOutcome = 'delivered';

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits');
}

async function makeUser(email: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Push Tester',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

describe('push notifications', () => {
  beforeAll(() => {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
    resetEnvCache();
  });
  afterAll(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    resetEnvCache();
  });
  beforeEach(async () => {
    await reset();
    sent = [];
    outcome = 'delivered';
    push.setPushTransport(async (target, payload) => {
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
      return outcome;
    });
  });
  afterEach(() => push.setPushTransport(undefined));

  it('saves a device only at a real push service, with complete keys', async () => {
    const user = await makeUser('device@example.com');
    expect(push.pushConfigured()).toBe(true);
    expect(
      (
        await push.subscribe(
          user.id,
          sub('phone'),
          'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile',
        )
      ).ok,
    ).toBe(true);

    for (const bad of [
      { ...sub('x'), endpoint: 'https://169.254.169.254/latest/meta-data/' },
      { ...sub('x'), endpoint: 'http://fcm.googleapis.com/fcm/send/x' },
      { ...sub('x'), keys: { p256dh: KEY } },
      { ...sub('x'), keys: { p256dh: 'not base64!', auth: AUTH } },
      { endpoint: 42 },
    ]) {
      expect((await push.subscribe(user.id, bad, null)).ok).toBe(false);
    }
    const devices = await push.devices(user.id);
    expect(devices.map((d) => [d.endpoint, d.label])).toEqual([
      ['https://fcm.googleapis.com/fcm/send/phone', 'Chrome on Android'],
    ]);
  });

  it('keeps one row per device, moves a phone to whoever signs in, and caps devices', async () => {
    const first = await makeUser('first@example.com');
    const second = await makeUser('second@example.com');
    await push.subscribe(first.id, sub('shared'), null);
    await push.subscribe(first.id, sub('shared'), null);
    expect(await pushRepo.countForUser(first.id)).toBe(1);

    await push.subscribe(second.id, sub('shared'), null);
    expect(await pushRepo.countForUser(first.id)).toBe(0);
    expect(await pushRepo.countForUser(second.id)).toBe(1);

    for (let i = 0; i < push.MAX_DEVICES - 1; i += 1)
      await push.subscribe(second.id, sub(`d${i}`), null);
    expect(await pushRepo.countForUser(second.id)).toBe(push.MAX_DEVICES);
    expect((await push.subscribe(second.id, sub('one-too-many'), null)).ok).toBe(false);
  });

  it('pushes each new notification once, to every device, as the person set it', async () => {
    const user = await makeUser('notify@example.com');
    await push.subscribe(user.id, sub('phone'), null);
    await push.subscribe(user.id, sub('laptop'), null);

    const raise = () =>
      notify(user.id, {
        kind: 'bill_due',
        title: 'Netflix: due in 3 days',
        body: '₹649.00',
        href: '/finance',
        entityType: 'subscription',
        entityId: 'netflix-1',
        dedupeKey: 'bill:netflix-1:2026-11-06',
      });
    expect(await raise()).toBe(true);
    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      'https://fcm.googleapis.com/fcm/send/laptop',
      'https://fcm.googleapis.com/fcm/send/phone',
    ]);
    expect(sent[0]!.payload).toEqual({
      title: 'Netflix: due in 3 days',
      body: '₹649.00',
      href: '/finance',
      tag: 'bill_due:netflix-1',
    });

    // The same reminder again is not a second buzz.
    expect(await raise()).toBe(false);
    expect(sent).toHaveLength(2);

    // A kind switched off is neither saved nor pushed.
    await productivityRepo.setNotificationPreference(user.id, 'price_alert', false);
    expect(
      await notify(user.id, {
        kind: 'price_alert',
        title: 'Bitcoin is above 70,000.00',
        dedupeKey: 'a1',
      }),
    ).toBe(false);
    expect(sent).toHaveLength(2);

    // Someone else's notification never reaches these devices.
    const other = await makeUser('other@example.com');
    await notify(other.id, { kind: 'bill_due', title: 'Rent', dedupeKey: 'r1' });
    expect(sent).toHaveLength(2);
  });

  it('forgets devices the push service has dropped, and ones that keep failing', async () => {
    const user = await makeUser('cleanup@example.com');
    await push.subscribe(user.id, sub('gone'), null);
    outcome = 'gone';
    expect(await push.pushToUser(user.id, { title: 'Hello' })).toBe(0);
    expect(await pushRepo.countForUser(user.id)).toBe(0);

    await push.subscribe(user.id, sub('flaky'), null);
    outcome = 'failed';
    for (let i = 0; i < 4; i += 1) await push.pushToUser(user.id, { title: 'Hello' });
    expect(await pushRepo.countForUser(user.id)).toBe(1);
    await push.pushToUser(user.id, { title: 'Hello' });
    expect(await pushRepo.countForUser(user.id)).toBe(0);

    // A delivery in between resets the count.
    await push.subscribe(user.id, sub('recovers'), null);
    for (let i = 0; i < 4; i += 1) await push.pushToUser(user.id, { title: 'Hello' });
    outcome = 'delivered';
    expect(await push.pushToUser(user.id, { title: 'Hello' })).toBe(1);
    const [device] = await push.devices(user.id);
    expect(device?.failures).toBe(0);
    expect(device?.lastSentAt).not.toBeNull();
  });

  it('only removes your own devices', async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('intruder@example.com');
    await push.subscribe(owner.id, sub('mine'), null);
    const [device] = await push.devices(owner.id);
    expect(await push.removeDevice(other.id, device!.id)).toBe(false);
    expect(await push.unsubscribe(other.id, device!.endpoint)).toBe(false);
    expect(await pushRepo.countForUser(owner.id)).toBe(1);
    expect(await push.removeDevice(owner.id, device!.id)).toBe(true);
  });

  it('builds a real encrypted, signed request for a real device key', () => {
    // A device's key pair, as a browser makes one.
    const device = createECDH('prime256v1');
    device.generateKeys();
    const vapid = webpush.generateVAPIDKeys();
    const details = webpush.generateRequestDetails(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/real-shape',
        keys: {
          p256dh: device.getPublicKey().toString('base64url'),
          auth: randomBytes(16).toString('base64url'),
        },
      },
      JSON.stringify({ title: 'Netflix: due in 3 days' }),
      push.sendOptions(
        { title: 'Netflix: due in 3 days', urgency: 'high' },
        { ...vapid, subject: 'mailto:ops@example.com' },
      ),
    );
    expect(details.method).toBe('POST');
    expect(details.endpoint).toBe('https://fcm.googleapis.com/fcm/send/real-shape');
    expect(details.headers).toMatchObject({
      TTL: 86400,
      Urgency: 'high',
      'Content-Encoding': 'aes128gcm',
    });
    expect(String(details.headers.Authorization)).toMatch(/^vapid t=.+, k=.+$/);
    // The message is encrypted: its words are not in the body.
    expect(Buffer.from(details.body as Buffer).toString('latin1')).not.toContain('Netflix');
  });

  it('sends nothing, and saves nothing, when push is not set up', async () => {
    push.setPushTransport(undefined);
    delete process.env.VAPID_PRIVATE_KEY;
    resetEnvCache();
    try {
      const user = await makeUser('unset@example.com');
      expect(push.pushConfigured()).toBe(false);
      expect(push.publicKey()).toBeNull();
      expect((await push.subscribe(user.id, sub('phone'), null)).ok).toBe(false);
      expect(await push.pushToUser(user.id, { title: 'Hello' })).toBe(0);
    } finally {
      process.env.VAPID_PRIVATE_KEY = webpush.generateVAPIDKeys().privateKey;
      resetEnvCache();
    }
  });
});
