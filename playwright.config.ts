import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Some environments ship a pre-provisioned Chromium whose build number does not
 * match the one this Playwright release downloads. When such a build is present
 * we point at it directly; otherwise Playwright resolves its own as usual, so
 * CI with a normal `playwright install` is unaffected.
 */
function preinstalledChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;

  const candidate = readdirSync(root)
    .filter((entry) => /^chromium-\d+$/.test(entry))
    .map((entry) => join(root, entry, 'chrome-linux', 'chrome'))
    .find((path) => existsSync(path));

  return candidate;
}

const executablePath = preinstalledChromium();

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],

  webServer: {
    // Built output rather than dev, so the E2E run exercises the same code
    // path production does — including the real CSP, which differs in dev.
    command: 'pnpm build && pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://nestedflow:nestedflow@localhost:5432/nestedflow_e2e',
      AUTH_SECRET: 'e2e-secret-at-least-32-characters-long-for-playwright',
      APP_URL: baseURL,
      TRUST_PROXY_HEADERS: 'false',
    },
  },
});
