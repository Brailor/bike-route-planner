// Positions in metres east (x) and north (y) of a point in Vienna, for tests that need geometry with known lengths.
import { distanceM } from '../geo';
import type { RouteResult } from '../routing/types';
import type { AvoidFlag } from '../types';

const ORIGIN = [16.4, 48.2] as const;
const KX = distanceM([ORIGIN[0] - 0.5, ORIGIN[1]], [ORIGIN[0] + 0.5, ORIGIN[1]]);
const KY = distanceM([ORIGIN[0], ORIGIN[1] - 0.5], [ORIGIN[0], ORIGIN[1] + 0.5]);

export const at = (x: number, y = 0) => [ORIGIN[0] + x / KX, ORIGIN[1] + y / KY];

/** Back to metres, rounded, for readable expectations. */
export const metres = (p: readonly number[]) => [
  Math.round(((p[0] ?? 0) - ORIGIN[0]) * KX),
  Math.round(((p[1] ?? 0) - ORIGIN[1]) * KY),
];

/** Points every `step` metres from x0 to x1 (either way) at height y. */
export function east(x0: number, x1: number, step = 10, y = 0): number[][] {
  const n = Math.round(Math.abs(x1 - x0) / step);
  return Array.from({ length: n + 1 }, (_, i) => at(x0 + ((x1 - x0) * i) / n, y));
}

export const flagOn = (id: string, coordinates: number[][], osmWayIds?: number[]): AvoidFlag => ({
  id,
  geometry: { type: 'LineString', coordinates },
  ...(osmWayIds && { osmWayIds }),
  createdAt: '2026-11-06T00:00:00.000Z',
});

/** An engine answer along `coordinates`, all on one OSM way. */
export function routeAlong(coordinates: number[][], wayId: number): RouteResult {
  return {
    geometry: { type: 'LineString', coordinates },
    distanceM: 0,
    ascentM: 0,
    descentM: 0,
    durationS: 0,
    attributes: {
      surface: [],
      roadClass: [],
      trackType: [],
      crossing: [],
      osmWayId: [{ from: 0, to: coordinates.length - 1, value: wayId }],
    },
  };
}
