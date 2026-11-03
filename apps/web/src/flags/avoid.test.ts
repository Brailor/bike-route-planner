import type { LineString } from 'geojson';
import { describe, expect, it } from 'vitest';
import baseFixture from '../routing/graphhopper/__fixtures__/gravel-offroad-80.json';
import flaggedFixture from '../routing/graphhopper/__fixtures__/gravel-flagged.json';
import startFixture from '../routing/graphhopper/__fixtures__/gravel-flagged-start.json';
import { mapRouteResponse, type GhRouteResponse } from '../routing/graphhopper/response';
import type { RouteResult } from '../routing/types';
import type { AvoidFlag } from '../types';
import { AREA_RADIUS_M, avoidArea, END_TRIM_M, trimEnds, usesFlag } from './avoid';

const asRoute = (json: unknown) => mapRouteResponse(json as GhRouteResponse);
const flagsOf = (fx: { input: unknown }) => (fx.input as { flags: AvoidFlag[] }).flags;

/** ~1.11 m per 0.00001° of longitude on the equator. */
const M = 1 / 111_195;
const line = (...metres: number[]): LineString => ({
  type: 'LineString',
  coordinates: metres.map((m) => [m * M, 0]),
});

const flag = (geometry: LineString, osmWayIds?: number[]): AvoidFlag => ({
  id: 'f',
  geometry,
  createdAt: '2026-11-03T00:00:00Z',
  ...(osmWayIds && { osmWayIds }),
});

/** A straight route along the equator, one way per span. */
function routeAlong(
  points: number[],
  ways: { from: number; to: number; value: number | null }[],
): RouteResult {
  return {
    geometry: line(...points),
    distanceM: 0,
    ascentM: 0,
    descentM: 0,
    durationS: 0,
    attributes: { surface: [], roadClass: [], trackType: [], osmWayId: ways },
  };
}

describe('trimEnds', () => {
  it('cuts the same distance off both ends, keeping the vertices between', () => {
    const trimmed = trimEnds(line(0, 50, 100), 8) as LineString;
    const metres = trimmed.coordinates.map(([lon]) => Math.round((lon ?? 0) / M));
    expect(metres).toEqual([8, 50, 92]);
  });

  it('takes at most a quarter off each end of a short stretch', () => {
    const trimmed = trimEnds(line(0, 20), 8) as LineString;
    expect(trimmed.coordinates.map(([lon]) => Math.round((lon ?? 0) / M))).toEqual([5, 15]);
  });

  it('turns a stretch without length into its point', () => {
    expect(trimEnds(line(10, 10), 8)).toEqual({ type: 'Point', coordinates: [10 * M, 0] });
  });
});

describe('avoidArea', () => {
  it('hugs the stretch, stopping short of its ends', () => {
    const area = avoidArea(flag(line(0, 100)));
    const ring = area.type === 'Polygon' ? area.coordinates[0]! : area.coordinates[0]![0]!;
    const lons = ring.map(([lon]) => (lon ?? 0) / M);
    const lats = ring.map(([, lat]) => (lat ?? 0) / M);
    // Ends: trimmed by END_TRIM_M, then padded by AREA_RADIUS_M again, so 3 m short of each end.
    expect(Math.min(...lons)).toBeCloseTo(END_TRIM_M - AREA_RADIUS_M, 0);
    expect(Math.max(...lons)).toBeCloseTo(100 - END_TRIM_M + AREA_RADIUS_M, 0);
    expect(Math.max(...lats)).toBeCloseTo(AREA_RADIUS_M, 0);
  });

  it('copes with a flag of a single point', () => {
    expect(avoidArea(flag(line(10, 10))).type).toBe('Polygon');
  });
});

describe('usesFlag', () => {
  const base = asRoute(baseFixture.response);

  it('sees a route running along a flag (recorded: the route the flag was drawn on)', () => {
    expect(usesFlag(base, flagsOf(flaggedFixture))).toBe(true);
  });

  it('sees a route that went around it (recorded: rerouted with the flag)', () => {
    expect(usesFlag(asRoute(flaggedFixture.response), flagsOf(flaggedFixture))).toBe(false);
  });

  it('sees a route that couldn’t avoid it (recorded: flag over the start)', () => {
    expect(usesFlag(asRoute(startFixture.response), flagsOf(startFixture))).toBe(true);
  });

  it('ignores other ways through the flagged stretch, e.g. a crossing road', () => {
    const route = routeAlong([40, 60], [{ from: 0, to: 1, value: 99 }]);
    expect(usesFlag(route, [flag(line(0, 100), [7])])).toBe(false);
  });

  it('ignores the same way continuing past the end of the flag', () => {
    const route = routeAlong([100, 104, 150], [{ from: 0, to: 2, value: 7 }]);
    expect(usesFlag(route, [flag(line(0, 100), [7])])).toBe(false);
  });

  it('uses any way when the flag has none recorded', () => {
    const route = routeAlong([40, 60], [{ from: 0, to: 1, value: null }]);
    expect(usesFlag(route, [flag(line(0, 100))])).toBe(true);
  });

  it('is false without flags', () => {
    expect(usesFlag(base, [])).toBe(false);
  });
});
