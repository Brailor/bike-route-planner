import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
// Set to test an app that's already served, e.g. the web container (ADR 0014); otherwise the dev server is started.
const BASE_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  // Tests against the real routing engine are opt-in: pnpm e2e:live (playwright.live.config.ts).
  testIgnore: 'live/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
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
