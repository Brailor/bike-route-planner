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
