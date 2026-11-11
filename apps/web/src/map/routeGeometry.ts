import type { Feature, FeatureCollection, LineString } from 'geojson';
import { distanceM } from '../geo';
import { segmentSurfaces, type SurfaceCategory } from '../route/surface';
import type { RouteResult } from '../routing/types';
import type { LonLat } from '../types';

export interface SurfaceRunProps {
  category: SurfaceCategory;
  inferred: boolean;
}

/** Consecutive segments with the same surface class merged into one line, for colouring the route. */
export function surfaceRuns(
  route: Pick<RouteResult, 'geometry' | 'attributes'>,
): FeatureCollection<LineString, SurfaceRunProps> {
  const coords = route.geometry.coordinates;
  const features: Feature<LineString, SurfaceRunProps>[] = [];
  let current: Feature<LineString, SurfaceRunProps> | undefined;
  segmentSurfaces(route).forEach(({ category, inferred }, i) => {
    const a = coords[i];
    const b = coords[i + 1];
    if (!a || !b) return;
    if (
      current &&
      current.properties.category === category &&
      current.properties.inferred === inferred
    ) {
      current.geometry.coordinates.push(b);
    } else {
      current = {
        type: 'Feature',
        properties: { category, inferred },
        geometry: { type: 'LineString', coordinates: [a, b] },
      };
      features.push(current);
    }
  });
  return { type: 'FeatureCollection', features };
}

/** Index of the route coordinate closest to a point (linear scan; routes are a few thousand points). */
export function nearestIndex(coordinates: readonly (readonly number[])[], point: LonLat): number {
  let best = 0;
  let bestDist = Infinity;
  coordinates.forEach((c, i) => {
    const d = distanceM(c, point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/**
 * Where a waypoint dragged out of the route line at coordinate `routeIndex` belongs in the waypoint list: after the
 * last waypoint the route passes before that point.
 */
export function insertionIndex(
  coordinates: readonly (readonly number[])[],
  waypoints: readonly LonLat[],
  routeIndex: number,
): number {
  const waypointIndices = waypoints.map((w) => nearestIndex(coordinates, w));
  let insertAt = 1;
  for (let i = 1; i < waypointIndices.length - 1; i++) {
    if ((waypointIndices[i] ?? 0) <= routeIndex) insertAt = i + 1;
  }
  return Math.min(insertAt, Math.max(1, waypoints.length - 1));
}
