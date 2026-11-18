// The login gate in the containers (ADR 0015). Needs `pnpm containers:up` and an account: E2E_BASE_URL,
// E2E_USER and E2E_PASSWORD (CI sets them). The dev server has no accounts, so these are skipped there.
import { expect, test } from '@playwright/test';

const user = process.env.E2E_USER ?? '';
const password = process.env.E2E_PASSWORD ?? '';
// The suite runs logged in (login.setup.ts); these start without that session.
const NO_SESSION = { cookies: [], origins: [] };
test.skip(!user, 'Needs the containers and an account (E2E_USER, E2E_PASSWORD)');

test('routing, address search and the API refuse a request without a login', async ({
  playwright,
  baseURL,
  request,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: NO_SESSION });
  for (const res of [
    await anonymous.post('/gh/route', { data: {} }),
    await anonymous.post('/gh/match?profile=gravel', { data: '' }),
    await anonymous.get('/geo/api?q=Graz'),
    await anonymous.get('/api/me'),
  ])
    expect(res.status(), res.url()).toBe(401);
  expect(
    (await anonymous.post('/api/login', { data: { username: user, password: 'wrong' } })).status(),
  ).toBe(401);
  await anonymous.dispose();

  // The suite's own session (login.setup.ts) gets past the gate; without an engine (CI) the engine's absence shows.
  expect(await (await request.get('/api/me')).json()).toEqual({ username: user });
  expect((await request.post('/gh/route', { data: {} })).status()).not.toBe(401);
});

test('log in, see the map, log out', async ({ browser }) => {
  const context = await browser.newContext({ storageState: NO_SESSION });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.');

  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await expect(page.getByText(`Logged in as ${user}`)).toBeVisible();

  // Still logged in after a reload: the session is in an HttpOnly cookie, out of the page's reach.
  await page.reload();
  await expect(page.getByText(`Logged in as ${user}`)).toBeVisible();
  expect(await context.cookies()).toEqual([
    expect.objectContaining({ name: 'session', httpOnly: true, secure: true, sameSite: 'Strict' }),
  ]);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await context.close();
});
