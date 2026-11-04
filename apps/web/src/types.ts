// Domain model: the source of truth for routes, flags, workouts and settings. Coordinates are always [lon, lat]
// (GeoJSON order).
import type { LineString } from 'geojson';

export type LonLat = [lon: number, lat: number];

export type Profile = 'road' | 'gravel' | 'mtb';

export interface ProfileSettings {
  profile: Profile;
  /** 0..100, gravel only (MTB is always 100). 50 is the profile's own balance; higher prefers unpaved, lower paved. */
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

/** A power target: a share of FTP, or watts (Garmin workouts are often in watts). */
export type PowerTarget = { pctFtp: number } | { watts: number };

export interface WorkoutInterval {
  startS: number;
  durationS: number;
  /** None for free riding, or targets other than power (heart rate, cadence): ridden at the rider's ride power. */
  power?: PowerTarget;
  name?: string;
}

export interface Workout {
  id: string;
  name: string;
  totalDurationS: number;
  intervals: WorkoutInterval[];
}

export interface UserSettings {
  home?: LonLat;
  ftpW?: number;
  weightKg?: number;
  /** Steady power for a ride without a workout, as a share of FTP (%). */
  ridePowerPct?: number;
}
