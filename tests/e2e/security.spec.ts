import { expect, test } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * Asserts the security posture in docs/ARCHITECTURE.md is actually on the wire,
 * rather than only present in a config file.
 */

test.beforeEach(resetRateLimits);

test('sends the expected security headers', async ({ request }) => {
  const response = await request.get('/sign-in');
  const headers = response.headers();

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('geolocation=()');
});

test('ships a nonce-based CSP with no unsafe-inline script source', async ({ request }) => {
  const response = await request.get('/sign-in');
  const csp = response.headers()['content-security-policy'];

  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");

  const scriptSrc = csp!.split(';').find((d) => d.trim().startsWith('script-src'));
  expect(scriptSrc).toContain('nonce-');
  // The whole point of a nonce policy: inline script must not be blanket-allowed.
  expect(scriptSrc).not.toContain('unsafe-inline');
});

test('does not advertise the framework', async ({ request }) => {
  const response = await request.get('/sign-in');
  expect(response.headers()['x-powered-by']).toBeUndefined();
});

test('issues an httpOnly, sameSite session cookie', async ({ page, context }) => {
  const email = `e2e-cookie-${Date.now()}@example.com`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Cookie Check');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  const session = (await context.cookies()).find((c) => c.name.includes('kylix_session'));

  expect(session).toBeDefined();
  // httpOnly is what stops an XSS payload from reading the session token.
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe('Lax');
  expect(session!.path).toBe('/');

  // The cookie must carry the opaque token, never anything derived from identity.
  expect(session!.value).not.toContain(email);
  expect(session!.value).toMatch(/^[A-Za-z0-9_-]+$/);
});

test('does not leak the session token into the HTML', async ({ page, context }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Leak Check');
  await page.getByLabel('Email').fill(`e2e-leak-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  const session = (await context.cookies()).find((c) => c.name.includes('kylix_session'));
  const html = await page.content();

  expect(html).not.toContain(session!.value);
});
