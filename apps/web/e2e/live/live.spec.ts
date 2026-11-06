// Opt-in: runs against the real GraphHopper on :8989 (`pnpm routing:start`). Catches what the recorded fixtures
// can't: drift between fixtures and the engine, engine-side rejection of our custom models, and real routing quality.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { INITIAL_VIEW, projectToScreen } from '../../src/map/view';
import { buildRouteRequestBody } from '../../src/routing/graphhopper/request';
import { mapRouteResponse, type GhRouteResponse } from '../../src/routing/graphhopper/response';
import type { RouteRequest } from '../../src/routing/types';
import type { LonLat, Profile } from '../../src/types';
import { fixture, openMap } from '../support';

const GH = process.env.GH_URL ?? 'http://localhost:8989';

test.beforeAll(async ({ request }) => {
  const info = await request.get(`${GH}/info`).catch(() => undefined);
  if (!info?.ok()) {
    throw new Error(`GraphHopper is not reachable at ${GH}. Start it with \`pnpm routing:start\`.`);
  }
});

async function route(request: APIRequestContext, input: RouteRequest) {
  const res = await request.post(`${GH}/route`, { data: buildRouteRequestBody(input) });
  const json = (await res.json()) as GhRouteResponse & { message?: string };
  return { status: res.status(), json };
}

test.describe('engine contract', () => {
  // ADR 0004: the e2e suite answers from these recordings, so they must still match what the engine says.
  for (const name of [
    'gravel-offroad-80',
    'road-via',
    'out-of-bounds',
    'gravel-flagged',
    'gravel-flagged-start',
    'gravel-round-trip',
  ]) {
    test(`recorded fixture "${name}" still matches the live engine`, async ({ request }) => {
      const recorded = fixture(name) as ReturnType<typeof fixture> & {
        request: unknown;
        response: { message?: string; paths?: GhRouteResponse['paths'] };
      };
      const res = await request.post(`${GH}/route`, { data: recorded.request });
      expect(res.status()).toBe(recorded.status);
      const live = (await res.json()) as { message?: string; paths?: GhRouteResponse['paths'] };

      if (recorded.status !== 200) {
        expect(live.message).toMatch(/out of bounds/i);
        return;
      }
      const [was] = recorded.response.paths ?? [];
      const [now] = live.paths ?? [];
      expect(Object.keys(now!.details).sort()).toEqual(Object.keys(was!.details).sort());
      expect(now!.distance).toBeGreaterThan(was!.distance * 0.9);
      expect(now!.distance).toBeLessThan(was!.distance * 1.1);
    });
  }

  // ADR 0002: under LM the engine rejects any multiply_by outside [0, 1].
  test('accepts the custom model for every profile setting', async ({ request }) => {
    const waypoints: LonLat[] = [
      [16.559, 48.2004],
      [16.59, 48.19],
    ];
    const rejected: string[] = [];
    for (const profile of ['road', 'gravel', 'mtb'] as Profile[])
      for (const offroadPreference of [0, 25, 50, 75, 100])
        for (const avoidMainRoads of [false, true]) {
          const settings = { profile, offroadPreference, avoidMainRoads };
          const { status, json } = await route(request, { waypoints, settings });
          if (status !== 200) rejected.push(`${JSON.stringify(settings)}: ${json.message}`);
        }
    expect(rejected).toEqual([]);
  });

  test.describe('coverage', () => {
    const cases: [name: string, profile: Profile, waypoints: LonLat[], km: [number, number]][] = [
      [
        'Budapest → Szentendre',
        'gravel',
        [
          [19.0838, 47.5003],
          [19.0756, 47.6694],
        ],
        [18, 30],
      ],
      [
        'Győr → Pannonhalma',
        'gravel',
        [
          [17.6352, 47.6875],
          [17.7547, 47.5527],
        ],
        [17, 28],
      ],
      [
        'Wien Hbf → Sopron (cross-border)',
        'road',
        [
          [16.377, 48.1851],
          [16.5853, 47.6855],
        ],
        [60, 85],
      ],
      [
        'Neusiedl am See → Fertőrákos (cross-border)',
        'gravel',
        [
          [16.8436, 47.9488],
          [16.6656, 47.723],
        ],
        [30, 50],
      ],
    ];
    for (const [name, profile, waypoints, [minKm, maxKm]] of cases) {
      test(name, async ({ request }) => {
        const { status, json } = await route(request, {
          waypoints,
          settings: { profile, offroadPreference: 80 },
        });
        expect(status, json.message).toBe(200);
        const result = mapRouteResponse(json);
        expect(result.distanceM / 1000).toBeGreaterThan(minKm);
        expect(result.distanceM / 1000).toBeLessThan(maxKm);
        expect(result.geometry.coordinates[0]).toHaveLength(3); // elevation present
      });
    }
  });
});

