import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openMap, straightRoute, stubRouting } from './support';

const savedRoutes = (page: Page) => page.getByRole('region', { name: 'Saved routes' });

/**
 * The names of the routes in storage: the browser's, or logged in, the account's. A reload right after a change
 * would cut its write short, so the test waits for this first. As a script: e2e code has no browser types.
 */
const storedNames = (page: Page) =>
  page.evaluate<string[]>(
    process.env.E2E_USER
      ? `fetch('/api/routes').then((res) => res.json()).then((routes) => routes.map((r) => r.name))`
      : `new Promise((resolve, reject) => {
          const open = indexedDB.open('bike-route-planner');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const all = open.result.transaction('routes').objectStore('routes').getAll();
            all.onsuccess = () => resolve(all.result.map((r) => r.name));
          };
        })`,
  );

async function exportedPoints(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export GPX' }).click(),
  ]);
  return readFileSync(await download.path(), 'utf8').match(/<trkpt [^>]*>\s*<ele>[^<]*/g);
}

test('save a route, find it after a reload, open it as a track and delete it', async ({ page }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  await page.mouse.click(600, 300);
  await page.mouse.click(1000, 460);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  const planned = await exportedPoints(page);

  await page.getByRole('button', { name: 'Save route' }).click();
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(/^Gravel route /);
  await page.getByRole('textbox', { name: 'Name' }).fill('Sunday gravel');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved to your routes.')).toBeVisible();
  await expect(savedRoutes(page).getByRole('button', { name: /^Sunday gravel · / })).toBeVisible();
  await expect.poll(() => storedNames(page)).toEqual(['Sunday gravel']);

  // Saved routes outlast the page; opening one shows it as a track, the same line with its elevation.
  await openMap(page);
  await savedRoutes(page)
    .getByRole('button', { name: /^Sunday gravel · / })
    .click();
  await expect(page.getByTestId('track-name')).toHaveText('Sunday gravel');
  expect(await exportedPoints(page)).toEqual(planned);

  await page.getByRole('button', { name: 'Delete Sunday gravel' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(savedRoutes(page)).toHaveCount(0);
  await expect.poll(() => storedNames(page)).toEqual([]);
  await openMap(page);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await expect(savedRoutes(page)).toHaveCount(0);
});
