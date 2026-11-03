import { expect, test, type Page } from '@playwright/test';
import { fixture, openMap, stubRouting, type RouteBody } from './support';

// Recorded answers (ADR 0004): the plain gravel route, and the same route recorded with a flag on its middle.
const plain = fixture('gravel-offroad-80');
const rerouted = fixture('gravel-flagged');

type FlaggedBody = RouteBody & { custom_model?: { areas?: { features: unknown[] } } };

const hasFlags = (body: FlaggedBody) => Boolean(body.custom_model?.areas?.features.length);

async function planRoute(page: Page) {
  await page.mouse.click(800, 350);
  await page.mouse.click(950, 500);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
}

test('flagging a section reroutes around it, now and in later routes', async ({ page }) => {
  const requests = (await stubRouting(
    page,
    (body) => (hasFlags(body) ? rerouted : plain).response,
  )) as FlaggedBody[];
  await openMap(page);
  await planRoute(page);
  await expect(page.getByTestId('stat-distance')).toHaveText('3.4 km');

  await page.getByRole('button', { name: 'Flag a section' }).click();
  await page.getByRole('combobox', { name: 'Reason (optional)' }).selectOption('Too steep');
  await page.getByRole('textbox', { name: 'Note (optional)' }).fill('walked it');
  // Nothing changes until the flag is confirmed.
  expect(requests.filter(hasFlags)).toHaveLength(0);
  await page.getByRole('button', { name: 'Flag & reroute' }).click();

  await expect(page.getByTestId('flag-handle')).toHaveCount(0);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  await expect(page.getByTestId('stat-distance')).toHaveText('3.7 km');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // The flag goes to the engine as an area, limited to the ways it was drawn on.
  const sent = JSON.stringify(requests.at(-1)?.custom_model);
  expect(sent).toMatch(/in_flag_0 && \(osm_way_id == \d+/);

  // Kept across a reload, and applied to a fresh route. (openMap reloads and waits until the map takes clicks.)
  await openMap(page);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  const before = requests.length;
  await planRoute(page);
  await expect(page.getByTestId('stat-distance')).toHaveText('3.7 km');
  expect(requests.slice(before).every(hasFlags)).toBe(true);
});
