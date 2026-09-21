import { expect, test, type Page } from '@playwright/test';
import { openTaskOptions, resetRateLimits } from './fixtures';

/**
 * Acceptance tests for the productivity modules, driven through the real UI
 * against the production build.
 */

test.beforeEach(resetRateLimits);

const PASSWORD = 'a sufficiently long passphrase';

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Workflow Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  return email;
}

test('dashboard shows honest empty states, not invented data', async ({ page }) => {
  await register(page, 'empty');

  // A brand-new account must not display a balance, a streak or a win rate.
  await expect(page.getByText(/nothing here yet — and that is correct/i)).toBeVisible();
  await expect(page.getByText(/never invent a balance/i)).toBeVisible();

  await expect(page.getByText('No tasks yet')).toBeVisible();
  await expect(page.getByText('No habits yet')).toBeVisible();
  await expect(page.getByText('No accounts yet')).toBeVisible();
  await expect(page.getByText('No trading account yet')).toBeVisible();

  // Each blank offers the action that would fill it.
  await expect(page.getByRole('link', { name: /add your first task/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /add your first habit/i })).toBeVisible();

  const body = await page.textContent('body');
  expect(body).not.toMatch(/₹\s?[1-9]/); // no fabricated money anywhere
});

test('creates a task and sees it on the dashboard', async ({ page }) => {
  await register(page, 'task');

  await page.getByRole('link', { name: /add your first task/i }).click();
  await expect(page).toHaveURL(/\/tasks$/);

  await page.getByLabel('What needs doing?').fill('Review the trading journal');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Task added')).toBeVisible();

  await expect(page.getByText('Review the trading journal')).toBeVisible();

  // The dashboard is connected to the same data, not a separate store.
  await page.goto('/today');
  await expect(page.getByText('Review the trading journal')).toBeVisible();
  await expect(page.getByText('No tasks yet')).toHaveCount(0);
});

test('completes a task and it moves to the completed list', async ({ page }) => {
  await register(page, 'complete');
  await page.goto('/tasks');

  await page.getByLabel('What needs doing?').fill('One and done');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Task added')).toBeVisible();

  await page.getByRole('button', { name: /mark complete/i }).click();
  await expect(page.getByText('No open tasks')).toBeVisible();

  await page.getByLabel('Show').selectOption('done');
  await expect(page.getByText('One and done')).toBeVisible();
});

test('a repeating task schedules exactly one successor on completion', async ({ page }) => {
  await register(page, 'repeat');
  await page.goto('/tasks');

  await page.getByLabel('What needs doing?').fill('Daily review');
  await openTaskOptions(page);
  await page.getByLabel('Do it on').fill('2026-09-21');
  await page.getByLabel('Repeat').selectOption('daily');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Task added')).toBeVisible();

  await expect(page.getByText('repeats')).toBeVisible();

  await page.getByRole('button', { name: /mark complete/i }).click();

  /**
   * Exactly ONE open successor, scheduled for the following day — not a
   * horizon of pre-generated rows, and not zero. The successor carries the
   * repeats badge and its own date, which is what explains its appearance.
   */
  await expect(page.getByText('1 task')).toBeVisible();
  await expect(page.getByText('Daily review')).toHaveCount(1);
  await expect(page.getByText('for 2026-09-22')).toBeVisible();
  await expect(page.getByText('repeats')).toBeVisible();

  // And the completed one is in the done list, so nothing was lost.
  await page.getByLabel('Show').selectOption('done');
  await expect(page.getByText('Daily review')).toHaveCount(1);
});

test('search and filtering narrow the list and reset paging', async ({ page }) => {
  await register(page, 'search');
  await page.goto('/tasks');

  for (const title of ['Pay the rent', 'Buy milk', 'Call the bank']) {
    await page.getByLabel('What needs doing?').fill(title);
    await page.getByRole('button', { name: /add task/i }).click();
    await expect(page.getByText('Task added')).toBeVisible();
  }

  await expect(page.getByText('3 tasks')).toBeVisible();

  await page.getByLabel('Search').fill('rent');
  await expect(page.getByText('1 task', { exact: false })).toBeVisible();
  await expect(page.getByText('Pay the rent')).toBeVisible();
  await expect(page.getByText('Buy milk')).toHaveCount(0);

  await page.getByLabel('Search').fill('nothing matches this');
  await expect(page.getByText('Nothing matches')).toBeVisible();
});

