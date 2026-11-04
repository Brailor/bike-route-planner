import { describe, expect, it, vi } from 'vitest';
import { distanceM, segmentLengthsM } from '../geo';
import {
  RoutingError,
  type RoundTripRequest,
  type RouteRequest,
  type RouteResult,
  type RoutingEngine,
} from '../routing/types';
import { cruiseSpeedMs } from '../speed/model';
import type { AvoidFlag, LonLat } from '../types';
import { DETOUR, distinctLoops, findLoops, loopWaypoints, type LoopSearch } from './candidates';

const START: LonLat = [16.3725, 48.2083];
const rider = { weightKg: 75, powerW: 150 };
const search: LoopSearch = {
  start: START,
  durationS: 3600,
  settings: { profile: 'gravel', offroadPreference: 80 },
  rider,
};
const cruise = cruiseSpeedMs('gravel', rider);
/** Within 0.5%: the fake routes and the circle maths measure distance in slightly different ways. */
const expectNear = (actual: number, expected: number) =>
  expect(Math.abs(actual / expected - 1)).toBeLessThan(0.005);

let nextWay = 1;
/** A flat route of `lengthM` on a surface the model doesn't know (so it's timed at cruise speed), on its own ways. */
function flatRoute(lengthM: number, ways = [nextWay++]): RouteResult {
  const coordinates = [
    [0, 0, 200],
    [lengthM / 111_195, 0, 200],
  ];
  return {
    geometry: { type: 'LineString', coordinates },
    distanceM: lengthM,
    ascentM: 0,
    descentM: 0,
    durationS: 0,
    attributes: {
      surface: [{ from: 0, to: 1, value: 'mystery' }],
      roadClass: [{ from: 0, to: 1, value: 'track' }],
      trackType: [{ from: 0, to: 1, value: 'missing' }],
      osmWayId: ways.map((value) => ({ from: 0, to: 1, value })),
      crossing: [],
    },
  };
}

/** Round trips come out at `roundTripFactor` × the distance asked; circle loops at `circleFactor` × theirs. */
function fakeEngine(roundTripFactor = 1, circleFactor = 1) {
  const roundTrips: RoundTripRequest[] = [];
  const routes: RouteRequest[] = [];
  const engine: RoutingEngine = {
    trace: () => Promise.reject(new Error('not used')),
    roundTrip: (request) => {
      roundTrips.push(request);
      return Promise.resolve(flatRoute(request.distanceM * roundTripFactor));
    },
    route: (request) => {
      routes.push(request);
      const straight = segmentLengthsM(request.waypoints).reduce((a, b) => a + b, 0);
      return Promise.resolve(flatRoute(straight * DETOUR * circleFactor));
    },
  };
  return { engine, roundTrips, routes };
}

describe('loopWaypoints', () => {
  it('puts three points on a circle through the start, sized for the distance', () => {
    const points = loopWaypoints(START, 40_000, 0);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual(START);
    expect(points.at(-1)).toEqual(START);
    const straight = segmentLengthsM(points).reduce((a, b) => a + b, 0);
    expectNear(straight, 40_000 / DETOUR);
    // A square: all sides equal, and the far corner straight east at rotation 0.
    const sides = segmentLengthsM(points);
    for (const side of sides) expect(side).toBeCloseTo(sides[0]!, -1);
    expect(points[2]![1]).toBeCloseTo(START[1], 3);
    expect(points[2]![0]).toBeGreaterThan(START[0]);
  });

  it('turns with the rotation', () => {
    const [, , north] = loopWaypoints(START, 40_000, Math.PI / 2);
    expect(north![0]).toBeCloseTo(START[0], 3);
    expect(north![1]).toBeGreaterThan(START[1]);
    expect(distanceM(START, north!)).toBeCloseTo(
      distanceM(START, loopWaypoints(START, 40_000, 0)[2]!),
      -1,
    );
  });
});

