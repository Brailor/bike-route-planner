// Against the containers (E2E_USER set), every test runs logged in: this logs in once and keeps the session cookie
// for the browsers (playwright.config.ts). The dev server has no accounts and needs none of this.
import { request, type FullConfig } from '@playwright/test';
import { SESSION_FILE } from './session';

export default async function logIn(config: FullConfig) {
  const context = await request.newContext({ baseURL: config.projects[0]?.use.baseURL });
  const res = await context.post('/api/login', {
    data: { username: process.env.E2E_USER, password: process.env.E2E_PASSWORD },
  });
  if (!res.ok()) throw new Error(`Logging in as ${process.env.E2E_USER} failed: ${res.status()}`);
  await context.storageState({ path: SESSION_FILE });
  await context.dispose();
}
