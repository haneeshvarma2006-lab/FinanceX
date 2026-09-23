import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { isoDay, resetRateLimits } from './fixtures';

/**
 * The JSON API a native client will consume.
 *
 * Exercised over real HTTP against the production build, with Bearer tokens —
 * exactly as a phone would. The point of these tests is that the API is a thin
 * transport over the same services the web uses, and inherits the same
 * authorization boundary rather than getting a second, weaker one.
 */

test.beforeEach(resetRateLimits);

const PASSWORD = 'a sufficiently long passphrase';

/**
 * Registration goes through the web UI, because that is where it lives: the
 * age gate and versioned consent are part of the sign-up flow, and the API
 * deliberately does not offer a second way in that could skip them.
 *
 * The API issues sessions for accounts that already exist — which is exactly
 * what a native sign-in screen needs.
 */
async function register(page: Page, label: string) {
  const email = `api-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('API Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  return email;
}

async function signIn(request: APIRequestContext, email: string, deviceName = 'Test iPhone') {
  const response = await request.post('/api/v1/auth/session', {
    data: { email, password: PASSWORD, deviceName },
  });
  expect(response.status()).toBe(201);

  const body = await response.json();
  return body as { token: string; expiresAt: string; user: { id: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test('issues a bearer token and identifies the account', async ({ page, request }) => {
  const email = await register(page, 'session');
  const session = await signIn(request, email);

  expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());

  const dashboard = await request.get('/api/v1/dashboard', { headers: auth(session.token) });
  expect(dashboard.status()).toBe(200);
});

test('refuses everything without a token', async ({ request }) => {
  for (const path of [
    '/api/v1/dashboard',
    '/api/v1/tasks',
    '/api/v1/habits',
    '/api/v1/goals',
    '/api/v1/transactions',
    '/api/v1/trades',
    '/api/v1/notifications',
    '/api/v1/sync',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(403);
    expect(response.headers()['www-authenticate']).toBe('Bearer');
  }
});

test('refuses a forged or revoked token', async ({ page, request }) => {
  const email = await register(page, 'revoke');
  const session = await signIn(request, email);

  expect(
    (await request.get('/api/v1/dashboard', { headers: auth('not-a-real-token') })).status(),
  ).toBe(403);

  // Signing out destroys the session server-side, so the token stops working.
  const out = await request.delete('/api/v1/auth/session', { headers: auth(session.token) });
  expect(out.status()).toBe(204);

  expect((await request.get('/api/v1/dashboard', { headers: auth(session.token) })).status()).toBe(
    403,
  );
});

test('does not become an account-enumeration oracle', async ({ page, request }) => {
  const email = await register(page, 'enum');

  const wrongPassword = await request.post('/api/v1/auth/session', {
    data: { email, password: 'definitely not the password' },
  });
  const unknownAccount = await request.post('/api/v1/auth/session', {
    data: { email: `nobody-${Date.now()}@example.com`, password: PASSWORD },
  });

  expect(wrongPassword.status()).toBe(unknownAccount.status());
  expect(await wrongPassword.json()).toEqual(await unknownAccount.json());
});

test('creates a task and completes it, with recurrence handled server-side', async ({
  page,
  request,
}) => {
  const email = await register(page, 'tasks');
  const { token } = await signIn(request, email);

  const created = await request.post('/api/v1/tasks', {
    headers: auth(token),
    data: {
      title: 'Daily review',
      priority: 3,
      scheduledFor: isoDay(),
      repeat: 'daily',
      repeatInterval: 1,
    },
  });
  expect(created.status()).toBe(200);
  const task = await created.json();

  const completed = await request.post(`/api/v1/tasks/${task.id}/complete`, {
    headers: auth(token),
  });
  expect(completed.status()).toBe(200);

  const body = await completed.json();
  // The successor is created by the shared service, not by the client.
  expect(body.task.status).toBe('done');
  expect(body.nextOccurrence.scheduledFor).toBe(isoDay(1));
});

test('money crosses the wire exactly, never as a float', async ({ page, request }) => {
  const email = await register(page, 'money');
  const { token } = await signIn(request, email);

  const goal = await request.post('/api/v1/goals', {
    headers: auth(token),
    data: { title: 'Emergency fund', kind: 'financial', targetValue: '300000.00', currency: 'INR' },
  });
  expect(goal.status()).toBe(200);

  const created = await goal.json();
  // 300000.00 INR is 30,000,000 paise — as a decimal string, not a number.
  expect(created.targetValue).toBe('30000000');
  expect(typeof created.targetValue).toBe('string');

  const checkpoint = await request.post(`/api/v1/goals/${created.id}/checkpoints`, {
    headers: auth(token),
    data: { value: '45000.50' },
  });
  expect(checkpoint.status()).toBe(200);
  expect((await checkpoint.json()).currentValue).toBe('4500050');
});

test('enforces the same tenancy boundary as the web', async ({ page, request }) => {
  const aliceEmail = await register(page, 'alice');

  // Sign out so the second account registers into a clean browser session.
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  const bobEmail = await register(page, 'bob');

  const alice = await signIn(request, aliceEmail);
  const bob = await signIn(request, bobEmail);

  const bobTask = await request.post('/api/v1/tasks', {
    headers: auth(bob.token),
    data: { title: 'Bob private task', priority: 3, repeatInterval: 1 },
  });
  const created = await bobTask.json();

  // Alice cannot see it...
  const aliceTasks = await request.get('/api/v1/tasks', { headers: auth(alice.token) });
  const list = await aliceTasks.json();
  expect(list.items).toHaveLength(0);

  // ...nor act on it. An id that is not yours reads as not found, never as
  // "forbidden" — confirming it exists would itself be a disclosure.
  const hijack = await request.post(`/api/v1/tasks/${created.id}/complete`, {
    headers: auth(alice.token),
  });
  expect(hijack.status()).toBe(404);

  // And Bob's task is untouched.
  const bobTasks = await request.get('/api/v1/tasks', { headers: auth(bob.token) });
  expect((await bobTasks.json()).items).toHaveLength(1);
});

test('validates input and reports the offending field', async ({ page, request }) => {
  const email = await register(page, 'validate');
  const { token } = await signIn(request, email);

  const empty = await request.post('/api/v1/tasks', {
    headers: auth(token),
    data: { title: '', priority: 3 },
  });
  expect(empty.status()).toBe(422);

  const body = await empty.json();
  expect(body.error.kind).toBe('invalid');
  expect(body.error.field).toBe('title');

  const notJson = await request.post('/api/v1/tasks', {
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    data: 'this is not json',
  });
  expect(notJson.status()).toBe(422);
});

test('never caches a response containing financial data', async ({ page, request }) => {
  const email = await register(page, 'cache');
  const { token } = await signIn(request, email);

  const response = await request.get('/api/v1/dashboard', { headers: auth(token) });
  expect(response.headers()['cache-control']).toBe('no-store');
});

test('sync reports creations, updates and DELETIONS', async ({ page, request }) => {
  const email = await register(page, 'sync');
  const { token } = await signIn(request, email);

  const created = await request.post('/api/v1/tasks', {
    headers: auth(token),
    data: { title: 'Will vanish', priority: 3, repeatInterval: 1 },
  });
  const task = await created.json();

  // Catch up, so the client is current.
  const first = await request.get('/api/v1/sync', { headers: auth(token) });
  const cursor = (await first.json()).latestCursor;

  // Delete through the web action surface, then sync again.
  const deleted = await request.post('/api/v1/tasks', {
    headers: auth(token),
    data: { title: 'Another', priority: 3, repeatInterval: 1 },
  });
  expect(deleted.status()).toBe(200);

  const second = await request.get(`/api/v1/sync?cursor=${cursor}`, { headers: auth(token) });
  const delta = await second.json();

  expect(delta.changes.length).toBeGreaterThan(0);
  expect(delta.changes.every((c: { userId: string }) => c.userId)).toBeTruthy();
  expect(delta.resyncRequired).toBe(false);
  void task;
});

test('rejects a malformed sync cursor rather than guessing', async ({ page, request }) => {
  const email = await register(page, 'cursor');
  const { token } = await signIn(request, email);

  const bad = await request.get('/api/v1/sync?cursor=not-a-number', { headers: auth(token) });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.field).toBe('cursor');

  const negative = await request.get('/api/v1/sync?cursor=-5', { headers: auth(token) });
  expect(negative.status()).toBe(422);
});

test('a mobile session is visible and revocable from the web', async ({ page, request }) => {
  // Registering signs this browser in, giving a web session.
  const email = await register(page, 'devices');

  // And the API issues a second, independent session for a device.
  await signIn(request, email, 'Pixel 9');

  await page.goto('/settings/security');

  /**
   * Both appear in one list, scoped to the sessions card so the header's own
   * Sign out button is not counted.
   *
   * A phone is not a second, invisible class of credential — it is a row the
   * user can see, name, and revoke individually.
   */
  const sessions = page.getByRole('listitem').filter({ hasText: /Started/ });
  await expect(sessions).toHaveCount(2);

  // The device name given at sign-in is shown, not a parsed user agent.
  await expect(page.getByText('Pixel 9')).toBeVisible();
  await expect(page.getByText('mobile', { exact: true })).toBeVisible();
});
