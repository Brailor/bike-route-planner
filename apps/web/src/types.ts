// Domain model (README "Data model"). Coordinates are always [lon, lat] (GeoJSON order).
import type { LineString } from 'geojson';

export type LonLat = [lon: number, lat: number];

export type Profile = 'road' | 'gravel' | 'mtb';

export interface ProfileSettings {
  profile: Profile;
  /** 0..100, gravel/MTB only. 50 is the profile's own balance; higher prefers unpaved, lower prefers paved. */
  offroadPreference?: number;
  avoidMainRoads?: boolean;
}

export interface PlannedRoute {
  id: string;
  name: string;
  waypoints: LonLat[];
  settings: ProfileSettings;
  /** Elevation as the 3rd coordinate. */
  geometry: LineString;
  distanceM: number;
  ascentM: number;
  predictedDurationS?: number;
  createdAt: string;
}

export interface AvoidFlag {
  id: string;
  geometry: LineString;
  osmWayIds?: number[];
  reason?: 'overgrown' | 'private' | 'too_steep' | 'bad_surface' | 'other';
  note?: string;
  createdAt: string;
}

export interface Workout {
  id: string;
  name: string;
  totalDurationS: number;
  intervals: {
    startS: number;
    durationS: number;
    targetPctFtp: number;
    kind: 'endurance' | 'tempo' | 'threshold' | 'vo2' | 'recovery';
  }[];
}

export interface UserSettings {
  home?: LonLat;
  ftpW?: number;
  weightKg?: number;
}
