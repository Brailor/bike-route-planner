// How routing avoids flags (README M2, ADR 0007): a tight area around each flagged stretch, applied only to the OSM
// ways the stretch runs on, so crossing and nearby roads stay usable.
import buffer from '@turf/buffer';
import type { LineString, MultiPolygon, Point, Polygon } from 'geojson';
import { distanceM, segmentLengthsM } from '../geo';
import type { RouteResult } from '../routing/types';
import type { AvoidFlag } from '../types';

/** Half-width of the area around a stretch. The stretch came from the routing graph itself, so it can be tight. */
export const AREA_RADIUS_M = 5;
/** The area stops this far inside each end, so the same way continuing past the flag isn't caught by it. */
export const END_TRIM_M = 8;

type Position = readonly number[];

/** The point `metres` along a polyline. */
function pointAlong(coords: readonly Position[], lengths: number[], metres: number): number[] {
  let left = metres;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i] ?? 0;
    const a = coords[i] ?? [];
    const b = coords[i + 1] ?? [];
    if (left <= length && length > 0) {
      const t = left / length;
      return [
        (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
        (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
      ];
    }
    left -= length;
  }
  return [...(coords.at(-1) ?? [0, 0])].slice(0, 2);
}

/**
 * The stretch with `metres` cut from both ends ([lon, lat] only). Short stretches lose at most a quarter at each
 * end; a stretch with no length becomes its single point.
 */
export function trimEnds(line: LineString, metres: number): LineString | Point {
  const coords = line.coordinates;
  const lengths = segmentLengthsM(coords);
  const total = lengths.reduce((sum, l) => sum + l, 0);
  if (total === 0) return { type: 'Point', coordinates: [...(coords[0] ?? [0, 0])].slice(0, 2) };
  const cut = Math.min(metres, total / 4);
  const start = pointAlong(coords, lengths, cut);
  const end = pointAlong(coords, lengths, total - cut);
  // Inner vertices that lie strictly between the two cut points, by distance along the line.
  const inner: number[][] = [];
  let along = 0;
  coords.forEach((c, i) => {
    if (i > 0) along += lengths[i - 1] ?? 0;
    if (along > cut && along < total - cut) inner.push([c[0] ?? 0, c[1] ?? 0]);
  });
  return { type: 'LineString', coordinates: [start, ...inner, end] };
}

export function avoidArea(flag: AvoidFlag): Polygon | MultiPolygon {
  const core = trimEnds(flag.geometry, END_TRIM_M);
  const area = buffer(core, AREA_RADIUS_M, { units: 'meters', steps: 4 });
  if (!area) throw new Error(`Could not build an avoid area for flag ${flag.id}`);
  return area.geometry;
}

/** Shortest distance (m) from a point to a polyline, in a local flat approximation (fine at flag scale). */
function distanceToLineM(point: Position, line: readonly Position[]): number {
  const [px = 0, py = 0] = point;
  const kx = distanceM([px - 0.5, py], [px + 0.5, py]); // metres per degree of longitude here
  const ky = distanceM([px, py - 0.5], [px, py + 0.5]);
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax = 0, ay = 0] = line[i] ?? [];
    const [bx = 0, by = 0] = line[i + 1] ?? [];
    const [x1, y1, x2, y2] = [(ax - px) * kx, (ay - py) * ky, (bx - px) * kx, (by - py) * ky];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = dx || dy ? Math.min(1, Math.max(0, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  if (line.length === 1) best = distanceM(point, line[0] ?? []);
  return best;
}

/**
 * Whether the route still runs along a flag: a segment on one of the flag's ways (any way, when the flag has none
 * recorded) whose middle lies on the flagged stretch. That happens when there's no way around.
 */
export function usesFlag(route: RouteResult, flags: readonly AvoidFlag[]): boolean {
  if (!flags.length) return false;
  const coords = route.geometry.coordinates;
  // Measured against what the area is built from, so "used" means "inside the avoided area".
  const cores = new Map(
    flags.map((flag) => {
      const core = trimEnds(flag.geometry, END_TRIM_M);
      return [flag, core.type === 'Point' ? [core.coordinates] : core.coordinates];
    }),
  );
  return route.attributes.osmWayId.some(({ from, to, value }) =>
    flags.some((flag) => {
      if (flag.osmWayIds && (value === null || !flag.osmWayIds.includes(value))) return false;
      for (let i = from; i < to; i++) {
        const a = coords[i] ?? [];
        const b = coords[i + 1] ?? [];
        const middle = [((a[0] ?? 0) + (b[0] ?? 0)) / 2, ((a[1] ?? 0) + (b[1] ?? 0)) / 2];
        if (distanceToLineM(middle, cores.get(flag) ?? []) <= AREA_RADIUS_M) return true;
      }
      return false;
    }),
  );
}
