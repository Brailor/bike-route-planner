import { expect, test, type Page } from '@playwright/test';
import { fixture, openMap, straightRoute, stubRouting, type RouteBody } from './support';

// Recorded answers (ADR 0004): the plain gravel route, and the same route recorded with a flag on its middle.
const plain = fixture('gravel-offroad-80');
const rerouted = fixture('gravel-flagged');

type FlaggedBody = RouteBody & { custom_model?: { areas?: { features: unknown[] } } };

const hasFlags = (body: FlaggedBody) => Boolean(body.custom_model?.areas?.features.length);

/**
 * Waits until the map answers for a flag at (x, y): the flags layer updates a moment after the panel (GeoJSON is
 * processed off the main thread). Hovering is harmless, unlike retrying clicks, which can add waypoints.
 */
async function waitForFlagAt(page: Page, x: number, y: number) {
  await expect
    .poll(async () => {
      await page.mouse.move(x + 2, y);
      await page.mouse.move(x, y);
      return page
        .locator('.maplibregl-canvas')
        .evaluate((el) => (el as { style: { cursor: string } }).style.cursor);
    })
    .toBe('pointer');
}

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

test('edit and delete a flag; deleting it frees the section again', async ({ page }) => {
  const requests = (await stubRouting(
    page,
    (body) => (hasFlags(body) ? rerouted : plain).response,
  )) as FlaggedBody[];
  await openMap(page);
  await planRoute(page);
  await page.getByRole('button', { name: 'Flag a section' }).click();
  await page.getByRole('combobox', { name: 'Reason (optional)' }).selectOption('Too steep');
  await page.getByRole('button', { name: 'Flag & reroute' }).click();
  await expect(page.getByTestId('stat-distance')).toHaveText('3.7 km');

  // Edit from the list; the change is kept across a reload.
  await page.getByRole('button', { name: /^Too steep · / }).click();
  await page.getByRole('combobox', { name: 'Reason (optional)' }).selectOption('Overgrown');
  await page.getByRole('textbox', { name: 'Note (optional)' }).fill('brambles');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /^Overgrown · .*brambles/ })).toBeVisible();
  await openMap(page);
  await expect(page.getByRole('button', { name: /^Overgrown · .*brambles/ })).toBeVisible();

  // Delete: the route may use the section again, and the flag stays gone after a reload.
  await planRoute(page);
  await expect(page.getByTestId('stat-distance')).toHaveText('3.7 km');
  await page.getByRole('button', { name: /^Overgrown/ }).click();
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('flag-count')).toHaveCount(0);
  await expect(page.getByTestId('stat-distance')).toHaveText('3.4 km');
  expect(hasFlags(requests.at(-1)!)).toBe(false);
  await openMap(page);
  await expect(page.getByTestId('flag-count')).toHaveCount(0);
});

test('clicking a flag on the map opens it, even where the route runs over it', async ({ page }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  // The straight stub ignores flags, so the flag stays under the route line: the overlap case.
  const [start, end] = [
    { x: 600, y: 300 },
    { x: 1000, y: 460 },
  ];
  await page.mouse.click(start.x, start.y);
  await page.mouse.click(end.x, end.y);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  await page.getByRole('button', { name: 'Flag a section' }).click();
  await page.getByRole('button', { name: 'Flag & reroute' }).click();
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');

  // Handles start at 40–60% of the route, so the middle of the line is on the flag. The flags layer updates a moment
  // after the panel; until then this is a click on the bare route line, which does nothing, so retrying is safe.
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  await expect
    .poll(async () => {
      await page.mouse.click(middle.x, middle.y);
      return page.getByRole('button', { name: 'Delete…' }).count();
    })
    .toBe(1);
  await expect(page.getByTestId('waypoint')).toHaveCount(2);

  // Hidden flags can't be clicked: the same spot is just the route line again.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('checkbox', { name: 'Show on map' }).uncheck();
  await page.mouse.click(middle.x, middle.y);
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Delete…' })).toHaveCount(0);
});

test('a saved flag can be opened from the map after a reload', async ({ page }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  await page.mouse.click(600, 300);
  await page.mouse.click(1000, 460);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  await page.getByRole('button', { name: 'Flag a section' }).click();
  await page.getByRole('button', { name: 'Flag & reroute' }).click();
  await page.getByRole('button', { name: 'Clear' }).click();

  // Flags load from storage at startup, possibly before the map is ready.
  await openMap(page);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  // Middle of the flag, with no route around it now: a click before the layer is ready would add a waypoint.
  await waitForFlagAt(page, 800, 380);
  await page.mouse.click(800, 380);
  await expect(page.getByRole('button', { name: 'Delete…' })).toBeVisible();
  await expect(page.getByTestId('waypoint')).toHaveCount(0);
});
