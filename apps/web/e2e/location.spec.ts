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

test('stays on Vienna when location is denied', async ({ page }) => {
  await openMap(page);
  const [lon, lat] = await mapCentre(page);
  expect(lon).toBeCloseTo(INITIAL_VIEW.longitude, 2);
  expect(lat).toBeCloseTo(INITIAL_VIEW.latitude, 2);
  await expect(page.getByTestId('user-location')).toHaveCount(0);
});