test.describe('app against the live engine', () => {
  // Donau-Auen: Groß-Enzersdorf → Orth an der Donau. Gravel dams and tracks vs. a paved road alternative.
  const START: LonLat = [16.559, 48.2004];
  const END: LonLat = [16.7004, 48.1453];

  const share = async (page: Page, category: 'paved' | 'gravel') => {
    const item = page.getByTestId(`surface-${category}`);
    if (!(await item.count())) return 0;
    return Number(/(\d+)%/.exec(await item.innerText())?.[1] ?? 0);
  };

  const rerouted = (page: Page) =>
    page.waitForResponse((r) => r.url().endsWith('/gh/route') && r.ok());

  async function placeEnds(page: Page) {
    const size = page.viewportSize()!;
    for (const point of [START, END]) {
      const { x, y } = projectToScreen(point, size, INITIAL_VIEW);
      await page.mouse.click(x, y);
    }
    await expect(page.getByTestId('waypoint')).toHaveCount(2);
  }

  const distance = (page: Page) => page.getByTestId('stat-distance').innerText();

  test('profile and off-road slider change the real route', async ({ page }) => {
    await openMap(page);
    await placeEnds(page);
    await expect(page.getByTestId('stat-distance')).toHaveText(/^1\d\.\d km$/);

    const gravelDefault = await share(page, 'gravel');

    let done = rerouted(page);
    await page.getByRole('button', { name: 'Road' }).click();
    await done;
    await expect.poll(() => share(page, 'paved')).toBeGreaterThanOrEqual(90);

    done = rerouted(page);
    await page.getByRole('button', { name: 'Gravel' }).click();
    await done;
    done = rerouted(page);
    await page.getByRole('slider').fill('100');
    await done;
    await expect.poll(() => share(page, 'gravel')).toBeGreaterThan(gravelDefault);

    done = rerouted(page);
    await page.getByRole('slider').fill('0');
    await done;
    await expect.poll(() => share(page, 'paved')).toBeGreaterThanOrEqual(90);
  });

  // README M2 "done when": flagging a section immediately produces an alternative that avoids it, and a fresh route
  // through the same area also avoids it.
  test('a flagged section is avoided now and in a fresh route', async ({ page }) => {
    await openMap(page);
    await placeEnds(page);
    await expect(page.getByTestId('stat-distance')).toBeVisible();
    const before = await distance(page);

    await page.getByRole('button', { name: 'Flag a section' }).click();
    const done = rerouted(page);
    await page.getByRole('button', { name: 'Flag & reroute' }).click();
    await done;
    await expect.poll(() => distance(page)).not.toBe(before);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const around = await distance(page);

    await page.getByRole('button', { name: 'Clear' }).click();
    await placeEnds(page);
    await expect.poll(() => distance(page)).toBe(around);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('warns when a route can only go over a flag', async ({ page }) => {
    await openMap(page);
    await placeEnds(page);
    await expect(page.getByTestId('stat-distance')).toBeVisible();

    // Stretch the flag back to the start: the start point itself sits on it, so there's no way around.
    await page.getByRole('button', { name: 'Flag a section' }).click();
    const handle = (await page.getByTestId('flag-handle').first().boundingBox())!;
    const start = (await page.getByTestId('waypoint').first().boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2, { steps: 15 });
    await page.mouse.up();

    const done = rerouted(page);
    await page.getByRole('button', { name: 'Flag & reroute' }).click();
    await done;
    await expect(page.getByRole('alert')).toContainText('still uses a flagged section');
  });

  test('a section marked on the map without a route is traced and avoided later', async ({
    page,
  }) => {
    await openMap(page);
    await placeEnds(page);
    await expect(page.getByTestId('stat-distance')).toBeVisible();
    const before = await distance(page);

    // Borrow two points on the route: where "Flag a section" puts its handles.
    await page.getByRole('button', { name: 'Flag a section' }).click();
    const ends = [];
    for (const handle of await page.getByTestId('flag-handle').all()) {
      const box = (await handle.boundingBox())!;
      ends.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Clear' }).click();

    // Mark the same stretch with no route: the engine traces it from the two clicks.
    await page.getByRole('button', { name: 'Flag on map' }).click();
    for (const { x, y } of ends) await page.mouse.click(x, y);
    await expect(page.getByTestId('flag-length')).toBeVisible();
    await page.getByRole('button', { name: 'Save flag' }).click();
    await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');

    await placeEnds(page);
    await expect.poll(() => distance(page)).not.toBe(before);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

// README M3, "done when": a 2.5 h gravel ride gives loops within ±10% of the time, and a structured workout's
// intervals land on suitable terrain. Three starts unlike each other stand in for "home" (a setting that comes with
// M4): the city centre (many stops), the flat Lobau, and Hütteldorf at the foot of the Wienerwald (climbs).
test.describe('workout loops against the live engine', () => {
  // A 2.5 h search is ~23 long round trips: ~12 s on a busy laptop, twice that with the other worker searching too.
  test.describe.configure({ timeout: 120_000 });

  const STARTS: Record<string, LonLat> = {
    Stephansplatz: [16.3725, 48.2085],
    Lobau: [16.5203, 48.1712],
    Hütteldorf: [16.2615, 48.1975],
  };

  // 2 h: 20 min easy, then 3 × (10 min at threshold, 10 min easy), then 40 min easy.
  const THRESHOLD = `<workout_file><name>3 x 10 threshold</name><workout>
    <SteadyState Duration="1200" Power="0.6"/>
    <IntervalsT Repeat="3" OnDuration="600" OffDuration="600" OnPower="0.95" OffPower="0.6"/>
    <SteadyState Duration="2400" Power="0.6"/>
  </workout></workout_file>`;

  async function placeStart(page: Page, point: LonLat) {
    const { x, y } = projectToScreen(point, page.viewportSize()!, INITIAL_VIEW);
    await page.mouse.click(x, y);
    await expect(page.getByTestId('waypoint')).toHaveCount(1);
  }

  /** Each card's predicted time off the target, in percent ("on time" is 0). */
  async function timesOff(page: Page) {
    const cards = page.getByTestId('loop-card');
    await expect(cards).toHaveCount(3, { timeout: 90_000 });
    return Promise.all(
      (await cards.all()).map(async (card) => {
        const off = /\((on time|([+−])(\d+)%)\)/.exec(await card.innerText());
        expect(off, await card.innerText()).not.toBeNull();
        return off![1] === 'on time' ? 0 : Number(off![3]) * (off![2] === '−' ? -1 : 1);
      }),
    );
  }

  for (const [name, start] of Object.entries(STARTS)) {
    test(`2.5 h gravel from ${name}: all three loops within ±10% of the time`, async ({ page }) => {
      await openMap(page);
      await placeStart(page, start);
      const workout = page.getByRole('region', { name: 'Workout' });
      await workout.getByLabel('Ride duration (h:mm or minutes)').fill('2:30');
      await workout.getByRole('button', { name: 'Set' }).click();
      await workout.getByRole('button', { name: 'Find loops from the start' }).click();

      for (const off of await timesOff(page)) expect(Math.abs(off)).toBeLessThanOrEqual(10);
    });

    test(`3 × 10 min threshold from ${name}: intervals on suitable terrain, on time`, async ({
      page,
    }) => {
      await openMap(page);
      await placeStart(page, start);
      await page.getByLabel('Load workout file (.zwo, .fit)').setInputFiles({
        name: 'threshold.zwo',
        mimeType: 'application/xml',
        buffer: Buffer.from(THRESHOLD),
      });
      await page.getByRole('button', { name: 'Find loops from the start' }).click();

      for (const off of await timesOff(page)) expect(Math.abs(off)).toBeLessThanOrEqual(10);
      // No loop on offer puts an interval on a descent, and the best one's aren't cut by stops either. (Not "fit the
      // terrain": threshold intervals score that only with climbs, which the Lobau doesn't have.)
      await expect(
        page.getByTestId('loop-card').getByText('An interval falls on a descent'),
      ).toHaveCount(0);
      const best = page.getByTestId('loop-card').first();
      await expect(best).not.toContainText('Intervals cut by stops or descents');
      // The three threshold blocks, shaded on the elevation chart.
      await expect(page.getByTestId('elevation-band')).toHaveCount(3);
    });
  }
});
