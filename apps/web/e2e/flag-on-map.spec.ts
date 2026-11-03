import { expect, test, type Page } from '@playwright/test';
import { openMap, straightRoute, stubRouting, type RouteBody } from './support';

type Body = RouteBody & { custom_model?: { distance_influence?: number; areas?: unknown } };

// Traces go to the same engine endpoint, on the mtb profile with a distance-first model.
const isTrace = (body: Body) => body.custom_model?.distance_influence !== undefined;

const points = (page: Page) => page.getByTestId('flag-point');

async function startMarking(page: Page) {
  const requests = (await stubRouting(page, straightRoute)) as Body[];
  await openMap(page);
  await page.getByRole('button', { name: 'Flag on map' }).click();
  return requests;
}

test('two clicks mark a section without a route, and later routes avoid it', async ({ page }) => {
  const requests = await startMarking(page);
  await page.mouse.click(700, 300);
  await page.mouse.click(900, 360);
  await expect(points(page)).toHaveCount(2);
  await expect(page.getByTestId('flag-length')).toBeVisible();
  const trace = requests.filter(isTrace).at(-1)!;
  expect(trace.profile).toBe('mtb');
  expect(trace.points).toHaveLength(2);

  // A third click doesn't add a point in this mode.
  await page.mouse.click(1000, 450);
  await page.waitForTimeout(200);
  await expect(points(page)).toHaveCount(2);

  await page.getByRole('combobox', { name: 'Reason (optional)' }).selectOption('Private');
  await page.getByRole('button', { name: 'Save flag' }).click();
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
  await expect(points(page)).toHaveCount(0);
  await expect(page.getByTestId('waypoint')).toHaveCount(0); // marking clicks never placed waypoints

  // The next route carries the flag.
  await page.mouse.click(650, 250);
  await page.mouse.click(1000, 450);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  const route = requests.filter((r) => !isTrace(r)).at(-1)!;
  expect(JSON.stringify(route.custom_model)).toContain('in_flag_0');
});

test('dragging an end re-traces; clicking an end doesn’t add a point', async ({ page }) => {
  const requests = await startMarking(page);
  await page.mouse.click(700, 300);

  // Clicking the start (e.g. to grab it) doesn't count as a click on the map, which would put the end on top of it.
  await points(page).first().click();
  await page.waitForTimeout(200);
  await expect(points(page)).toHaveCount(1);

  await page.mouse.click(900, 360);
  await expect(points(page)).toHaveCount(2);
  await expect.poll(() => requests.filter(isTrace).length).toBe(1);

  const box = (await points(page).last().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => requests.filter(isTrace).length).toBe(2);
  const [, end] = requests.filter(isTrace)[1]!.points;
  const [, before] = requests.filter(isTrace)[0]!.points;
  expect(end![1]).toBeLessThan(before![1]); // dragged down the screen: further south

  await page.keyboard.press('Escape');
  await expect(points(page)).toHaveCount(0);
  await expect(page.getByTestId('flag-count')).toHaveCount(0);
});

test('with a route on the map, marking leaves it alone until the flag is saved', async ({
  page,
}) => {
  const requests = (await stubRouting(page, straightRoute)) as Body[];
  await openMap(page);
  await page.mouse.click(600, 300);
  await page.mouse.click(1000, 460);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  const routed = requests.filter((r) => !isTrace(r)).length;

  await page.getByRole('button', { name: 'Flag on map' }).click();
  await expect(page.getByRole('combobox', { name: 'Start' })).toBeDisabled();
  // Clicks on the route line belong to the flag now, not to the route.
  await page.mouse.click(700, 340);
  await page.mouse.click(900, 420);
  await expect(page.getByTestId('flag-length')).toBeVisible();
  await expect(page.getByTestId('waypoint')).toHaveCount(2);
  expect(requests.filter((r) => !isTrace(r))).toHaveLength(routed);

  await page.getByRole('button', { name: 'Flag & reroute' }).click();
  await expect.poll(() => requests.filter((r) => !isTrace(r)).length).toBe(routed + 1);
  expect(JSON.stringify(requests.at(-1)?.custom_model)).toContain('in_flag_0');
});
