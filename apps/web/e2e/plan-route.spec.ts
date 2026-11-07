import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fixture, openMap, stubRouting as stub } from './support';

// GraphHopper is replaced by recorded responses (ADR 0004): road → road fixture, everything else → gravel fixture.
const gravel = fixture('gravel-offroad-80');
const road = fixture('road-via');

const stubRouting = (page: Page) =>
  stub(page, (body) => (body.profile === 'road' ? road : gravel).response);

async function placeTwoPoints(page: Page) {
  await page.mouse.click(800, 350);
  await expect(page.getByText('Click again to set the destination.')).toBeVisible();
  await page.mouse.click(950, 500);
}

test('plan a route, switch profile, move the slider, export GPX', async ({ page }) => {
  const requests = await stubRouting(page);
  await openMap(page);
  await expect(page.getByText('Click the map to set a start point.')).toBeVisible();

  await placeTwoPoints(page);
  await expect(page.getByTestId('waypoint')).toHaveCount(2);
  await expect(page.getByTestId('stat-distance')).toHaveText('3.4 km');
  await expect(page.getByTestId('stat-time')).toHaveText('8 min');
  await expect(page.getByTestId('surface-paved')).toBeVisible();
  expect(requests.at(-1)?.profile).toBe('gravel');

  // Elevation chart hover is mirrored on the map.
  const chart = page.getByTestId('elevation-chart');
  await chart.scrollIntoViewIfNeeded(); // the sidebar is taller than the test's window
  const box = await chart.boundingBox();
  if (!box) throw new Error('elevation chart not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('hover-dot')).toBeVisible();

  // Switching profile re-routes with the road profile.
  // (Both fixtures are the same 3.4 km route, which the speed model times the same on both bikes.)
  await page.getByRole('button', { name: 'Road' }).click();
  await expect.poll(() => requests.at(-1)?.profile).toBe('road');
  await expect(page.getByTestId('stat-time')).toHaveText('8 min');

  // The off-road slider changes the custom model sent to the engine.
  await page.getByRole('button', { name: 'Gravel' }).click();
  await expect.poll(() => requests.at(-1)?.profile).toBe('gravel');
  await page.getByRole('slider').fill('100');
  await expect.poll(() => requests.at(-1)?.custom_model?.priority?.[0]?.multiply_by).toBe('0.3');

  await page.getByLabel('Avoid main roads').check();
  await expect
    .poll(() => JSON.stringify(requests.at(-1)?.custom_model))
    .toContain('road_class == TRUNK || road_class == PRIMARY');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export GPX' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^gravel-route-.*\.gpx$/);
  const gpx = readFileSync(await download.path(), 'utf8');
  expect(gpx.match(/<trkpt /g)).toHaveLength(gravel.response.paths[0]!.points.coordinates.length);
});

test('explains when the routing engine is down', async ({ page }) => {
  await page.route('**/gh/route', (route) => route.fulfill({ status: 502, body: 'Bad Gateway' }));
  await openMap(page);
  await placeTwoPoints(page);
  await expect(page.getByRole('alert')).toContainText('pnpm routing:start');
});

test('explains when there is no route', async ({ page }) => {
  const outOfBounds = fixture('out-of-bounds');
  await page.route('**/gh/route', (route) =>
    route.fulfill({ status: outOfBounds.status, json: outOfBounds.response }),
  );
  await openMap(page);
  await placeTwoPoints(page);
  await expect(page.getByRole('alert')).toContainText('No route between these points');
});

test('undo and redo waypoint edits with the keyboard and the buttons', async ({ page }) => {
  await stubRouting(page);
  await openMap(page);
  const waypoints = page.getByTestId('waypoint');
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();

  await placeTwoPoints(page);
  await expect(waypoints).toHaveCount(2);

  await page.keyboard.press('Control+z');
  await expect(waypoints).toHaveCount(1);
  await page.keyboard.press('Meta+z'); // ⌘Z on macOS
  await expect(waypoints).toHaveCount(0);
  await expect(undo).toBeDisabled();

  await page.keyboard.press('Control+Shift+z');
  await expect(waypoints).toHaveCount(1);
  await page.keyboard.press('Control+y');
  await expect(waypoints).toHaveCount(2);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  await expect(redo).toBeDisabled();

  // Clear is undoable too.
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(waypoints).toHaveCount(0);
  await undo.click();
  await expect(waypoints).toHaveCount(2);
  await redo.click();
  await expect(waypoints).toHaveCount(0);
});
