import { isDate, isId, lineCoordinates } from './items.ts';

/** A saved route as the app stores it (apps/web/src/types.ts SavedRoute): a line, reopened as a track. */
export interface SavedRoute {
  id: string;
  name: string;
  geometry: { type: 'LineString'; coordinates: number[][] };
  distanceM: number;
  elevation: (typeof ELEVATIONS)[number];
  createdAt: string;
}

const ELEVATIONS = ['file', 'looked_up', 'none'] as const;
/** A recorded ride of 8 hours, a point a second, is about 29,000. */
export const MAX_ROUTE_POINTS = 50_000;
export const MAX_NAME_CHARS = 200;

/** The route in `body`, rebuilt from the fields the app uses, or undefined if it isn't a valid route (as parseFlag). */
export function parseRoute(body: unknown): SavedRoute | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { id, name, geometry, distanceM, elevation, createdAt } = body as Record<string, unknown>;
  const coordinates = lineCoordinates(geometry, MAX_ROUTE_POINTS);
  if (!isId(id) || !isDate(createdAt) || !coordinates) return undefined;
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_CHARS) return undefined;
  if (typeof distanceM !== 'number' || !Number.isFinite(distanceM) || distanceM < 0)
    return undefined;
  if (!ELEVATIONS.includes(elevation as SavedRoute['elevation'])) return undefined;
  return {
    id,
    name: name.trim(),
    geometry: { type: 'LineString', coordinates },
    distanceM,
    elevation: elevation as SavedRoute['elevation'],
    createdAt: new Date(createdAt).toISOString(),
  };
}
