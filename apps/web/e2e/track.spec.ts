import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openMap, straightRoute, stubRouting, type RouteBody } from './support';

// A 2 km track due east through Vienna, a point every 10 m, with flags along it at 500–700 m and 1300–1500 m.
const START = [16.36, 48.2] as const;
const M_PER_DEG_LON = 74_140;
const M_PER_DEG_LAT = 111_195;
const at = (x: number, y = 0) => [START[0] + x / M_PER_DEG_LON, START[1] + y / M_PER_DEG_LAT];
const along = (from: number, to: number, step = 10) =>
  Array.from({ length: (to - from) / step + 1 }, (_, i) => at(from + i * step));
const TRACK = along(0, 2000);

const gpx = (points: number[][]) =>
  `<?xml version="1.0"?>
<gpx version="1.1" creator="another planner" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Danube ride</name><trkseg>
${points.map(([lon, lat]) => `    <trkpt lat="${lat}" lon="${lon}"><ele>160</ele></trkpt>`).join('\n')}
  </trkseg></trk>
</gpx>`;

const flag = (id: string, from: number, to: number) => ({
  id,
  geometry: { type: 'LineString', coordinates: along(from, to, 50) },
  osmWayIds: [4242],
  reason: 'overgrown',
  createdAt: '2026-11-06T00:00:00.000Z',
});

/** Flags saved in the browser, as if marked earlier; the app reads them on the next load. */
async function saveFlags(page: Page) {
  await openMap(page);
  const flags = [flag('nettles', 500, 700), flag('fallen-tree', 1300, 1500)];
  // As a script: the e2e code isn't compiled with the browser's types.
  await page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open('bike-route-planner');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('flags', 'readwrite');
      for (const f of ${JSON.stringify(flags)}) tx.objectStore('flags').put(f);
      tx.oncomplete = () => resolve(open.result.close());
      tx.onerror = () => reject(tx.error);
    };
  })`);
  await openMap(page);
  await expect(page.getByTestId('flag-count')).toHaveText('2 flagged sections');
}

/** Ways around: 200 m north of the track between the two points asked for, on a way that isn't flagged. */
const aroundTo = (body: RouteBody) => {
  const [a, b] = body.points;
  if (!a || !b) throw new Error('expected two points');
  const north = 200 / M_PER_DEG_LAT;
  return straightRoute({
    ...body,
    points: [a, [a[0], a[1] + north], [b[0], b[1] + north], b],
  });
};

async function openTrack(page: Page) {
  await page.getByLabel('Open GPX').setInputFiles({
    name: 'danube.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpx(TRACK)),
  });
  await expect(page.getByTestId('track-name')).toHaveText('Danube ride');
}

const question = (page: Page) => page.getByRole('group', { name: 'Flagged section' });

test('open a GPX track; reroute around one flagged section and keep the other', async ({
  page,
}) => {
  const requests = await stubRouting(page, aroundTo);
  await saveFlags(page);
  await openTrack(page);

  // Opening the track changes nothing about it: no routing until asked. The map doesn't take waypoints meanwhile.
  await expect(page.getByTestId('track-distance')).toHaveText('2.0 km');
  await page.mouse.click(900, 300);
  await expect(page.getByTestId('track-flag-count')).toContainText('Runs along 2 flagged sections');
  expect(requests).toHaveLength(0);

  await expect(question(page)).toContainText('Section 1 of 2 (Overgrown)');
  await question(page).getByRole('button', { name: 'Reroute around it' }).click();
  await expect(page.getByTestId('track-section').first()).toContainText('Rerouted, +400 m');
  // Routed between points on the track either side of the section, avoiding both flags: first from close in.
  const asked = requests.length;
  expect(requests.every((r) => r.points.length === 2)).toBe(true);
  const [a, b] = (requests[0]?.points ?? []).map(([lon]) => (lon - START[0]) * M_PER_DEG_LON);
  expect(a).toBeGreaterThan(420);
  expect(a).toBeLessThan(450);
  expect(b).toBeGreaterThan(750);
  expect(b).toBeLessThan(780);
  for (const r of requests) expect(JSON.stringify(r.custom_model)).toContain('in_flag_1');

  await expect(question(page)).toContainText('Section 2 of 2');
  await question(page).getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByText('Every section answered.')).toBeVisible();
  await expect(page.getByTestId('track-section').nth(1)).toContainText('Kept');
  await expect(page.getByTestId('track-distance')).toHaveText('2.4 km');
  expect(requests).toHaveLength(asked);

  // The export is the track with the way around in it, and nothing else changed.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export GPX' }).click();
  expect((await download).suggestedFilename()).toBe('danube-ride.gpx');
  const exported = readFileSync(await (await download).path(), 'utf8');
  const lats = [...exported.matchAll(/lat="([\d.]+)"/g)].map((m) => Number(m[1]));
  const north = lats.filter((lat) => lat > START[1] + 100 / M_PER_DEG_LAT);
  expect(north.length).toBeGreaterThan(0);
  expect(lats.length - north.length).toBeGreaterThan(TRACK.length - 40);

  // Closing brings the planner back, as it was: the click on the map placed no waypoint.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('region', { name: 'Opened track' })).toHaveCount(0);
  await expect(page.getByText('Click the map to set a start point.')).toBeVisible();
  await expect(page.getByTestId('waypoint')).toHaveCount(0);
});

test('reroute around every flagged section at once', async ({ page }) => {
  await stubRouting(page, aroundTo);
  await saveFlags(page);
  await openTrack(page);

  await question(page).getByRole('button', { name: 'Reroute all 2' }).click();
  await expect(page.getByText('Every section answered.')).toBeVisible();
  await expect(page.getByTestId('track-section')).toHaveText([
    /Rerouted, \+400 m/,
    /Rerouted, \+400 m/,
  ]);
  await expect(page.getByTestId('track-distance')).toHaveText('2.8 km');
});
