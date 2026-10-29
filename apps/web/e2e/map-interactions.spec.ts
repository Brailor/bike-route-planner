import { expect, test, type Page } from '@playwright/test';
import { openMap, straightRoute, stubRouting, type RouteBody } from './support';

// Screen positions (Desktop Chrome viewport 1280×720; the side panel covers x < 344).
const START = { x: 600, y: 300 };
const END = { x: 1000, y: 460 };
const MIDDLE = { x: (START.x + END.x) / 2, y: (START.y + END.y) / 2 };

const waypoints = (page: Page) => page.getByTestId('waypoint');
const labels = (page: Page) => waypoints(page).allInnerTexts();

/** Places start and end, and waits until the route line between them reacts to the pointer. */
async function planStraightRoute(page: Page) {
  const requests = await stubRouting(page, straightRoute);
  await openMap(page);
  await page.mouse.click(START.x, START.y);
  await page.mouse.click(END.x, END.y);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  await expect
    .poll(async () => {
      await page.mouse.move(MIDDLE.x + 2, MIDDLE.y);
      await page.mouse.move(MIDDLE.x, MIDDLE.y);
      return page.getByTestId('hover-dot').isVisible();
    })
    .toBe(true);
  return requests;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const lastPoints = (requests: RouteBody[]) => requests.at(-1)?.points ?? [];

test('hovering the route line shows the position on the elevation chart', async ({ page }) => {
  await planStraightRoute(page);
  await expect(page.locator('.elevation__hover')).toBeVisible();
  await expect(page.locator('.elevation__caption')).toHaveText(/km · \d+ m|m · \d+ m/);
  await page.mouse.move(START.x, 650);
  await expect(page.getByTestId('hover-dot')).toBeHidden();
});

test('dragging the route line inserts a via point in that leg', async ({ page }) => {
  const requests = await planStraightRoute(page);
  await drag(page, MIDDLE, { x: MIDDLE.x, y: MIDDLE.y - 150 });

  await expect(waypoints(page)).toHaveCount(3);
  expect(await labels(page)).toEqual(['S', '1', 'E']);
  await expect.poll(() => lastPoints(requests).length).toBe(3);
  const [start, via, end] = lastPoints(requests);
  // Dropped above the line: further north than both ends.
  expect(via![1]).toBeGreaterThan(Math.max(start![1], end![1]));

  await page.keyboard.press('Control+z');
  await expect(waypoints(page)).toHaveCount(2);
});

test('clicking the route line does not add a waypoint', async ({ page }) => {
  await planStraightRoute(page);
  await page.mouse.click(MIDDLE.x, MIDDLE.y);
  await page.waitForTimeout(300);
  await expect(waypoints(page)).toHaveCount(2);
});

test('dragging a marker that sits on the line moves it instead of inserting a point', async ({
  page,
}) => {
  const requests = await planStraightRoute(page);
  const before = lastPoints(requests)[1]!;

  // Coming straight from hovering the line onto the marker used to grab the line underneath.
  await drag(page, END, { x: END.x + 60, y: END.y + 120 });

  await expect.poll(() => lastPoints(requests)[1]![1]).toBeLessThan(before[1]);
  expect(await labels(page)).toEqual(['S', 'E']);
  const box = await waypoints(page).filter({ hasText: 'E' }).boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - (END.x + 60))).toBeLessThan(4);
  expect(Math.abs(box!.y + box!.height / 2 - (END.y + 120))).toBeLessThan(4);
});

test('clicking a marker removes it, without adding a new one', async ({ page }) => {
  const requests = await planStraightRoute(page);
  await page.mouse.click(1100, 250);
  await expect(waypoints(page)).toHaveCount(3);
  expect(await labels(page)).toEqual(['S', '1', 'E']);

  await waypoints(page).filter({ hasText: '1' }).click();
  await expect(waypoints(page)).toHaveCount(2);
  await expect.poll(() => lastPoints(requests).length).toBe(2);
  expect(await labels(page)).toEqual(['S', 'E']);
});

test('clicking the only waypoint clears the route', async ({ page }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  await page.mouse.click(START.x, START.y);
  await waypoints(page).first().click();
  await expect(waypoints(page)).toHaveCount(0);
  await expect(page.getByText('Click the map to set a start point.')).toBeVisible();
});
