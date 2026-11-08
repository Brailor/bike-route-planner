import { expect, test, type Page } from '@playwright/test';
import { INITIAL_VIEW } from '../src/map/view';
import { openMap, straightRoute, stubRouting } from './support';

// Desktop Chrome viewport 1280×720: the map fills it, so its centre is the viewport's centre.
const CENTRE = { x: 640, y: 360 };

/** Where the map is centred, read back by placing a start point in the middle of the screen. */
async function mapCentre(page: Page) {
  const requests = await stubRouting(page, straightRoute);
  await page.mouse.click(CENTRE.x, CENTRE.y);
  await page.mouse.click(CENTRE.x + 100, CENTRE.y);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  return requests[0]!.points[0]!;
}

test.describe('inside the supported region', () => {
  test.use({ geolocation: { longitude: 15.44, latitude: 47.07 }, permissions: ['geolocation'] }); // Graz

  test('opens the map on the user', async ({ page }) => {
    await openMap(page);
    await expect(page.getByTestId('user-location')).toBeVisible();
    const [lon, lat] = await mapCentre(page);
    expect(lon).toBeCloseTo(15.44, 2);
    expect(lat).toBeCloseTo(47.07, 2);
  });

  test('the location button flies to where the user is now', async ({ page, context }) => {
    await openMap(page);
    await expect(page.getByTestId('user-location')).toBeVisible();
    // Ridden on to Linz since the map opened.
    await context.setGeolocation({ longitude: 14.29, latitude: 48.31 });
    await page.getByRole('button', { name: 'Go to my location' }).click();
    await expect.poll(() => offCentre(page), { timeout: 10_000 }).toBeLessThan(2);
    const [lon, lat] = await mapCentre(page);
    expect(lon).toBeCloseTo(14.29, 2);
    expect(lat).toBeCloseTo(48.31, 2);
  });
});

test.describe('outside the supported region', () => {
  test.use({ geolocation: { longitude: 13.4, latitude: 52.52 }, permissions: ['geolocation'] }); // Berlin

  test('stays on Vienna', async ({ page }) => {
    await openMap(page);
    await expect(page.getByTestId('user-location')).toBeAttached();
    const [lon, lat] = await mapCentre(page);
    expect(lon).toBeCloseTo(INITIAL_VIEW.longitude, 2);
    expect(lat).toBeCloseTo(INITIAL_VIEW.latitude, 2);
  });
});

/** How far the you-are-here dot is from the middle of the map, in pixels. */
async function offCentre(page: Page) {
  const box = await page.getByTestId('user-location').boundingBox();
  if (!box) return Infinity;
  return Math.hypot(box.x + box.width / 2 - CENTRE.x, box.y + box.height / 2 - CENTRE.y);
}

test('stays on Vienna when location is denied', async ({ page }) => {
  await openMap(page);
  const [lon, lat] = await mapCentre(page);
  expect(lon).toBeCloseTo(INITIAL_VIEW.longitude, 2);
  expect(lat).toBeCloseTo(INITIAL_VIEW.latitude, 2);
  await expect(page.getByTestId('user-location')).toHaveCount(0);
});

test('the location button says so when location is denied', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'Go to my location' }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t find your location');
  await expect(page.getByTestId('user-location')).toHaveCount(0);
});
