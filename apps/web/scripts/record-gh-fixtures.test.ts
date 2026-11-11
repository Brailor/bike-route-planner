// @vitest-environment node
// Records GraphHopper responses as test fixtures (ADR 0004). Needs the engine on :8989.
// Run: pnpm --filter web fixtures:record
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { flagFromSelection } from '../src/flags/flag';
import { initialSelection } from '../src/flags/selection';
import {
  buildMatchRequest,
  buildRoundTripRequestBody,
  buildRouteRequestBody,
  type GhRouteRequestBody,
} from '../src/routing/graphhopper/request';
import { mapRouteResponse, type GhRouteResponse } from '../src/routing/graphhopper/response';
import type { RoundTripRequest, RouteRequest } from '../src/routing/types';

const GH = process.env.GH_URL ?? 'http://localhost:8989';
const OUT = join(import.meta.dirname, '../src/routing/graphhopper/__fixtures__');

// Short routes in the Lobau (Vienna): mixed asphalt, gravel tracks and untagged ways, small enough to commit.
const CASES: { name: string; input: RouteRequest }[] = [
  {
    name: 'gravel-offroad-80',
    input: {
      waypoints: [
        [16.559, 48.2004],
        [16.59, 48.19],
      ],
      settings: { profile: 'gravel', offroadPreference: 80 },
    },
  },
  {
    name: 'road-via',
    input: {
      waypoints: [
        [16.559, 48.2004],
        [16.575, 48.197],
        [16.59, 48.19],
      ],
      settings: { profile: 'road' },
    },
  },
  {
    name: 'out-of-bounds',
    input: {
      waypoints: [
        [2.35, 48.85],
        [16.37, 48.21],
      ],
      settings: { profile: 'gravel' },
    },
  },
];

async function record(
  name: string,
  input: RouteRequest | RoundTripRequest,
  request: GhRouteRequestBody = buildRouteRequestBody(input as RouteRequest),
) {
  const res = await fetch(`${GH}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const fixture = { name, input, request, status: res.status, response: await res.json() };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(fixture, null, 2) + '\n');
  return fixture;
}

// A short loop from the same start (README M3), kept small enough to commit.
const ROUND_TRIP: RoundTripRequest = {
  start: [16.559, 48.2004],
  distanceM: 10_000,
  seed: 0,
  settings: { profile: 'gravel', offroadPreference: 80 },
};

it.runIf(process.env.RECORD_GH_FIXTURES)('records GraphHopper fixtures', async () => {
  await record('gravel-round-trip', ROUND_TRIP, buildRoundTripRequestBody(ROUND_TRIP));
  for (const { name, input } of CASES) {
    const fixture = await record(name, input);
    if (name !== 'gravel-offroad-80') continue;

    // The route as a track made elsewhere, matched back to the roads (ADR 0012).
    const track = mapRouteResponse(fixture.response as GhRouteResponse).geometry.coordinates;
    const match = buildMatchRequest(track);
    const matched = await fetch(`${GH}/match?${match.query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/gpx+xml' },
      body: match.gpx,
    });
    writeFileSync(
      join(OUT, 'gravel-match.json'),
      JSON.stringify(
        {
          name: 'gravel-match',
          input: track,
          request: match,
          status: matched.status,
          response: await matched.json(),
        },
        null,
        2,
      ) + '\n',
    );

    // Flags drawn on this route as the app makes them: where "Flag a section" puts the handles (there's a way
    // around), and one over the start (the route can't avoid it).
    const route = mapRouteResponse(fixture.response as GhRouteResponse);
    const last = route.geometry.coordinates.length - 1;
    const created = new Date('2026-11-03T00:00:00Z');
    const middle = initialSelection(route.geometry.coordinates);
    const start = { a: 0, b: Math.round(last * 0.3) };
    await record('gravel-flagged', {
      ...input,
      flags: [flagFromSelection(route, middle, {}, 'middle', created)],
    });
    await record('gravel-flagged-start', {
      ...input,
      flags: [flagFromSelection(route, start, {}, 'start', created)],
    });
  }
});
