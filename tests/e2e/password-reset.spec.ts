import { expect, test, type Page } from '@playwright/test';
import { plantResetToken, resetRateLimits } from './fixtures';

test.beforeEach(resetRateLimits);

const OLD = 'the original long passphrase';
const NEW = 'a brand new long passphrase';

async function register(page: Page): Promise<string> {
  const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Reset Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(OLD);
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return email;
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
}

test('without an email provider, reset is not offered rather than faked', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('link', { name: /forgot your password/i })).toHaveCount(0);

  await page.goto('/forgot-password');
  await expect(page.getByText(/cannot send email yet/i)).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveCount(0);
});

test('a reset link sets a new password and signs you in with it', async ({ page }) => {
  const email = await register(page);
  await signOut(page);

  const token = await plantResetToken(email);
  await page.goto(`/reset-password?token=${token}`);
  await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible();

  await page.getByLabel('New password').fill(NEW);
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  await signOut(page);
  await signIn(page, email, OLD);
  await expect(page.getByText(/do not match/i)).toBeVisible();
  await signIn(page, email, NEW);
  await expect(page).toHaveURL(/\/today$/);
});

test('a used link is dead the second time', async ({ page }) => {
  const email = await register(page);
  await signOut(page);
  const token = await plantResetToken(email);

  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('New password').fill(NEW);
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  await signOut(page);

  await page.goto(`/reset-password?token=${token}`);
  await expect(page.getByRole('heading', { name: /this link has expired/i })).toBeVisible();
});

test('an expired or made-up link says so, and offers a fresh one', async ({ page }) => {
  const email = await register(page);
  await signOut(page);
  const expired = await plantResetToken(email, -1);

  for (const token of [expired, 'x'.repeat(43), 'not-a-token']) {
    await page.goto(`/reset-password?token=${token}`);
    await expect(page.getByRole('heading', { name: /this link has expired/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /send a new reset link/i })).toBeVisible();
  }
});

test('a weak new password is refused and the link still works', async ({ page }) => {
  const email = await register(page);
  await signOut(page);
  const token = await plantResetToken(email);

  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('New password').fill('short');
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page.getByText(/at least 12 characters/i).first()).toBeVisible();

  await page.getByLabel('New password').fill(NEW);
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('resetting signs out a session elsewhere', async ({ browser }) => {
  const other = await browser.newContext();
  const elsewhere = await other.newPage();
  const email = await register(elsewhere);

  const here = await (await browser.newContext()).newPage();
  const token = await plantResetToken(email);
  await here.goto(`/reset-password?token=${token}`);
  await here.getByLabel('New password').fill(NEW);
  await here.getByRole('button', { name: /set new password/i }).click();
  await expect(here).toHaveURL(/\/today$/);

  // The other browser's session was deleted server-side.
  await elsewhere.goto('/today');
  await expect(elsewhere).toHaveURL(/\/sign-in/);
  await other.close();
});
