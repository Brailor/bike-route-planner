import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
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

const gpx = (points: number[][], ele = true) =>
  `<?xml version="1.0"?>
<gpx version="1.1" creator="another planner" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Danube ride</name><trkseg>
${points.map(([lon, lat]) => `    <trkpt lat="${lat}" lon="${lon}">${ele ? '<ele>160</ele>' : ''}</trkpt>`).join('\n')}
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

async function openTrack(page: Page, { ele = true } = {}) {
  await page.getByLabel('Open GPX').setInputFiles({
    name: 'danube.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpx(TRACK, ele)),
  });
  await expect(page.getByTestId('track-name')).toHaveText('Danube ride');
}

const question = (page: Page) => page.getByRole('group', { name: 'Flagged section' });

/**
 * Answers map matching (/gh/match) with the track as sent, on gravel for its first half and asphalt after; returns
 * how many tracks were matched.
 */
async function stubMatch(page: Page) {
  const matched: number[] = [];
  await page.route('**/gh/match?*', async (route) => {
    const gpx = route.request().postData() ?? '';
    const coordinates = [...gpx.matchAll(/lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => [
      Number(m[2]),
      Number(m[1]),
    ]);
    matched.push(coordinates.length);
    const n = coordinates.length - 1;
    const half = Math.floor(n / 2);
    await route.fulfill({
      json: {
        paths: [
          {
            distance: 0,
            time: 0,
            ascend: 0,
            descend: 0,
            points: { type: 'LineString', coordinates },
            details: {
              surface: [
                [0, half, 'gravel'],
                [half, n, 'asphalt'],
              ],
              road_class: [[0, n, 'track']],
              track_type: [[0, n, 'grade2']],
              osm_way_id: [[0, n, 4242]],
            },
          },
        ],
      },
    });
  });
  return matched;
}

// Every opened track is matched to the roads for its surfaces; none of these reach a real engine.
let matched: number[] = [];
test.beforeEach(async ({ page }) => {
  matched = await stubMatch(page);
});

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

test('Clear removes an opened track and the route', async ({ page }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  await page.mouse.click(800, 350);
  await page.mouse.click(950, 500);
  await expect(page.getByTestId('stat-distance')).toBeVisible();
  await openTrack(page);

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('region', { name: 'Opened track' })).toHaveCount(0);
  await expect(page.getByTestId('waypoint')).toHaveCount(0);
  await expect(page.getByText('Click the map to set a start point.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
});

/** A PNG `size` pixels across in one RGBA colour. */
function png(size: number, rgba: [number, number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const row = Buffer.from([0, ...Array.from({ length: size }, () => rgba).flat()]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('a track without elevation gets it from the elevation tiles', async ({ page }) => {
  await stubRouting(page, straightRoute);
  // Elevation tiles 300 m up everywhere (terrarium: 129 × 256 + 44 − 32768).
  const tiles: string[] = [];
  await page.route(/tiles\.mapterhorn\.com/, (route) => {
    tiles.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: png(16, [129, 44, 0, 255]) });
  });
  await openMap(page);
  await openTrack(page, { ele: false });

  await expect(page.getByRole('img', { name: 'Elevation profile, 300 m to 300 m' })).toBeVisible();
  await expect(page.getByTestId('track-elevation')).toContainText('it’s from Mapterhorn');
  expect(tiles.some((u) => u.includes('/12/'))).toBe(true);
});

test('a track without elevation opens without a profile when there’s none to be had', async ({
  page,
}) => {
  await stubRouting(page, straightRoute);
  await page.route(/tiles\.mapterhorn\.com/, (route) => route.fulfill({ status: 503 }));
  await openMap(page);
  await openTrack(page, { ele: false });

  await expect(page.getByTestId('track-elevation')).toContainText('No elevation profile');
  await expect(page.getByTestId('elevation-chart')).toHaveCount(0);
});

test('an opened track shows its surfaces, through a reroute', async ({ page }) => {
  await stubRouting(page, aroundTo);
  await saveFlags(page);
  await openTrack(page);

  const surfaces = page.getByLabel('Surface breakdown');
  await expect(surfaces.getByTestId('surface-gravel')).toHaveText('Gravel 50%');
  await expect(surfaces.getByTestId('surface-paved')).toHaveText('Paved 50%');
  expect(matched).toEqual([TRACK.length]);
  // The way around (asphalt) goes into the track's surfaces, without matching the track again.
  await question(page).getByRole('button', { name: 'Reroute around it' }).click();
  await expect(page.getByTestId('track-section').first()).toContainText('Rerouted');
  await expect(surfaces.getByTestId('surface-paved')).not.toHaveText('Paved 50%');
  await expect(surfaces.getByTestId('surface-gravel')).toBeVisible();
  expect(matched).toHaveLength(1);
});
