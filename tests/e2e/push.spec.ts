import { expect, test, type Page } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * The installable app and push notifications, in a real browser: the
 * service worker starts, the manifest and icons are what an Android phone
 * needs to install the app, the offline page stands in when there is no
 * connection, and notifications are turned on, tested and off again.
 *
 * Headless Chromium cannot reach a real push service, so the browser's
 * PushManager is stood in for with a subscription at a push-service address;
 * the server's side (saving it, sending to it through the test transport,
 * removing it) is real.
 */

test.beforeEach(resetRateLimits);

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Push Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 15_000 });
}

const FAKE_PUSH = () => {
  // Kept for the browser session, as a real subscription outlives the page.
  const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-device-1';
  const keys = {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  };
  const make = (applicationServerKey: unknown) =>
    ({
      endpoint,
      options: { applicationServerKey },
      toJSON: () => ({ endpoint, keys }),
      unsubscribe: async () => {
        sessionStorage.removeItem('nf-fake-sub');
        return true;
      },
    }) as unknown as PushSubscription;
  PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
    sessionStorage.setItem('nf-fake-sub', '1');
    return make(options?.applicationServerKey ?? null);
  };
  PushManager.prototype.getSubscription = async function () {
    return sessionStorage.getItem('nf-fake-sub') ? make(null) : null;
  };
};

test('the app installs like an app: manifest, icons, service worker, offline page', async ({
  page,
  request,
}) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  const pngs = manifest.icons.filter((i: { type: string }) => i.type === 'image/png');
  expect(pngs.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual([
    '/finance?new=transaction',
    '/finance/import',
    '/finance/insights',
  ]);
  for (const icon of [
    ...pngs.map((i: { src: string }) => i.src),
    '/icons/apple-touch-icon.png',
    '/icons/badge-96.png',
  ]) {
    const response = await request.get(icon);
    expect(response.status(), icon).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['service-worker-allowed']).toBe('/');
  expect(sw.headers()['cache-control']).toContain('no-cache');

  await register(page, 'installable');
  // The service worker starts and takes control of the app.
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope).toMatch(/\/$/);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  // No connection: the offline page, not the browser's error.
  await page.context().setOffline(true);
  await page.goto('/finance').catch(() => undefined);
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
  await page.context().setOffline(false);
});

test('notifications are turned on for a device, tested, and turned off', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications']);
  await page.addInitScript(FAKE_PUSH);
  await register(page, 'push');

  // With a bill to be reminded of, Today suggests lock-screen reminders.
  await page.goto('/finance?new=bill');
  await page.getByLabel('What is it?').fill('Netflix');
  await page.getByLabel('Amount').fill('649');
  await page.getByRole('button', { name: 'Add recurring bill' }).click();
  await expect(page.getByText('Recurring bill added')).toBeVisible();
  await page.goto('/today');
  const nudge = page.getByRole('region', { name: 'Get reminders on your lock screen' });
  await expect(nudge).toBeVisible();
  await nudge.getByRole('link', { name: 'Set up' }).click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);

  const device = page.getByRole('region', { name: 'Notifications on this device' });
  await expect(device).toContainText('Off. Turn on to get bill reminders');
  await device.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByText('Notifications are on for this device')).toBeVisible();
  await expect(device).toContainText('On. Bill reminders, price alerts');
  await expect(page.getByText('Devices with notifications on')).toBeVisible();
  // Named from the browser's own description of itself.
  await expect(page.getByText(/^Chrome on (Windows|Linux|Mac)$/)).toBeVisible();

  await device.getByRole('button', { name: 'Send a test' }).click();
  await expect(page.getByText('Sent. It should appear in a few seconds.')).toBeVisible();

  // With a device on, Today stops suggesting it.
  await page.goto('/today');
  await expect(
    page.getByRole('heading', { name: 'Get reminders on your lock screen' }),
  ).toHaveCount(0);

  await page.goto('/settings/notifications');
  await expect(device).toContainText('On.');
  await device.getByRole('button', { name: 'Turn off on this device' }).click();
  await expect(device).toContainText('Off.');
  await expect(page.getByText('Devices with notifications on')).toHaveCount(0);
});

test('Not now hides the suggestion for good', async ({ page }) => {
  await register(page, 'nudge');
  await page.goto('/finance?new=bill');
  await page.getByLabel('What is it?').fill('Rent');
  await page.getByLabel('Amount').fill('15000');
  await page.getByRole('button', { name: 'Add recurring bill' }).click();
  await expect(page.getByText('Recurring bill added')).toBeVisible();

  await page.goto('/today');
  const nudge = page.getByRole('region', { name: 'Get reminders on your lock screen' });
  await nudge.getByRole('button', { name: 'Not now' }).click();
  await expect(nudge).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Get reminders on your lock screen' }),
  ).toHaveCount(0);
});
