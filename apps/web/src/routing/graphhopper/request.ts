import type { LonLat } from '../../types';
import type { RoundTripRequest, RouteRequest } from '../types';
import { buildCustomModel, type CustomModel } from './customModel';

/** Path details the app needs (surface breakdown, colouring, flags, stops). Must be in graph.encoded_values. */
export const DETAILS = ['surface', 'road_class', 'track_type', 'osm_way_id', 'crossing'] as const;

export interface GhRouteRequestBody {
  profile: string;
  points: [number, number][];
  points_encoded: false;
  elevation: true;
  instructions: false;
  details: readonly string[];
  custom_model?: CustomModel;
  pass_through?: boolean;
  algorithm?: 'round_trip';
  'round_trip.distance'?: number;
  'round_trip.seed'?: number;
}

/** Traces use the most permissive bike profile, so any rideable way can be marked. */
export const TRACE_PROFILE = 'mtb';
/**
 * Makes distance outweigh the profile's preferences, so a trace takes the most direct way between the clicks: the
 * stretch the user means. Live (Donau-Auen): mtb 15.4 km by default, 13.1 km with this; car 13.2 km.
 */
export const TRACE_DISTANCE_INFLUENCE = 5000;

export function buildTraceRequestBody(points: LonLat[]): GhRouteRequestBody {
  return {
    profile: TRACE_PROFILE,
    points: points.map(([lon, lat]) => [lon, lat]),
    points_encoded: false,
    elevation: true,
    instructions: false,
    details: DETAILS,
    custom_model: { distance_influence: TRACE_DISTANCE_INFLUENCE },
  };
}

export function buildRouteRequestBody({
  waypoints,
  settings,
  flags,
  passThrough,
}: RouteRequest): GhRouteRequestBody {
  const customModel = buildCustomModel(settings, flags);
  return {
    profile: settings.profile,
    points: waypoints.map(([lon, lat]) => [lon, lat]),
    points_encoded: false,
    elevation: true,
    instructions: false,
    details: DETAILS,
    ...(customModel && { custom_model: customModel }),
    ...(passThrough && { pass_through: true }),
  };
}

/**
 * GraphHopper's round trip: from one point, out through points it picks by distance and seed, and back. Live (Vienna,
 * gravel): 60 km asked gives 56–65 km, about 0.3 s each; 30 km gives 24–30 km.
 */
export function buildRoundTripRequestBody({
  start,
  distanceM,
  seed,
  settings,
  flags,
}: RoundTripRequest): GhRouteRequestBody {
  return {
    ...buildRouteRequestBody({ waypoints: [start], settings, ...(flags && { flags }) }),
    algorithm: 'round_trip',
    'round_trip.distance': Math.round(distanceM),
    'round_trip.seed': seed,
  };
}
