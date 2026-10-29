// Opt-in e2e run against the real GraphHopper (ADR 0004): pnpm e2e:live, with `pnpm routing:start` running.
// Not part of `pnpm e2e` or CI.
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: 'e2e/live',
  testIgnore: undefined,
  // Real routing is slower than the stubs, and one engine serves all workers.
  timeout: 60_000,
  workers: 2,
  retries: 0,
});
