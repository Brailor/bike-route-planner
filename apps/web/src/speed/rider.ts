// The rider's own numbers (README M3 settings form), with defaults until they're entered.
import type { UserSettings } from '../types';
import type { Rider } from './model';

export type RiderField = 'ftpW' | 'weightKg' | 'ridePowerPct';

/** Used for whatever the rider hasn't entered: a recreational rider at an endurance pace (mid zone 2). */
export const RIDER_DEFAULTS: Record<RiderField, number> = {
  ftpW: 200,
  weightKg: 75,
  ridePowerPct: 65,
};

/** Accepted range per field; values outside it are typos, not riders. */
export const RIDER_LIMITS: Record<RiderField, { min: number; max: number }> = {
  ftpW: { min: 50, max: 600 },
  weightKg: { min: 30, max: 200 },
  ridePowerPct: { min: 30, max: 120 },
};

export const riderValue = (settings: UserSettings, field: RiderField) =>
  settings[field] ?? RIDER_DEFAULTS[field];

export function riderFrom(settings: UserSettings): Rider {
  return {
    weightKg: riderValue(settings, 'weightKg'),
    powerW: (riderValue(settings, 'ftpW') * riderValue(settings, 'ridePowerPct')) / 100,
  };
}
