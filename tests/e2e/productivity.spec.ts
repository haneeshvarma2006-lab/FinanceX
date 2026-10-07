import { expect, test, type Page } from '@playwright/test';
import { isoDay, openTaskOptions, resetRateLimits } from './fixtures';

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
  await page.getByLabel('Do it on').fill(isoDay());
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
  await expect(page.getByText(`for ${isoDay(1)}`)).toBeVisible();
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
  await page.goto('/lifestyle');

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
  await expect(page.getByText('₹25,000.50 of ₹1,00,000.00')).toBeVisible();
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
    ['Lifestyle', /lifestyle/i],
    ['Notes', /notes/i],
    ['Goals', /goals/i],
    ['Finance', /finance/i],
    ['Trading', /trading journal/i],
    ['Settings', /settings/i],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  }
});

test('the old habits address lands on Lifestyle', async ({ page }) => {
  await register(page, 'lifestyle');
  await page.goto('/habits');
  await expect(page).toHaveURL(/\/lifestyle$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lifestyle');
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
  await page.goto('/lifestyle');

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
  await page.goto('/lifestyle');

  const field = page.getByLabel('Habit', { exact: true });

  await field.fill('First habit');
  // Do not await the click's settlement — type immediately afterwards.
  await page.getByRole('button', { name: /add habit/i }).click({ noWaitAfter: true });
  await field.fill('Second habit');

  await expect(page.getByText('Habit added')).toBeVisible();

  // What was typed during the round trip survived.
  await expect(field).toHaveValue('Second habit');
});

test('notes work like a diary: write, edit, pin, search and delete', async ({ page }) => {
  await register(page, 'notes');
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Notes');
  await expect(page.getByText('Your diary is empty')).toBeVisible();

  await page.getByLabel('Title').fill('Morning');
  await page.getByLabel('Entry').fill('Woke early.\nPlanned the week.');
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();

  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.getByRole('heading', { name: 'Morning' })).toBeVisible();
  await expect(today.getByText('Planned the week.')).toBeVisible();
  // The composer is ready for the next entry.
  await expect(page.getByLabel('Entry')).toHaveValue('');

  await page.getByRole('button', { name: 'Edit Morning' }).click();
  const editor = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
  await editor.getByLabel('Entry').fill('Woke early. Gym, then work.');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Woke early. Gym, then work.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

  await page.getByLabel('Title').fill('');
  await page.getByLabel('Entry').fill('Second thought about money');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(today.getByText('Second thought about money')).toBeVisible();

  await page.getByRole('button', { name: 'Pin Morning' }).click();
  await expect(page.getByRole('region', { name: 'Pinned' }).getByText('Morning')).toBeVisible();

  await page.getByLabel('Search your notes').fill('money');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/q=money/);
  await expect(page.getByText('1 entry matches')).toBeVisible();
  await expect(page.getByText('Woke early. Gym, then work.')).toHaveCount(0);

  await page.getByRole('link', { name: 'Show all' }).click();
  await page.getByRole('button', { name: 'Delete Morning' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Woke early. Gym, then work.')).toHaveCount(0);
  await expect(today.getByText('Second thought about money')).toBeVisible();
});

test('quick-add chips name and tag a task in one tap', async ({ page }) => {
  await register(page, 'chips');
  await page.goto('/tasks');

  await page.getByRole('button', { name: 'Gym', exact: true }).click();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('Gym');
  await page.getByRole('button', { name: 'Add task' }).click();

  const list = page.locator('main ul').filter({ hasText: 'Gym' }).last();
  await expect(list.getByText('Gym', { exact: true }).first()).toBeVisible();
  // The chip resets for the next task, and a typed title is never replaced.
  await expect(page.getByRole('button', { name: 'Gym', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByLabel('What needs doing?').fill('Deep work on the report');
  await page.getByRole('button', { name: 'Working', exact: true }).click();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('Deep work on the report');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText('Deep work on the report')).toBeVisible();
  await expect(page.getByText('Working', { exact: true }).last()).toBeVisible();
});

test('the decision journal logs, reviews and reopens a decision', async ({ page }) => {
  await register(page, 'decisions');
  await page.goto('/notes');
  await page.getByRole('link', { name: 'Decisions' }).click();
  await expect(page).toHaveURL(/\/notes\/decisions$/);
  await expect(page.getByText('No decisions yet')).toBeVisible();

  await page.getByLabel('What did you decide?').fill('Stop trading the first 15 minutes');
  await page.getByLabel('Why').fill('Most of my losses come from the open.');
  await page.getByLabel('Area').selectOption('trading');
  await page.getByLabel('How sure are you?').selectOption('4');
  await page.getByLabel('Review on').fill(isoDay());
  await page.getByRole('button', { name: 'Log decision' }).click();

  const due = page.getByRole('region', { name: 'Ready to review' });
  await expect(due.getByText('Stop trading the first 15 minutes')).toBeVisible();

  // Today points at it too.
  await page.goto('/today');
  await expect(
    page.getByText('Review your decision: Stop trading the first 15 minutes'),
  ).toBeVisible();
  await page.goto('/notes/decisions');

  await page.getByRole('button', { name: 'Review Stop trading the first 15 minutes' }).click();
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Was it the right call?' })).toBeVisible();
  await page.getByRole('button', { name: 'Right call' }).click();
  await page.getByLabel('What actually happened?').fill('Fewer losing mornings.');
  await page.getByRole('button', { name: 'Save review' }).click();

  const reviewed = page.getByRole('region', { name: 'Reviewed' });
  await expect(reviewed.getByText('Fewer losing mornings.')).toBeVisible();
  await expect(page.getByText('100%')).toBeVisible();

  await page.getByRole('button', { name: 'Reopen Stop trading the first 15 minutes' }).click();
  await expect(page.getByRole('region', { name: 'Ready to review' })).toBeVisible();
});

test('Lifestyle keeps a diary for the day without touching habits', async ({ page }) => {
  await register(page, 'diary');
  await page.goto('/lifestyle');
  await expect(page.getByRole('heading', { name: 'Add a habit' })).toBeVisible();

  await page.getByLabel('Entry').fill('Slept 8 hours. Walked 6 km.');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.locator('article').getByText('Slept 8 hours. Walked 6 km.')).toBeVisible();

  await page.getByRole('link', { name: 'All notes' }).click();
  await expect(
    page.getByRole('region', { name: 'Today' }).getByText('Slept 8 hours.'),
  ).toBeVisible();
});

test('the weekly review names one thing to fix and adopts its rule in one tap', async ({
  page,
}) => {
  await register(page, 'review');

  // An empty week has nothing costly in it.
  await page.goto('/review');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Week of');
  await expect(page.getByText('Nothing costly stood out')).toBeVisible();

  // Plan three tasks for today and finish none of them.
  await page.goto('/tasks');
  for (const title of ['Write report', 'Call bank', 'File taxes']) {
    await page.getByLabel('What needs doing?').fill(title);
    await page.locator('summary', { hasText: 'More options' }).click();
    await page.getByLabel('Do it on').fill(isoDay());
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByText(title)).toBeVisible();
    await page.reload();
  }

  // Today leads with the wealth panel, which links to the review.
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Wealth' })).toBeVisible();
  await page.getByRole('link', { name: 'Weekly review' }).click();

  await expect(page.getByText('The one thing to fix')).toBeVisible();
  await expect(page.getByText('You finished 0 of the 3 tasks you planned')).toBeVisible();
  await page.getByRole('button', { name: 'Add rule: nudge me when nothing is done' }).click();
  await expect(
    page.getByText('Covered: “Nudge me when nothing is done” (or a stricter rule) is on.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Add rule/ })).toHaveCount(0);

  await page.goto('/rules');
  await expect(page.getByText('Nudge me when nothing is done').first()).toBeVisible();
});
