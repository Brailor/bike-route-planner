// A loop's riding direction, and the waypoints to ride it the other way (README M3). Reversing the line itself would
// ride one-way streets the wrong way, so the engine routes the reversed points instead.
import { segmentLengthsM } from '../geo';
import type { LonLat } from '../types';

/**
 * Points taken from the loop for the engine to route back through, with pass-through so it doesn't turn back at
 * them. Live (18 loops, 1.5 h gravel): with 12 the reversed loop came out 0.94–1.04 × the length, median 1.00, on
 * 76% of the same ways (the rest mostly the other side of one-ways and roads with a cycle path each side); with 4 it
 * cut corners (median 0.88); with 20 it began to add detours (up to 1.14).
 */
export const REVERSE_VIAS = 12;

/**
 * True when the loop runs clockwise on the map: the sign of its shoelace area, negative for clockwise with latitude
 * pointing up. (Degrees of longitude are shorter than degrees of latitude, but that scales the area, not its sign.)
 */
export function isClockwise(coordinates: readonly (readonly number[])[]): boolean {
  let area = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const [x1 = 0, y1 = 0] = coordinates[i] ?? [];
    const [x2 = 0, y2 = 0] = coordinates[(i + 1) % coordinates.length] ?? [];
    area += x1 * y2 - x2 * y1;
  }
  return area < 0;
}

/** The point at `distanceM` along the line. */
function pointAt(
  coordinates: readonly (readonly number[])[],
  along: number[],
  distanceM: number,
): LonLat {
  let i = 1;
  while (i < along.length - 1 && (along[i] ?? 0) < distanceM) i++;
  const [ax = 0, ay = 0] = coordinates[i - 1] ?? [];
  const [bx = 0, by = 0] = coordinates[i] ?? [];
  const a = along[i - 1] ?? 0;
  const b = along[i] ?? 0;
  const t = b > a ? (distanceM - a) / (b - a) : 0;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/**
 * Waypoints for riding the loop the other way: its start, `REVERSE_VIAS` points evenly spaced along it in reverse
 * order, and the start again.
 */
export function reverseWaypoints(coordinates: readonly (readonly number[])[]): LonLat[] {
  const along = [0];
  for (const l of segmentLengthsM(coordinates)) along.push((along.at(-1) ?? 0) + l);
  const total = along.at(-1) ?? 0;
  const [x = 0, y = 0] = coordinates[0] ?? [];
  const start: LonLat = [x, y];
  const vias = Array.from({ length: REVERSE_VIAS }, (_, k) =>
    pointAt(coordinates, along, (total * (REVERSE_VIAS - k)) / (REVERSE_VIAS + 1)),
  );
  return [start, ...vias, start];
}
