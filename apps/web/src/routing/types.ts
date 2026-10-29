// Engine-neutral routing contract (ADR 0003). The UI only ever sees these types.
import type { LineString } from 'geojson';
import type { LonLat, ProfileSettings } from '../types';

export interface RouteRequest {
  waypoints: LonLat[];
  settings: ProfileSettings;
}

/** A run of geometry segments [from, to) (indices into the route's coordinates) sharing one attribute value. */
export interface Span<T> {
  from: number;
  to: number;
  value: T;
}

/** Per-segment way attributes, using OSM's lowercase vocabulary. `null` / 'missing' when the tag is absent. */
export interface RouteAttributes {
  surface: Span<string>[];
  roadClass: Span<string>[];
  trackType: Span<string>[];
  osmWayId: Span<number | null>[];
}

export interface RouteResult {
  /** [lon, lat, ele] coordinates. */
  geometry: LineString;
  distanceM: number;
  ascentM: number;
  descentM: number;
  /** The engine's own time estimate; replaced by the speed model in M3. */
  durationS: number;
  attributes: RouteAttributes;
}

export interface RoutingEngine {
  route(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult>;
}

export class RoutingError extends Error {
  constructor(
    message: string,
    /** 'no_route' when the engine can't connect the points, 'unavailable' when it can't be reached. */
    readonly kind: 'no_route' | 'unavailable' | 'bad_request',
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}