describe('distinctLoops', () => {
  it('keeps the first of loops that mostly share their ways', () => {
    const a = { id: 'a', route: flatRoute(1000, [1, 2, 3, 4, 5]) };
    const sameAsA = { id: 'a2', route: flatRoute(1000, [1, 2, 3, 4, 5, 6]) };
    const partly = { id: 'b', route: flatRoute(1000, [1, 2, 3, 4, 7, 8]) }; // 4 of 5 shared: not more than 80%
    const other = { id: 'c', route: flatRoute(1000, [9, 10]) };
    expect(distinctLoops([a, sameAsA, partly, other]).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('findLoops', () => {
  const guess = 3600 * cruise * 0.9;
  const exact = 1 / 0.9; // makes a first-round loop take exactly the target time

  it('first asks for loops in six directions of each kind, sized from the flat cruising speed', async () => {
    const { engine, roundTrips, routes } = fakeEngine(exact, exact);
    const loops = await findLoops(engine, search);
    expect(roundTrips.map((r) => [r.seed, Math.round(r.distanceM)])).toEqual(
      [0, 1, 2, 3, 4, 5].map((seed) => [seed, Math.round(guess)]),
    );
    expect(routes).toHaveLength(6);
    for (const r of routes) {
      expect(r.waypoints).toHaveLength(5);
      expectNear(segmentLengthsM(r.waypoints).reduce((a, b) => a + b, 0) * DETOUR, guess);
    }
    // Each circle points another way.
    const corners = routes.map((r) => r.waypoints[2]!);
    expect(new Set(corners.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`)).size).toBe(
      6,
    );
    // All on target: none asked for again.
    expect(loops).toHaveLength(12);
  });

  it('asks again for loops that are off, in the same direction, scaled by how far off they were', async () => {
    // Round trips come out 20% short, circles 25% long.
    const { engine, roundTrips, routes } = fakeEngine(0.8, 1.25);
    const loops = await findLoops(engine, search);
    expect(roundTrips.map((r) => r.seed)).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
    expectNear(roundTrips[6]!.distanceM, guess / (0.8 * 0.9));
    expect(routes).toHaveLength(12);
    // The same direction: the far corner on the same bearing from the start.
    const bearing = ([lon, lat]: LonLat) =>
      Math.atan2(lat - START[1], (lon - START[0]) * Math.cos(0.84));
    expect(bearing(routes[6]!.waypoints[2]!)).toBeCloseTo(bearing(routes[0]!.waypoints[2]!), 6);
    expect(distanceM(START, routes[6]!.waypoints[2]!)).toBeLessThan(
      distanceM(START, routes[0]!.waypoints[2]!),
    );
    expect(loops).toHaveLength(12);
    for (const loop of loops) expectNear(loop.ride.durationS, 3600);
  });

  it('keeps loops that are close enough, and the first try when the second is further off', async () => {
    const { engine, roundTrips } = fakeEngine();
    const tries = new Map<number, number>();
    const loops = await findLoops(
      {
        ...engine,
        roundTrip: (r, s) => {
          const n = (tries.get(r.seed) ?? 0) + 1;
          tries.set(r.seed, n);
          // Seeds 0–2 on target; 3–5 come out at 70% of what's asked, then far too long on the second try.
          const factor = r.seed < 3 ? exact : n === 1 ? 0.7 : 3;
          return engine.roundTrip({ ...r, distanceM: r.distanceM * factor }, s);
        },
      },
      search,
    );
    expect(roundTrips.map((r) => r.seed).slice(6)).toEqual([3, 4, 5]);
    const roundTripTimes = loops
      .filter((l) => l.source === 'round_trip')
      .map((l) => l.ride.durationS);
    expect(roundTripTimes.slice(0, 3).every((t) => Math.abs(t / 3600 - 1) < 0.005)).toBe(true);
    expect(roundTripTimes.slice(3).every((t) => Math.abs(t / (0.7 * 0.9 * 3600) - 1) < 0.005)).toBe(
      true,
    );
  });

  it('sends the profile settings and flags with every request', async () => {
    const flag = { id: 'f' } as AvoidFlag;
    const { engine, roundTrips, routes } = fakeEngine();
    await findLoops(engine, { ...search, flags: [flag] });
    for (const r of [...roundTrips, ...routes]) {
      expect(r.settings).toEqual(search.settings);
      expect(r.flags).toEqual([flag]);
    }
  });

  it('times each loop with the speed model for the profile and rider', async () => {
    const { engine } = fakeEngine();
    const [loop] = await findLoops(engine, search);
    expectNear(loop!.ride.durationS, loop!.route.distanceM / cruise);
    expect(loop!.ride.timesS).toHaveLength(loop!.route.geometry.coordinates.length);
  });

  it('drops loops that fail, and loops that repeat another', async () => {
    const { engine } = fakeEngine();
    const loops = await findLoops(
      {
        ...engine,
        roundTrip: (r, s) =>
          r.seed % 2 ? engine.roundTrip(r, s) : Promise.reject(new RoutingError('x', 'no_route')),
        route: () => Promise.resolve(flatRoute(30_000, [42])), // every circle on the same ways
      },
      search,
    );
    expect(loops.map((l) => l.source)).toEqual([
      'round_trip',
      'round_trip',
      'round_trip',
      'waypoints',
    ]);
  });

  it('reports the engine’s error when no loop can be made at all', async () => {
    const down = new RoutingError('down', 'unavailable');
    const engine: RoutingEngine = {
      trace: () => Promise.reject(new Error('not used')),
      route: () => Promise.reject(down),
      roundTrip: () => Promise.reject(down),
    };
    await expect(findLoops(engine, search)).rejects.toBe(down);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const { engine } = fakeEngine();
    const roundTrip = vi.fn((r: RoundTripRequest, s?: AbortSignal) => {
      controller.abort();
      return engine.roundTrip(r, s);
    });
    await expect(findLoops({ ...engine, roundTrip }, search, controller.signal)).rejects.toThrow();
    expect(roundTrip.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
