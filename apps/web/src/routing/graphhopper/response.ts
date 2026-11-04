import type { RouteResult, Span } from '../types';
import { RoutingError } from '../types';

type GhDetail = [from: number, to: number, value: string | number | null];

export interface GhRouteResponse {
  paths: {
    distance: number;
    time: number;
    ascend: number;
    descend: number;
    points: { type: 'LineString'; coordinates: number[][] };
    details: Record<string, GhDetail[] | undefined>;
  }[];
}

export interface GhErrorResponse {
  message: string;
}

const spans = <T>(detail: GhDetail[] | undefined, convert: (v: GhDetail[2]) => T): Span<T>[] =>
  (detail ?? []).map(([from, to, value]) => ({ from, to, value: convert(value) }));

const asTag = (v: GhDetail[2]) => (v === null ? 'missing' : String(v));
const asWayId = (v: GhDetail[2]) => (typeof v === 'number' ? v : null);

export function mapRouteResponse(json: GhRouteResponse): RouteResult {
  const path = json.paths[0];
  if (!path) throw new RoutingError('GraphHopper returned no path', 'no_route');
  return {
    geometry: { type: 'LineString', coordinates: path.points.coordinates },
    distanceM: path.distance,
    ascentM: path.ascend,
    descentM: path.descend,
    durationS: path.time / 1000,
    attributes: {
      surface: spans(path.details.surface, asTag),
      roadClass: spans(path.details.road_class, asTag),
      trackType: spans(path.details.track_type, asTag),
      osmWayId: spans(path.details.osm_way_id, asWayId),
      crossing: spans(path.details.crossing, asTag),
    },
  };
}

// GraphHopper answers unroutable requests with HTTP 400 and one of these messages.
const NO_ROUTE = /connection between locations not found|cannot find point|out of bounds/i;

export function mapErrorResponse(status: number, json: GhErrorResponse | undefined): RoutingError {
  const message = json?.message ?? `GraphHopper responded with HTTP ${status}`;
  if (status >= 500) return new RoutingError(message, 'unavailable');
  if (NO_ROUTE.test(message)) return new RoutingError(message, 'no_route');
  return new RoutingError(message, 'bad_request');
}
