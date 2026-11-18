import { defineConfig, devices } from '@playwright/test';
import { SESSION_FILE } from './e2e/session';

const PORT = 5173;
// Set to test an app that's already served, e.g. the web container (ADR 0014); otherwise the dev server is started.
const BASE_URL = process.env.E2E_BASE_URL;
// Set (with E2E_PASSWORD) where the app has accounts, i.e. the containers: every test then runs logged in.
const LOGGED_IN = !!process.env.E2E_USER;

export default defineConfig({
  testDir: 'e2e',
  // Tests against the real routing engine are opt-in: pnpm e2e:live (playwright.live.config.ts).
  testIgnore: 'live/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  globalSetup: LOGGED_IN ? './e2e/login.setup.ts' : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    storageState: LOGGED_IN ? SESSION_FILE : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: BASE_URL
    ? undefined
    : {
        command: `pnpm dev --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
      },
});
