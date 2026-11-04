// Ride time from physics (README M3): speed per route segment from power, rider and bike, surface and gradient.
// Replaces the routing engine's time estimate, and gives the time at every point for laying workouts over a route.
import { segmentLengthsM } from '../geo';
import { segmentSurfaces, type SurfaceCategory } from '../route/surface';
import type { RouteResult } from '../routing/types';
import type { Profile } from '../types';
import { airDensity, speedForPower } from './physics';

export interface BikeSetup {
  bikeKg: number;
  /** Drag area (m²): riding position and kit. */
  cdA: number;
  /** Rolling resistance by surface, for this profile's typical tyres. */
  crr: Record<SurfaceCategory, number>;
  /** Fastest the rider will descend on each surface (km/h): braking for corners and loose ground. */
  maxKmh: Record<SurfaceCategory, number>;
}

/**
 * Typical values per profile: road bike on the hoods, gravel bike on 40 mm tyres, hardtail MTB. Crr from published
 * roller and field tests (paved ~0.004 on road tyres; loose gravel and dirt several times that). Untagged surfaces
 * ("unknown") sit between paved and gravel. Calibration from the rider's own rides comes later (README M3).
 */
export const BIKE_SETUPS: Record<Profile, BikeSetup> = {
  road: {
    bikeKg: 8.5,
    cdA: 0.32,
    crr: { paved: 0.004, gravel: 0.012, ground: 0.02, unknown: 0.006 },
    maxKmh: { paved: 60, gravel: 30, ground: 20, unknown: 45 },
  },
  gravel: {
    bikeKg: 10,
    cdA: 0.38,
    crr: { paved: 0.005, gravel: 0.008, ground: 0.012, unknown: 0.007 },
    maxKmh: { paved: 55, gravel: 40, ground: 30, unknown: 45 },
  },
  mtb: {
    bikeKg: 13,
    cdA: 0.45,
    crr: { paved: 0.007, gravel: 0.01, ground: 0.013, unknown: 0.009 },
    maxKmh: { paved: 50, gravel: 40, ground: 35, unknown: 40 },
  },
};

/** Rider plus kit, clothing and water, on top of body weight (kg). */
const KIT_KG = 2;
/** Below this the rider is taken to walk (m/s, ~4 km/h): the steepest ramps aren't ridden at any power. */
const WALKING_MS = 1.1;
/** Gradients are measured over this distance (m), so single noisy elevation samples don't make walls. */
export const GRADE_WINDOW_M = 100;
/** Altitude for estimates without a route (m): around Vienna. */
const CRUISE_ELEVATION_M = 200;

export interface Rider {
  weightKg: number;
  /** Steady power for the ride (W), e.g. an endurance share of FTP. */
  powerW: number;
}

export interface RidePrediction {
  durationS: number;
  /** Time (s) at which each route coordinate is reached; starts at 0. */
  timesS: number[];
}

/**
 * Gradient of each segment, measured over `windowM` centred on it (shorter near the ends). Points without elevation
 * count as flat.
 */
export function segmentGrades(
  coordinates: readonly (readonly number[])[],
  windowM = GRADE_WINDOW_M,
): number[] {
  const lengths = segmentLengthsM(coordinates);
  const along = [0];
  for (const l of lengths) along.push((along.at(-1) ?? 0) + l);
  const total = along.at(-1) ?? 0;
  const eleAt = (d: number) => {
    // Elevation at distance d along the route, interpolated (binary search for the segment).
    let lo = 0;
    let hi = along.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((along[mid] ?? 0) <= d) lo = mid;
      else hi = mid;
    }
    const [da = 0, db = 0] = [along[lo], along[hi]];
    const [ea = 0, eb = 0] = [coordinates[lo]?.[2], coordinates[hi]?.[2]];
    return db > da ? ea + ((eb - ea) * (d - da)) / (db - da) : ea;
  };
  return lengths.map((_, i) => {
    const middle = ((along[i] ?? 0) + (along[i + 1] ?? 0)) / 2;
    const from = Math.max(0, middle - windowM / 2);
    const to = Math.min(total, middle + windowM / 2);
    return to > from ? (eleAt(to) - eleAt(from)) / (to - from) : 0;
  });
}

/**
 * Rough average speed (m/s) before there's a route: flat, on an untagged surface (between paved and gravel), at low
 * altitude. Sizes loops for a target time; the real routes are timed with `predictRide`.
 */
export function cruiseSpeedMs(profile: Profile, rider: Rider): number {
  const setup = BIKE_SETUPS[profile];
  const speed = speedForPower(rider.powerW, 0, {
    massKg: rider.weightKg + KIT_KG + setup.bikeKg,
    crr: setup.crr.unknown,
    cdA: setup.cdA,
    rho: airDensity(CRUISE_ELEVATION_M),
  });
  return Math.min(speed, setup.maxKmh.unknown / 3.6);
}

/** Time for each segment of the route at the rider's steady power, on the profile's bike. */
export function predictRide(route: RouteResult, profile: Profile, rider: Rider): RidePrediction {
  const coords = route.geometry.coordinates;
  const setup = BIKE_SETUPS[profile];
  const lengths = segmentLengthsM(coords);
  const grades = segmentGrades(coords);
  const surfaces = segmentSurfaces(route);
  const massKg = rider.weightKg + KIT_KG + setup.bikeKg;

  const timesS = [0];
  lengths.forEach((length, i) => {
    const category = surfaces[i]?.category ?? 'unknown';
    const elevation = coords[i]?.[2] ?? 0;
    const physical = speedForPower(rider.powerW, grades[i] ?? 0, {
      massKg,
      crr: setup.crr[category],
      cdA: setup.cdA,
      rho: airDensity(elevation),
    });
    const speed = Math.max(WALKING_MS, Math.min(physical, setup.maxKmh[category] / 3.6));
    timesS.push((timesS.at(-1) ?? 0) + length / speed);
  });
  return { durationS: timesS.at(-1) ?? 0, timesS };
}
