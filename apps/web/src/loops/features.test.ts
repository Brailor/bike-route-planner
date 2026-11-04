import { describe, expect, it } from 'vitest';
import type { RouteResult, Span } from '../routing/types';
import { findClimbs, findStops, findStretches } from './features';

const STEP_M = 10;
/** Metres → degrees of longitude on the equator. */
const M = 1 / 111_195;

/** A straight route east along the equator, a point every 10 m, with these elevations. */
function route(
  elevations: number[],
  {
    crossing = [],
    roadClass = 'residential',
  }: { crossing?: Span<string>[]; roadClass?: string | Span<string>[] } = {},
): RouteResult {
  const n = elevations.length - 1;
  return {
    geometry: {
      type: 'LineString',
      coordinates: elevations.map((ele, i) => [i * STEP_M * M, 0, ele]),
    },
    distanceM: n * STEP_M,
    ascentM: 0,
    descentM: 0,
    durationS: 0,
    attributes: {
      surface: [],
      roadClass: typeof roadClass === 'string' ? [{ from: 0, to: n, value: roadClass }] : roadClass,
      trackType: [],
      osmWayId: [],
      crossing,
    },
  };
}

/** Elevations rising or falling by `perStep` m for `steps` points after `start`. */
const slope = (start: number, perStep: number, steps: number) =>
  Array.from({ length: steps }, (_, i) => start + perStep * (i + 1));
const flat = (ele: number, steps: number) => Array<number>(steps).fill(ele);
/** Two seconds per point. */
const times = (r: RouteResult) => r.geometry.coordinates.map((_, i) => i * 2);

const climbsOf = (elevations: number[]) => {
  const r = route(elevations);
  return findClimbs(r.geometry.coordinates, times(r));
};

describe('findClimbs', () => {
  it('finds a climb from its foot to its top, with length, gain, gradient and riding time', () => {
    // 20 flat points, then 5% for 1 km (100 steps of 0.5 m), then flat.
    const [climb, ...rest] = climbsOf([
      ...flat(200, 21),
      ...slope(200, 0.5, 100),
      ...flat(250, 20),
    ]);
    expect(rest).toEqual([]);
    expect(climb).toMatchObject({ from: 20, to: 120, gainM: 50, durationS: 200 });
    expect(climb!.lengthM).toBeCloseTo(1000, -1);
    expect(climb!.grade).toBeCloseTo(0.05, 3);
  });

  it('rides through dips smaller than the tolerance', () => {
    const up = slope(100, 1, 30); // to 130
    const dip = slope(130, -1, 8); // to 122
    const climbs = climbsOf([100, ...up, ...dip, ...slope(122, 1, 30)]); // to 152
    expect(climbs).toHaveLength(1);
    expect(climbs[0]).toMatchObject({ from: 0, gainM: 52 });
  });

  it('splits climbs at a bigger dip', () => {
    const climbs = climbsOf([
      100,
      ...slope(100, 1, 30),
      ...slope(130, -1, 15),
      ...slope(115, 1, 30),
    ]);
    expect(climbs.map((c) => c.gainM)).toEqual([30, 30]);
    expect(climbs[1]!.from).toBe(45); // the bottom of the dip
  });

  it('starts at the lowest point after a descent', () => {
    const climbs = climbsOf([150, ...slope(150, -1, 50), ...slope(100, 1, 40)]);
    expect(climbs).toEqual([expect.objectContaining({ from: 50, to: 90, gainM: 40 })]);
  });

  it('ignores rises too small or too gentle', () => {
    expect(climbsOf([100, ...slope(100, 1, 15), ...slope(115, -1, 15)])).toEqual([]); // 15 m
    expect(climbsOf([100, ...slope(100, 0.125, 200)])).toEqual([]); // 25 m over 2 km: 1.25%
  });
});

describe('findStops', () => {
  const crossing = (from: number, value: string): Span<string> => ({ from, to: from + 1, value });

  it('stops at lights and level crossings, and at zebra crossings only when riding the path across', () => {
    const r = route(flat(0, 101), {
      crossing: [
        crossing(10, 'traffic_signals'),
        crossing(30, 'marked'), // the road over a zebra: no stop
        crossing(50, 'railway_barrier'),
        crossing(70, 'uncontrolled'), // the cycleway crossing a road
        crossing(85, 'no'),
        crossing(95, 'missing'),
      ],
      roadClass: [
        { from: 0, to: 60, value: 'secondary' },
        { from: 60, to: 100, value: 'cycleway' },
      ],
    });
    expect(findStops(r)).toEqual([10, 50, 70]);
  });

  it('counts crossings within 30 m as one stop', () => {
    const r = route(flat(0, 101), {
      crossing: [
        crossing(10, 'traffic_signals'),
        crossing(12, 'traffic_signals'), // 20 m on: the same junction
        crossing(16, 'traffic_signals'), // 60 m from the first: another stop
        crossing(40, 'railway'),
      ],
    });
    expect(findStops(r)).toEqual([10, 16, 40]);
  });
});

describe('findStretches', () => {
  it('cuts the route at its stops', () => {
    const r = route(flat(0, 101), {
      crossing: [
        { from: 0, to: 1, value: 'traffic_signals' }, // at the start: no empty stretch
        { from: 40, to: 41, value: 'traffic_signals' },
        { from: 100, to: 101, value: 'traffic_signals' },
      ],
    });
    const stretches = findStretches(r, times(r));
    expect(stretches.map(({ from, to, durationS }) => [from, to, durationS])).toEqual([
      [0, 40, 80],
      [40, 100, 120],
    ]);
    expect(stretches[0]!.lengthM).toBeCloseTo(400, -1);
  });

  it('is the whole route without stops', () => {
    const r = route(flat(0, 51));
    expect(findStretches(r, times(r))).toEqual([
      expect.objectContaining({ from: 0, to: 50, durationS: 100 }),
    ]);
  });
});
