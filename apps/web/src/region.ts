// Where the app works today: the area the routing graph covers (Austria + Hungary, README). Kept in one place so
// it widens with the graph; the long-term target is the whole world.
import type { LonLat } from './types';

/** [west, south, east, north]. A box around both countries, so it also takes in some of their neighbours' edges. */
export const SUPPORTED_BOUNDS = [9.5, 45.7, 22.95, 49.05] as const;

/** For messages, e.g. "No matches in …". */
export const SUPPORTED_REGION_NAME = 'Austria or Hungary';

export function inSupportedRegion([lon, lat]: LonLat): boolean {
  const [west, south, east, north] = SUPPORTED_BOUNDS;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}
