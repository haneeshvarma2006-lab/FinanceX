import { expect, test } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * The M1 user journey, exercised against the production build so the CSP and
 * cookie flags under test are the ones real users would get.
 */

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = 'a sufficiently long passphrase';

test.beforeEach(resetRateLimits);

test('protects the app behind sign-in', async ({ page }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('signs up, lands in the app, and signs out again', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Tester');

  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The session is destroyed server-side, so going back does not restore it.
  await page.goto('/today');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('signs back in with the same credentials', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Returning User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/today$/);
});

test('gives nothing away when the password is wrong', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Someone');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole('button', { name: /sign out/i }).click();

  // A registered address with the wrong password...
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('definitely the wrong passphrase');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // Scoped to the form: Next's route announcer is also role="alert".
  const formAlert = page.locator('form').getByRole('alert');
  const knownAccountMessage = await formAlert.textContent();

  // ...and an address that was never registered.
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password').fill('definitely the wrong passphrase');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  const unknownAccountMessage = await formAlert.textContent();

  expect(knownAccountMessage).toBe(unknownAccountMessage);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('refuses a duplicate registration', async ({ page }) => {
  const email = uniqueEmail();

  for (const attempt of [1, 2]) {
    await page.goto('/sign-up');
    await page.getByLabel('Name').fill('Duplicate');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    if (attempt === 1) {
      await expect(page).toHaveURL(/\/today$/);
      await page.getByRole('button', { name: /sign out/i }).click();
    }
  }

  await expect(page.getByText(/already uses this address/i)).toBeVisible();
});

test('rejects a password below the minimum length', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Short Password');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByText(/at least 12 characters/i)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
});
