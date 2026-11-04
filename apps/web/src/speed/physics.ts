// Cycling power physics (README M3): the standard steady-state model of gravity, rolling resistance and air drag.
// Pure and engine-free; `model.ts` applies it to a route.

const G = 9.80665;
/** Air density at sea level, 15 °C (kg/m³). */
const RHO_SEA_LEVEL = 1.225;
/** Altitude over which air density falls by a factor of e (m), for the isothermal approximation. */
const DENSITY_SCALE_HEIGHT_M = 8434;
/** Share of pedal power that reaches the wheel: a clean chain drivetrain. */
export const DRIVETRAIN_EFFICIENCY = 0.97;
/** Speeds are searched up to this (m/s, ~144 km/h); nothing on a bike gets there. */
const MAX_SPEED_MS = 40;

export const airDensity = (elevationM: number) =>
  RHO_SEA_LEVEL * Math.exp(-elevationM / DENSITY_SCALE_HEIGHT_M);

export interface Resistance {
  /** Rider, bike and kit (kg). */
  massKg: number;
  /** Rolling resistance coefficient. */
  crr: number;
  /** Drag area (m²). */
  cdA: number;
  /** Air density (kg/m³). */
  rho: number;
}

/** Pedal power (W) needed to hold `speedMs` on `grade` (rise over run). Negative on descents faster than coasting. */
export function powerForSpeed(speedMs: number, grade: number, r: Resistance): number {
  const theta = Math.atan(grade);
  const force =
    r.massKg * G * (r.crr * Math.cos(theta) + Math.sin(theta)) + 0.5 * r.rho * r.cdA * speedMs ** 2;
  return (force * speedMs) / DRIVETRAIN_EFFICIENCY;
}

/**
 * Steady speed (m/s) for `powerW` at the pedals on `grade`. With zero power on a descent it's the coasting speed.
 * Below the answer the power needed is less than `powerW` (on descents it's even negative at first), above it more,
 * so bisection from standstill finds it.
 */
export function speedForPower(powerW: number, grade: number, r: Resistance): number {
  let lo = 0;
  let hi = MAX_SPEED_MS;
  if (powerForSpeed(hi, grade, r) < powerW) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (powerForSpeed(mid, grade, r) < powerW) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
