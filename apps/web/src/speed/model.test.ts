import { describe, expect, it } from 'vitest';
import type { RouteResult } from '../routing/types';
import { fixtureRoute } from '../test/route';
import { airDensity, speedForPower } from './physics';
import { BIKE_SETUPS, predictRide, segmentGrades } from './model';

/** Metres → degrees of longitude on the equator. */
const M = 1 / 111_195;

/** A straight route east along the equator: points every `step` m with the given elevations, all one surface. */
function routeAlong(elevations: number[], step: number, surface = 'asphalt'): RouteResult {
  const n = elevations.length - 1;
  return {
    geometry: {
      type: 'LineString',
      coordinates: elevations.map((ele, i) => [i * step * M, 0, ele]),
    },
    distanceM: n * step,
    ascentM: 0,
    descentM: 0,
    durationS: 0,
    attributes: {
      surface: [{ from: 0, to: n, value: surface }],
      roadClass: [{ from: 0, to: n, value: 'residential' }],
      trackType: [{ from: 0, to: n, value: 'missing' }],
      osmWayId: [{ from: 0, to: n, value: 1 }],
    },
  };
}

const flat = (km: number, surface?: string) =>
  routeAlong(
    Array.from({ length: km * 10 + 1 }, () => 200),
    100,
    surface,
  );
const slope = (km: number, grade: number) =>
  routeAlong(
    Array.from({ length: km * 10 + 1 }, (_, i) => 200 + i * 100 * grade),
    100,
  );

const rider = { weightKg: 75, powerW: 200 };

describe('segmentGrades', () => {
  it('reads a steady slope', () => {
    for (const g of segmentGrades(slope(1, 0.05).geometry.coordinates))
      expect(g).toBeCloseTo(0.05, 6);
  });

  it('smooths a single bad elevation sample over the window', () => {
    const coords = routeAlong([200, 200, 200, 230, 200, 200, 200], 10).geometry.coordinates;
    // Point to point that spike is a 300% wall; over 100 m it's gone back to flat on either side.
    expect(Math.max(...segmentGrades(coords, 1).map(Math.abs))).toBeCloseTo(3, 3);
    expect(Math.max(...segmentGrades(coords).map(Math.abs))).toBeLessThan(0.01);
  });

  it('counts points without elevation as flat', () => {
    expect(
      segmentGrades([
        [0, 0],
        [100 * M, 0],
      ]),
    ).toEqual([0]);
  });
});

describe('predictRide', () => {
  it('rides 20 km of flat asphalt on a gravel bike at a plausible endurance pace', () => {
    const { durationS } = predictRide(flat(20), 'gravel', rider);
    const kmh = 20 / (durationS / 3600);
    expect(kmh).toBeGreaterThan(28);
    expect(kmh).toBeLessThan(33);
  });

  it('gives the time at every point, ending at the duration', () => {
    const { durationS, timesS } = predictRide(flat(1), 'road', rider);
    expect(timesS).toHaveLength(11);
    expect(timesS[0]).toBe(0);
    expect(timesS.at(-1)).toBe(durationS);
    for (let i = 1; i < timesS.length; i++) expect(timesS[i]!).toBeGreaterThan(timesS[i - 1]!);
  });

  it('is slower on gravel and ground than on asphalt, at the same power', () => {
    const paved = predictRide(flat(5), 'gravel', rider).durationS;
    const gravel = predictRide(flat(5, 'gravel'), 'gravel', rider).durationS;
    const ground = predictRide(flat(5, 'dirt'), 'gravel', rider).durationS;
    expect(gravel).toBeGreaterThan(paved);
    expect(ground).toBeGreaterThan(gravel);
  });

  it('is faster on a road bike than on an MTB on asphalt', () => {
    expect(predictRide(flat(10), 'road', rider).durationS).toBeLessThan(
      predictRide(flat(10), 'mtb', rider).durationS,
    );
  });

  it('climbs slower and descends faster, but no faster than the surface allows', () => {
    const up = predictRide(slope(2, 0.06), 'road', rider).durationS;
    const down = predictRide(slope(2, -0.08), 'road', rider);
    expect(up).toBeGreaterThan(predictRide(flat(2), 'road', rider).durationS);
    // A 8% descent at 200 W would run past 60 km/h; the paved cap holds it there.
    expect(2000 / down.durationS).toBeCloseTo(BIKE_SETUPS.road.maxKmh.paved / 3.6, 3);
  });

  it('walks the steepest ramps rather than crawling', () => {
    const wall = predictRide(slope(0.5, 0.3), 'road', { weightKg: 90, powerW: 50 });
    expect(500 / wall.durationS).toBeCloseTo(1.1, 3);
  });

  it('pushes rider, kit and bike up a climb', () => {
    // 6% for 1 km on asphalt: the whole route at one speed, from rider 75 + kit 2 + gravel bike 10 kg.
    const { durationS } = predictRide(slope(1, 0.06), 'gravel', rider);
    const setup = BIKE_SETUPS.gravel;
    const v = speedForPower(200, 0.06, {
      massKg: 75 + 2 + setup.bikeKg,
      crr: setup.crr.paved,
      cdA: setup.cdA,
      rho: airDensity(230),
    });
    expect(durationS).toBeCloseTo(1000 / v, -1);
  });

  it('rides faster in the thinner air up high', () => {
    const high = routeAlong(
      Array.from({ length: 51 }, () => 2000),
      100,
    );
    expect(predictRide(high, 'road', rider).durationS).toBeLessThan(
      predictRide(flat(5), 'road', rider).durationS,
    );
  });

  it('isn’t thrown by a bad elevation sample', () => {
    // 2 km of flat with points every 10 m (as on real routes) and one 10 m spike. Smoothed: under 1% slower;
    // point to point the up-ramp would be walked (~3.6% slower).
    const level = Array.from({ length: 201 }, () => 200);
    const spiked = [...level];
    spiked[100] = 210;
    const noisy = predictRide(routeAlong(spiked, 10), 'road', rider).durationS;
    expect(noisy / predictRide(routeAlong(level, 10), 'road', rider).durationS).toBeLessThan(1.02);
  });

  it('predicts a real recorded route', () => {
    // Lobau, 3.4 km, flat, a third unpaved: around 12–20 minutes at an easy 150 W.
    const { durationS } = predictRide(fixtureRoute, 'gravel', { weightKg: 75, powerW: 150 });
    expect(durationS / 60).toBeGreaterThan(6);
    expect(durationS / 60).toBeLessThan(12);
  });
});
