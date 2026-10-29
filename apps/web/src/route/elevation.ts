import { segmentLengthsM } from '../geo';

export interface ElevationPoint {
  /** Index into the route's coordinates, for linking the chart to the map. */
  index: number;
  distanceM: number;
  elevationM: number;
}

/** Cumulative distance vs elevation for a [lon, lat, ele] polyline. Points without elevation are skipped. */
export function elevationProfile(coordinates: readonly (readonly number[])[]): ElevationPoint[] {
  const lengths = segmentLengthsM(coordinates);
  const out: ElevationPoint[] = [];
  let distance = 0;
  coordinates.forEach((c, index) => {
    if (index > 0) distance += lengths[index - 1] ?? 0;
    const ele = c[2];
    if (ele !== undefined) out.push({ index, distanceM: distance, elevationM: ele });
  });
  return out;
}

/** The profile point closest to a given distance along the route (binary search). */
export function pointAtDistance(
  profile: readonly ElevationPoint[],
  distanceM: number,
): ElevationPoint | undefined {
  if (!profile.length) return undefined;
  let lo = 0;
  let hi = profile.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((profile[mid]?.distanceM ?? 0) < distanceM) lo = mid + 1;
    else hi = mid;
  }
  const after = profile[lo];
  const before = profile[lo - 1];
  if (before && after && distanceM - before.distanceM < after.distanceM - distanceM) return before;
  return after;
}
