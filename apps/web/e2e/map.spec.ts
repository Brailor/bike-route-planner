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

test('robots.txt asks crawlers to stay away', async ({ request }) => {
  // The app isn't meant to be found; polite crawlers and AI agents then don't load it (ADR 0018).
  expect(await (await request.get('/robots.txt')).text()).toBe('User-agent: *\nDisallow: /\n');
});
