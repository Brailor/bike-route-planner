import { expect, test, type Page } from '@playwright/test';
import { openMap } from './support';

/** A 1×1 transparent PNG, so tests don't load real tiles from the fair-use tile servers. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Answers background and elevation tiles; returns the URLs asked for. */
async function stubTiles(page: Page) {
  const asked: string[] = [];
  await page.route(/tile-cyclosm\.openstreetmap\.fr|tile\.opentopomap\.org/, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: PNG });
  });
  // Missing elevation tiles are a 404, as for zooms the elevation data doesn't reach.
  await page.route(/tiles\.mapterhorn\.com/, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 404 });
  });
  return asked;
}

test('switch the map background and hillshade; the choice is kept after a reload', async ({
  page,
}) => {
  const asked = await stubTiles(page);
  await openMap(page);
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toContainText('OpenFreeMap');

  await page.getByRole('button', { name: 'Map layers' }).click();
  await page.getByRole('radio', { name: 'Cycling' }).check();
  await expect.poll(() => asked.some((u) => u.includes('cyclosm'))).toBe(true);
  // The street map underneath is hidden, so its credit goes; OpenStreetMap is credited by CyclOSM's.
  await expect(attribution).toContainText('CyclOSM');
  await expect(attribution).toContainText('OpenStreetMap contributors');
  await expect(attribution).not.toContainText('OpenFreeMap');

  await page.getByRole('checkbox', { name: 'Hillshade' }).check();
  await expect.poll(() => asked.some((u) => u.includes('mapterhorn'))).toBe(true);
  await expect(attribution).toContainText('Mapterhorn');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio')).toHaveCount(0);

  await page.reload();
  await expect(attribution).toContainText('CyclOSM');
  await page.getByRole('button', { name: 'Map layers' }).click();
  await expect(page.getByRole('radio', { name: 'Cycling' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Hillshade' })).toBeChecked();

  // One tiled background for another.
  await page.getByRole('radio', { name: 'Topo' }).check();
  await expect(attribution).toContainText('OpenTopoMap');
  await expect(attribution).not.toContainText('CyclOSM');
  expect(asked.some((u) => u.includes('opentopomap'))).toBe(true);

  await page.getByRole('radio', { name: 'Map' }).check();
  await page.getByRole('checkbox', { name: 'Hillshade' }).uncheck();
  await expect(attribution).toContainText('OpenFreeMap');
  await expect(attribution).not.toContainText('OpenTopoMap');
  await expect(attribution).not.toContainText('Mapterhorn');
});
