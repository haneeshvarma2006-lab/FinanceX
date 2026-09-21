import { expect, test, type Page } from '@playwright/test';
import { openTaskOptions, resetRateLimits } from './fixtures';

/**
 * The rules engine, end to end. This is the product thesis made operable:
 * a condition in one part of your records producing an action in another.
 */

test.beforeEach(resetRateLimits);

const PASSWORD = 'a sufficiently long passphrase';

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Rules Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  return email;
}

test('starter rules are visible and editable, not hidden logic', async ({ page }) => {
  await register(page, 'starter');
  await page.goto('/rules');

  await expect(page.getByText('5 active of 5')).toBeVisible();

  // Each is a row the user can see, understand, and change.
  for (const name of [
    'Overdue work',
    'Protect a streak',
    'Goal falling behind',
    'Budget exceeded',
    'Review after losing trades',
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  await expect(page.getByText(/data, not code/i)).toBeVisible();
});

test('a rule fires from real data and is not repeated', async ({ page }) => {
  await register(page, 'fires');

  await page.goto('/tasks');
  await page.getByLabel('What needs doing?').fill('Already late');
  await openTaskOptions(page);
  await page.getByLabel('Due by').fill('2020-01-01T09:00');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Overdue')).toBeVisible();

  // Rules are evaluated when the dashboard is opened.
  await page.goto('/today');

  await page.goto('/notifications');
  await expect(page.getByText('You have overdue tasks')).toBeVisible();

  await page.goto('/rules');
  await expect(page.getByText('fired').first()).toBeVisible();

  // Re-evaluating the same condition on the same day must not act again.
  await page.goto('/today');
  await page.goto('/notifications');
  await expect(page.getByText('You have overdue tasks')).toHaveCount(1);

  await page.goto('/rules');
  await expect(page.getByText('already handled').first()).toBeVisible();
});

test('the activity log explains why a rule did NOT fire', async ({ page }) => {
  await register(page, 'whynot');
  await page.goto('/today');
  await page.goto('/rules');

  // A rule that quietly does nothing is otherwise indistinguishable from a
  // broken one, so the misses are recorded with their reasons too.
  await expect(page.getByText('no match').first()).toBeVisible();
  await expect(page.getByText(/below the threshold/i).first()).toBeVisible();
});

test('pausing a rule stops it acting', async ({ page }) => {
  await register(page, 'pause');

  await page.goto('/rules');
  await page.getByRole('button', { name: /pause overdue work/i }).click();
  await expect(page.getByText('paused')).toBeVisible();

  await page.goto('/tasks');
  await page.getByLabel('What needs doing?').fill('Late but ignored');
  await openTaskOptions(page);
  await page.getByLabel('Due by').fill('2020-01-01T09:00');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Overdue')).toBeVisible();

  await page.goto('/today');
  await page.goto('/notifications');
  await expect(page.getByText('You have overdue tasks')).toHaveCount(0);
});

test('testing a rule reports what it currently sees, without acting', async ({ page }) => {
  await register(page, 'preview');

  await page.goto('/tasks');
  await page.getByLabel('What needs doing?').fill('Already late');
  await openTaskOptions(page);
  await page.getByLabel('Due by').fill('2020-01-01T09:00');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Overdue')).toBeVisible();

  await page.goto('/rules');

  // Scope to the rule under test; rules are listed alphabetically, so .first()
  // would be a different row entirely.
  const overdueRow = page.getByRole('listitem').filter({ hasText: 'Overdue work' });
  await overdueRow.getByRole('button', { name: 'Test' }).click();

  await expect(overdueRow.getByText(/would fire now/i)).toBeVisible();

  // A test is a check, not a run: nothing was notified.
  await page.goto('/notifications');
  await expect(page.getByText('Nothing yet')).toBeVisible();
});

test('a user-created rule creates a task when it matches', async ({ page }) => {
  await register(page, 'createtask');

  await page.goto('/rules');
  await page.getByLabel('Name this rule').fill('Triage overdue work');
  await page.getByLabel('Condition').selectOption('tasks_overdue');
  await page.getByLabel('Threshold').fill('1');
  await page.getByLabel('Action').selectOption('create_task');
  await page.getByLabel('Task title').fill('Clear the overdue list');
  await page.getByRole('button', { name: /create rule/i }).click();
  await expect(page.getByText('Rule created')).toBeVisible();

  await page.goto('/tasks');
  await page.getByLabel('What needs doing?').fill('Already late');
  await openTaskOptions(page);
  await page.getByLabel('Due by').fill('2020-01-01T09:00');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Overdue')).toBeVisible();

  await page.goto('/today');
  await page.goto('/tasks');

  // The rule produced a real task, attributed to the rule that made it.
  await expect(page.getByText('Clear the overdue list')).toBeVisible();
  await expect(page.getByText(/Created automatically by your rule/i)).toBeVisible();

  // And re-evaluating does not create a second copy.
  await page.goto('/today');
  await page.goto('/tasks');
  await expect(page.getByText('Clear the overdue list')).toHaveCount(1);
});

test('a money threshold is compared exactly', async ({ page }) => {
  await register(page, 'money');

  await page.goto('/finance');
  await page.getByLabel('Name').fill('Current');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  await page.goto('/rules');
  await page.getByLabel('Name this rule').fill('Spending watch');
  await page.getByLabel('Condition').selectOption('spent_more_than');
  await page.getByLabel('Amount').fill('1000.00');
  await page.getByLabel('Alert title').fill('Spending is up');
  await page.getByRole('button', { name: /create rule/i }).click();
  await expect(page.getByText('Rule created')).toBeVisible();

  // Exactly at the threshold: "more than" means this must not fire.
  await page.goto('/finance');
  await page.getByLabel('Description').first().fill('Exactly at the line');
  await page.getByLabel('Amount').first().fill('1000.00');
  await page.getByRole('button', { name: /record transaction/i }).click();
  await expect(page.getByText('Transaction recorded')).toBeVisible();

  await page.goto('/today');
  await page.goto('/notifications');
  await expect(page.getByText('Spending is up')).toHaveCount(0);

  // One paisa over: a float comparison could get this wrong.
  await page.goto('/finance');
  await page.getByLabel('Description').first().fill('One paisa over');
  await page.getByLabel('Amount').first().fill('0.01');
  await page.getByRole('button', { name: /record transaction/i }).click();
  await expect(page.getByText('Transaction recorded')).toBeVisible();

  await page.goto('/today');
  await page.goto('/notifications');
  await expect(page.getByText('Spending is up')).toBeVisible();
});

test('rejects a rule with an empty action title', async ({ page }) => {
  await register(page, 'invalid');
  await page.goto('/rules');

  await page.getByLabel('Name this rule').fill('Incomplete');
  await page.getByRole('button', { name: /create rule/i }).click();

  await expect(page.getByText(/give the alert a title/i)).toBeVisible();
  await expect(page.getByText('Rule created')).toHaveCount(0);
});

test('deleting a rule removes it', async ({ page }) => {
  await register(page, 'delete');
  await page.goto('/rules');

  await page.getByRole('button', { name: /delete budget exceeded/i }).click();
  await expect(page.getByText('4 active of 4')).toBeVisible();
  await expect(page.getByText('Budget exceeded', { exact: true })).toHaveCount(0);
});
