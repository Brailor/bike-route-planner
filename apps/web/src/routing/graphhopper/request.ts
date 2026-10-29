import type { RouteRequest } from '../types';
import { buildCustomModel, type CustomModel } from './customModel';

/** Path details the app needs (surface breakdown, colouring, flags). Must be in graph.encoded_values. */
export const DETAILS = ['surface', 'road_class', 'track_type', 'osm_way_id'] as const;

export interface GhRouteRequestBody {
  profile: string;
  points: [number, number][];
  points_encoded: false;
  elevation: true;
  instructions: false;
  details: readonly string[];
  custom_model?: CustomModel;
}

export function buildRouteRequestBody({ waypoints, settings }: RouteRequest): GhRouteRequestBody {
  const customModel = buildCustomModel(settings);
  return {
    profile: settings.profile,
    points: waypoints.map(([lon, lat]) => [lon, lat]),
    points_encoded: false,
    elevation: true,
    instructions: false,
    details: DETAILS,
    ...(customModel && { custom_model: customModel }),
  };
}
