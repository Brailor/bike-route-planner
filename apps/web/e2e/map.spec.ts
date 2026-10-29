import { expect, test } from '@playwright/test';

test('the map renders OpenFreeMap tiles with OSM attribution', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  // Vector tiles are fetched by maplibre's web worker; seeing one proves the worker loaded.
  const tile = page.waitForResponse((res) => /tiles\.openfreemap\.org\/.+\.pbf/.test(res.url()));
  await page.goto('/');

  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  expect((await tile).ok()).toBe(true);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  expect(errors).toEqual([]);
});
