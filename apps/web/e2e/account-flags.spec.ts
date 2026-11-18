// Flags on the server (ADR 0016), for the suite's account. Needs the containers (E2E_USER); the dev server has no
// accounts. The other specs get flags in memory instead (support.ts), so these run alone on the account's flags.
import { expect, test, type Page } from '@playwright/test';
import { SESSION_FILE } from './session';
import { openMap, straightRoute, stubRouting } from './support';

const user = process.env.E2E_USER ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const NO_SESSION = { cookies: [], origins: [] };
test.skip(!user, 'Needs the containers and an account (E2E_USER, E2E_PASSWORD)');
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  const flags = (await (await request.get('/api/flags')).json()) as { id: string }[];
  for (const { id } of flags) await request.delete(`/api/flags/${id}`);
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

/**
 * Puts a flag in the browser's storage the way the app keeps it (src/storage/db.ts), before the app has opened it.
 * As a script: the e2e code isn't compiled with the browser's types.
 */
const saveInBrowser = (page: Page, flag: unknown) =>
  page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open('bike-route-planner', 2);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('flags', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      open.result.createObjectStore('settings');
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('flags', 'readwrite');
      tx.objectStore('flags').put(${JSON.stringify(flag)});
      tx.oncomplete = () => resolve(open.result.close());
      tx.onerror = () => reject(tx.error);
    };
  })`);

const flagsInBrowser = (page: Page) =>
  page.evaluate<number>(`new Promise((resolve, reject) => {
    const open = indexedDB.open('bike-route-planner');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const count = open.result.transaction('flags').objectStore('flags').count();
      count.onsuccess = () => resolve(count.result);
    };
  })`);

async function logIn(page: Page) {
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('flags saved in the browser before logging in move to the account, once', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ storageState: NO_SESSION });
  const page = await context.newPage();
  await page.goto('/');
  await saveInBrowser(page, localFlag);

  await logIn(page);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  expect(await (await request.get('/api/flags')).json()).toEqual([localFlag]);
  expect(await flagsInBrowser(page)).toBe(0);

  // Logging in again here finds nothing left to move, and the account still has its one flag.
  await page.getByRole('button', { name: 'Log out' }).click();
  await logIn(page);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  expect(await (await request.get('/api/flags')).json()).toHaveLength(1);
  await context.close();
});

test('a flag made on one device shows on another, and deleting it there removes it', async ({
  browser,
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

  const computer = await (await browser.newContext({ storageState: SESSION_FILE })).newPage();
  await computer.goto('/');
  await expect(computer.getByTestId('flag-count')).toHaveText('1 flagged section');
  expect(await flagsInBrowser(computer)).toBe(0);
  await computer.getByRole('button', { name: /Gate locked/ }).click();
  await computer.getByRole('button', { name: 'Delete…' }).click();
  await computer.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(computer.getByTestId('flag-count')).toHaveCount(0);

  await phone.reload();
  await expect(phone.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await expect(phone.getByTestId('flag-count')).toHaveCount(0);
});

// openMap stubs the account's flags; this checks that stub is what the other specs get.
test('the other specs’ flags stay out of the account', async ({ page, request }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  await page.getByRole('button', { name: 'Flag on map' }).click();
  await page.mouse.click(700, 300);
  await page.mouse.click(900, 360);
  await page.getByRole('button', { name: 'Save flag' }).click();
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  expect(await (await request.get('/api/flags')).json()).toEqual([]);
});
