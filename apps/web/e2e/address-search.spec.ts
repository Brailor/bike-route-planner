import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openMap, straightRoute, stubRouting } from './support';

/** Recorded Photon answers (fixtures:record-photon), picked by what was typed. */
const photon = (name: string) =>
  (
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../src/geocoding/photon/__fixtures__', `${name}.json`),
        'utf8',
      ),
    ) as { response: unknown }
  ).response;

async function stubGeocoding(page: Page) {
  const queries: URLSearchParams[] = [];
  await page.route(
    (url) => url.pathname === '/geo/api',
    async (route) => {
      const params = new URL(route.request().url()).searchParams;
      queries.push(params);
      const q = params.get('q')?.toLowerCase() ?? '';
      const name = q.startsWith('steph')
        ? 'stephansplatz'
        : q.startsWith('herren')
          ? 'address-graz'
          : 'no-match';
      await route.fulfill({ json: photon(name) });
    },
  );
  return queries;
}

const field = (page: Page, name: 'Start' | 'Destination') => page.getByRole('combobox', { name });
const marker = (page: Page, label: string) =>
  page.getByTestId('waypoint').filter({ hasText: label });

test('plan a route from typed addresses', async ({ page }) => {
  const routes = await stubRouting(page, straightRoute);
  const queries = await stubGeocoding(page);
  await openMap(page);
  await expect(field(page, 'Destination')).toBeDisabled();

  // Start: pick a suggestion with the mouse; the map flies there.
  await field(page, 'Start').fill('stephansplat');
  await page.getByRole('option').first().click();
  await expect(field(page, 'Start')).toHaveValue('Stephansplatz');
  await expect(marker(page, 'S')).toBeInViewport();

  // Destination: pick with the keyboard; the map fits both ends.
  await field(page, 'Destination').fill('Herrengasse 16 Graz');
  await expect(page.getByRole('option')).not.toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(field(page, 'Destination')).toHaveValue('Herrengasse 16');

  await expect
    .poll(() => routes.at(-1)?.points)
    .toEqual([
      [16.3720438, 48.2084639],
      [15.4396712, 47.0699746],
    ]);
  await expect(marker(page, 'S')).toBeInViewport();
  await expect(marker(page, 'E')).toBeInViewport();

  // Searches stay in the region and send the map centre only roughly.
  const last = queries.at(-1)!;
  expect(last.get('bbox')).toBe('9.5,45.7,22.95,49.05');
  expect(last.get('lat')).toMatch(/^\d+\.\d{2}$/);

  // Undo takes the destination back off, like any waypoint edit. (The button: focus is still in the field, where
  // Ctrl+Z is the field's own text undo.)
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(field(page, 'Destination')).toHaveValue('');
  await expect(page.getByTestId('waypoint')).toHaveCount(1);
});

test('points clicked on the map show as such, and an unknown address says so', async ({ page }) => {
  await stubRouting(page, straightRoute);
  await stubGeocoding(page);
  await openMap(page);
  await page.mouse.click(700, 300);
  await expect(field(page, 'Start')).toHaveValue('Point on map');

  await field(page, 'Destination').fill('qxzvkwjh');
  await expect(page.getByRole('status').filter({ hasText: 'No matches' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(field(page, 'Destination')).toHaveValue('');
  await expect(page.getByTestId('waypoint')).toHaveCount(1);
});