test('logs a habit, builds a streak, and the toggle is idempotent', async ({ page }) => {
  await register(page, 'habit');
  await page.goto('/habits');

  await page.getByLabel('Habit', { exact: true }).fill('Morning walk');
  await page.getByRole('button', { name: /add habit/i }).click();
  await expect(page.getByText('Habit added')).toBeVisible();

  const logButton = page.getByRole('button', { name: /log morning walk for today/i });
  await expect(logButton).toBeVisible();
  await logButton.click();

  const doneButton = page.getByRole('button', { name: /remove today's entry/i });
  await expect(doneButton).toBeVisible();
  await expect(page.getByText('1 day')).toBeVisible();

  // Toggling off removes it; the state is a real toggle, not an append.
  await doneButton.click();
  await expect(page.getByRole('button', { name: /log morning walk for today/i })).toBeVisible();

  await page.goto('/today');
  await expect(page.getByText('Morning walk')).toBeVisible();
});

test('tracks a goal to completion with exact progress', async ({ page }) => {
  await register(page, 'goal');
  await page.goto('/goals');

  await page.getByLabel('What are you aiming for?').fill('Read 10 books');
  await page.getByLabel('Target', { exact: true }).fill('10');
  await page.getByLabel('Unit').fill('books');
  await page.getByRole('button', { name: /set goal/i }).click();
  await expect(page.getByText('Goal added')).toBeVisible();

  await page.getByLabel('Now at').fill('4');
  await page.getByRole('button', { name: /record/i }).click();
  await expect(page.getByText('Progress recorded')).toBeVisible();
  await expect(page.getByText('40%')).toBeVisible();

  await page.getByLabel('Now at').fill('10');
  await page.getByRole('button', { name: /record/i }).click();

  /**
   * Reaching the target closes the goal, so it leaves Active for Completed.
   * Asserting the durable state rather than the transient success message,
   * which disappears with the form when the card unmounts.
   */
  await expect(page.getByText('0 in progress')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible();
  await expect(page.getByText(/achieved 2026-/)).toBeVisible();
});

test('a money goal keeps exact precision', async ({ page }) => {
  await register(page, 'moneygoal');
  await page.goto('/goals');

  await page.getByLabel('What are you aiming for?').fill('Emergency fund');
  await page.getByLabel('Kind').selectOption('financial');
  await page.getByLabel('Target', { exact: true }).fill('100000.00');
  await page.getByRole('button', { name: /set goal/i }).click();
  await expect(page.getByText('Goal added')).toBeVisible();

  await page.getByLabel('Now at').fill('25000.50');
  await page.getByRole('button', { name: /record/i }).click();
  await expect(page.getByText('Progress recorded')).toBeVisible();

  // 25000.50 of 100000.00 is 25% — and the paise are not lost.
  await expect(page.getByText('25000.50 of 100000.00')).toBeVisible();
});

test('overdue work is surfaced on the dashboard and notified', async ({ page }) => {
  await register(page, 'overdue');
  await page.goto('/tasks');

  await page.getByLabel('What needs doing?').fill('Already late');
  await openTaskOptions(page);
  await page.getByLabel('Due by').fill('2020-01-01T09:00');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Task added')).toBeVisible();
  await expect(page.getByText('Overdue')).toBeVisible();

  await page.goto('/today');
  await expect(page.getByText(/worth your attention/i)).toBeVisible();
  await expect(page.getByText(/1 overdue task/i)).toBeVisible();

  /**
   * The same condition raises a notification, deduplicated per day. The copy
   * now comes from the "Overdue work" starter rule rather than a hardcoded
   * string — see modules/rules/defaults.ts.
   */
  await page.goto('/notifications');
  await expect(page.getByText('You have overdue tasks')).toBeVisible();

  await page.goto('/today');
  await page.goto('/notifications');
  await expect(page.getByText('You have overdue tasks')).toHaveCount(1);
});

test('notification preferences suppress a kind entirely', async ({ page }) => {
  /**
   * A rule's alerts are filed under the notification kind its *trigger*
   * belongs to, not under one generic "rules" kind — so the granular switches
   * in Settings still govern rule-driven alerts. Collapsing them into a single
   * switch was a regression this test caught.
   */
  await register(page, 'notifpref');

  await page.goto('/settings/notifications');
  const overdueToggle = page.getByLabel('Overdue tasks');
  await expect(overdueToggle).toBeChecked();
  await overdueToggle.uncheck();
  await page.getByRole('button', { name: /save/i }).first().click();
  await expect(page.getByText('Saved').first()).toBeVisible();

  await page.goto('/tasks');
  await page.getByLabel('What needs doing?').fill('Late but silent');
  await openTaskOptions(page);
  await page.getByLabel('Due by').fill('2020-01-01T09:00');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Task added')).toBeVisible();

  await page.goto('/today');
  await page.goto('/notifications');

  // Turning it off stops the row being created, not merely hidden.
  await expect(page.getByText('Nothing yet')).toBeVisible();
});

test('the export includes the productivity data', async ({ page }) => {
  await register(page, 'export2');

  await page.goto('/tasks');
  await page.getByLabel('What needs doing?').fill('Exported task');
  await page.getByRole('button', { name: /add task/i }).click();
  await expect(page.getByText('Task added')).toBeVisible();

  const response = await page.request.get('/api/account/export');
  const body = await response.json();

  expect(body.productivity.tasks).toHaveLength(1);
  expect(body.productivity.tasks[0].title).toBe('Exported task');
  expect(body.notificationPreferences.length).toBeGreaterThan(0);
});

test('every nav destination is reachable and has a heading', async ({ page }) => {
  await register(page, 'nav');

  for (const [link, heading] of [
    ['Tasks', /tasks/i],
    ['Habits', /habits/i],
    ['Goals', /goals/i],
    ['Finance', /finance/i],
    ['Trading', /trading journal/i],
    ['Settings', /settings/i],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  }
});

test('adding several in a row creates all of them', async ({ page }) => {
  /**
   * No settling wait between entries. React 19 auto-resets an uncontrolled
   * form once its action resolves, which used to wipe whatever had been typed
   * in the gap — the third entry submitted empty and showed a validation error
   * the user never caused. The primary field is now controlled, so React never
   * auto-resets it, and the deliberate clear only fires when the field still
   * holds exactly what was submitted.
   */
  await register(page, 'rapid');
  await page.goto('/habits');

  const field = page.getByLabel('Habit', { exact: true });

  for (const name of ['Morning walk', 'Read before bed', 'No phone after 10pm']) {
    await field.fill(name);
    await page.getByRole('button', { name: /add habit/i }).click();
    // Wait on a per-iteration signal. The "Habit added" alert persists from the
    // first submit, so asserting it would let the loop run ahead of the work.
    await expect(
      page.getByRole('button', { name: new RegExp(`log ${name} for today`, 'i') }),
    ).toBeVisible();
  }

  // All three created, none errored.
  await expect(page.getByText('Name the habit')).toHaveCount(0);
  for (const name of ['Morning walk', 'Read before bed', 'No phone after 10pm']) {
    await expect(page.getByText(name)).toBeVisible();
  }
  await expect(field).toHaveValue('');
});

test('text typed during a submit is not discarded', async ({ page }) => {
  /**
   * The precise case the controlled field exists for: start typing the next
   * entry while the previous submit is still in flight. The old behaviour
   * wiped it; the new clear is conditional on the field being unchanged.
   */
  await register(page, 'typing');
  await page.goto('/habits');

  const field = page.getByLabel('Habit', { exact: true });

  await field.fill('First habit');
  // Do not await the click's settlement — type immediately afterwards.
  await page.getByRole('button', { name: /add habit/i }).click({ noWaitAfter: true });
  await field.fill('Second habit');

  await expect(page.getByText('Habit added')).toBeVisible();

  // What was typed during the round trip survived.
  await expect(field).toHaveValue('Second habit');
});
