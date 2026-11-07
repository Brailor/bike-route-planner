const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two [lon, lat, ...] positions. */
export function distanceM(a: readonly number[], b: readonly number[]): number {
  const [lon1 = 0, lat1 = 0] = a;
  const [lon2 = 0, lat2 = 0] = b;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of each segment i → i+1 of a polyline. */
export function segmentLengthsM(coordinates: readonly (readonly number[])[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < coordinates.length; i++)
    out.push(distanceM(coordinates[i] ?? [], coordinates[i + 1] ?? []));
  return out;
}

/**
 * Where a point falls on the segment a → b: the fraction `t` (0..1) of the way along it, and its distance from the
 * segment in metres. A local flat approximation, fine over a few hundred metres.
 */
export function projectOnSegment(
  point: readonly number[],
  a: readonly number[],
  b: readonly number[],
): { t: number; distanceM: number } {
  const [px = 0, py = 0] = point;
  const kx = distanceM([px - 0.5, py], [px + 0.5, py]); // metres per degree of longitude here
  const ky = distanceM([px, py - 0.5], [px, py + 0.5]);
  const [ax = 0, ay = 0] = a;
  const [bx = 0, by = 0] = b;
  const [x1, y1, x2, y2] = [(ax - px) * kx, (ay - py) * ky, (bx - px) * kx, (by - py) * ky];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = dx || dy ? Math.min(1, Math.max(0, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy))) : 0;
  return { t, distanceM: Math.hypot(x1 + t * dx, y1 + t * dy) };
}
