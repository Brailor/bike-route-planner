import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export interface RouteBody {
  profile: string;
  points: [number, number][];
  custom_model?: { priority?: { multiply_by: string }[] };
}

export interface Fixture {
  status: number;
  response: { paths: { points: { coordinates: number[][] } }[] };
}

/** Recorded GraphHopper responses (ADR 0004). */
export const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../src/routing/graphhopper/__fixtures__', `${name}.json`),
      'utf8',
    ),
  ) as Fixture;

/**
 * Logged in (the containers), flags are kept on the server for the suite's one account, which every test shares.
 * Each page gets its own flags in memory instead, so tests running side by side don't see each other's flags;
 * account-flags.spec.ts tests the server's.
 */
async function stubAccountFlags(page: Page) {
  const flags = new Map<string, unknown>();
  await page.route('**/api/flags**', async (route) => {
    const req = route.request();
    const id = decodeURIComponent(new URL(req.url()).pathname.split('/')[3] ?? '');
    if (req.method() === 'GET') return route.fulfill({ json: [...flags.values()] });
    if (req.method() === 'PUT') flags.set(id, req.postDataJSON());
    if (req.method() === 'DELETE') flags.delete(id);
    await route.fulfill({ status: 204 });
  });
}

const stubbed = new WeakSet<Page>();

export async function openMap(page: Page) {
  // Once per page: a later openMap is a reload, which keeps the page's flags.
  if (process.env.E2E_USER && !stubbed.has(page)) {
    stubbed.add(page);
    await stubAccountFlags(page);
  }
  await page.goto('/');
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
}

/** Answers every /gh/route with `respond(body)`; returns the request bodies as they arrive. */
export async function stubRouting(page: Page, respond: (body: RouteBody) => unknown) {
  const requests: RouteBody[] = [];
  await page.route('**/gh/route', async (route) => {
    const body = route.request().postDataJSON() as RouteBody;
    requests.push(body);
    await route.fulfill({ json: respond(body) });
  });
  return requests;
}

/**
 * A GraphHopper-shaped response running in straight lines through the requested points, so on screen the route
 * always lies on the segments between the waypoint markers.
 */
export function straightRoute({ points }: RouteBody) {
  const coordinates: number[][] = [];
  points.forEach(([lon, lat], i) => {
    const next = points[i + 1];
    if (!next) return void coordinates.push([lon, lat, 200]);
    for (let s = 0; s < 20; s++) {
      const t = s / 20;
      coordinates.push([lon + (next[0] - lon) * t, lat + (next[1] - lat) * t, 200 + 10 * t]);
    }
  });
  const n = coordinates.length - 1;
  const distance = coordinates.slice(1).reduce((sum, [lon, lat], i) => {
    const [plon = 0, plat = 0] = coordinates[i] ?? [];
    const kx = 111_320 * Math.cos((lat! * Math.PI) / 180);
    return sum + Math.hypot((lon! - plon) * kx, (lat! - plat) * 110_540);
  }, 0);
  return {
    paths: [
      {
        distance,
        time: (distance / 5) * 1000,
        ascend: 10 * (points.length - 1),
        descend: 0,
        points: { type: 'LineString', coordinates },
        details: {
          surface: [[0, n, 'asphalt']],
          road_class: [[0, n, 'residential']],
          track_type: [[0, n, 'missing']],
          osm_way_id: [[0, n, 1]],
        },
      },
    ],
  };
}
