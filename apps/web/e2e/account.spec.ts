// Flags and saved routes on the server (ADR 0016), for the suite's account. Needs the containers (E2E_USER); the dev
// server has no accounts. The other specs get these in memory instead (support.ts), so these run alone on the
// account's.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { SESSION_FILE } from './session';
import { openMap, straightRoute, stubRouting } from './support';

const user = process.env.E2E_USER ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const NO_SESSION = { cookies: [], origins: [] };
test.skip(!user, 'Needs the containers and an account (E2E_USER, E2E_PASSWORD)');
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  for (const list of ['flags', 'routes']) {
    const items = (await (await request.get(`/api/${list}`)).json()) as { id: string }[];
    for (const { id } of items) await request.delete(`/api/${list}/${id}`);
  }
});

const localFlag = {
  id: 'made-before-logging-in',
  geometry: {
    type: 'LineString',
    coordinates: [
      [16.37, 48.2],
      [16.375, 48.202],
    ],
  },
  reason: 'private',
  createdAt: '2026-11-01T08:00:00.000Z',
};
const localRoute = {
  id: 'saved-before-logging-in',
  name: 'Lobau',
  geometry: localFlag.geometry,
  distanceM: 412,
  elevation: 'none',
  createdAt: '2026-11-02T08:00:00.000Z',
};

/**
 * Puts a flag and a route in the browser's storage the way the app keeps them (src/storage/db.ts), before the app
 * has opened it. As a script: the e2e code isn't compiled with the browser's types.
 */
const saveInBrowser = (page: Page) =>
  page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open('bike-route-planner', 3);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('flags', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      open.result.createObjectStore('settings');
      open.result.createObjectStore('routes', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(['flags', 'routes'], 'readwrite');
      tx.objectStore('flags').put(${JSON.stringify(localFlag)});
      tx.objectStore('routes').put(${JSON.stringify(localRoute)});
      tx.oncomplete = () => resolve(open.result.close());
      tx.onerror = () => reject(tx.error);
    };
  })`);

/** How many flags and routes are left in the browser's storage. */
const inBrowser = (page: Page) =>
  page.evaluate<number[]>(`new Promise((resolve, reject) => {
    const open = indexedDB.open('bike-route-planner');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(['flags', 'routes']);
      const flags = tx.objectStore('flags').count();
      const routes = tx.objectStore('routes').count();
      tx.oncomplete = () => resolve([flags.result, routes.result]);
    };
  })`);

async function logIn(page: Page) {
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('flags and routes saved in the browser before logging in move to the account, once', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ storageState: NO_SESSION });
  const page = await context.newPage();
  await page.goto('/');
  await saveInBrowser(page);

  await logIn(page);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  await expect(page.getByRole('button', { name: /^Lobau · / })).toBeVisible();
  expect(await (await request.get('/api/flags')).json()).toEqual([localFlag]);
  expect(await (await request.get('/api/routes')).json()).toEqual([localRoute]);
  expect(await inBrowser(page)).toEqual([0, 0]);

  // Logging in again here finds nothing left to move, and the account still has its one flag.
  await page.getByRole('button', { name: 'Log out' }).click();
  await logIn(page);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  expect(await (await request.get('/api/flags')).json()).toHaveLength(1);
  expect(await (await request.get('/api/routes')).json()).toHaveLength(1);
  await context.close();
});

/** How many items of a list the account has: a change shows on another device once it's there. */
const onServer = (request: APIRequestContext, list: string) => async () =>
  ((await (await request.get(`/api/${list}`)).json()) as unknown[]).length;

test('a flag made on one device shows on another, and deleting it there removes it', async ({
  browser,
  request,
}) => {
  const phone = await (await browser.newContext({ storageState: SESSION_FILE })).newPage();
  await stubRouting(phone, straightRoute);
  await phone.goto('/');
  await phone.getByRole('button', { name: 'Flag on map' }).click();
  await phone.mouse.click(700, 300);
  await phone.mouse.click(900, 360);
  await expect(phone.getByTestId('flag-length')).toBeVisible();
  await phone.getByRole('textbox', { name: 'Note (optional)' }).fill('Gate locked');
  await phone.getByRole('button', { name: 'Save flag' }).click();
  await expect(phone.getByTestId('flag-count')).toHaveText('1 flagged section');
  await expect.poll(onServer(request, 'flags')).toBe(1);

  const computer = await (await browser.newContext({ storageState: SESSION_FILE })).newPage();
  await computer.goto('/');
  await expect(computer.getByTestId('flag-count')).toHaveText('1 flagged section');
  expect(await inBrowser(computer)).toEqual([0, 0]);
  await computer.getByRole('button', { name: /Gate locked/ }).click();
  await computer.getByRole('button', { name: 'Delete…' }).click();
  await computer.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(computer.getByTestId('flag-count')).toHaveCount(0);
  await expect.poll(onServer(request, 'flags')).toBe(0);

  await phone.reload();
  await expect(phone.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await expect(phone.getByTestId('flag-count')).toHaveCount(0);
});

test('a route saved on one device opens on another', async ({ browser, request }) => {
  const phone = await (await browser.newContext({ storageState: SESSION_FILE })).newPage();
  await stubRouting(phone, straightRoute);
  await phone.goto('/');
  await expect(phone.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await phone.mouse.click(600, 300);
  await phone.mouse.click(1000, 460);
  await phone.getByRole('button', { name: 'Save route' }).click();
  await phone.getByRole('textbox', { name: 'Name' }).fill('Sunday gravel');
  await phone.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(phone.getByRole('button', { name: /^Sunday gravel · / })).toBeVisible();
  await expect.poll(onServer(request, 'routes')).toBe(1);

  const computer = await (await browser.newContext({ storageState: SESSION_FILE })).newPage();
  await computer.goto('/');
  await computer.getByRole('button', { name: /^Sunday gravel · / }).click();
  await expect(computer.getByTestId('track-name')).toHaveText('Sunday gravel');
  expect(await inBrowser(computer)).toEqual([0, 0]);
});

// openMap stubs the account's flags and routes; this checks that stub is what the other specs get.
test('the other specs’ flags and routes stay out of the account', async ({ page, request }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  await page.getByRole('button', { name: 'Flag on map' }).click();
  await page.mouse.click(700, 300);
  await page.mouse.click(900, 360);
  await page.getByRole('button', { name: 'Save flag' }).click();
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  await page.mouse.click(600, 300);
  await page.mouse.click(1000, 460);
  await page.getByRole('button', { name: 'Save route' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved routes' })).toBeVisible();
  expect(await (await request.get('/api/flags')).json()).toEqual([]);
  expect(await (await request.get('/api/routes')).json()).toEqual([]);
});
