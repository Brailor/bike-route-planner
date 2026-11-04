// Workouts (README M3): what a ride should contain, from a plain duration or a workout file (ZWO, FIT).
import type { PowerTarget, Workout } from '../types';

/** One step of a workout, before it's placed in time. */
export interface WorkoutStep {
  durationS: number;
  power?: PowerTarget;
  name?: string;
}

/** A workout read from a file, with what couldn't be carried over (e.g. steps that end on distance). */
export interface ImportedWorkout {
  workout: Workout;
  warnings: string[];
}

/** The file can't be used at all; the message is shown to the user. */
export class WorkoutImportError extends Error {
  override name = 'WorkoutImportError';
}

export function workoutFromSteps(name: string, steps: readonly WorkoutStep[]): Workout {
  let startS = 0;
  const intervals = steps.map((step) => {
    const interval = { startS, ...step };
    startS += step.durationS;
    return interval;
  });
  return { id: crypto.randomUUID(), name, totalDurationS: startS, intervals };
}

/** A ride of a given length with no structure: ridden at the rider's ride power throughout. */
export const durationWorkout = (name: string, durationS: number) =>
  workoutFromSteps(name, [{ durationS }]);

export const pctFtp = (power: PowerTarget, ftpW: number) =>
  'pctFtp' in power ? power.pctFtp : (power.watts / ftpW) * 100;

export type Zone = 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2' | 'anaerobic';

/** Training zone by share of FTP (Coggan's power zones 1–6). */
export function zoneOf(pct: number): Zone {
  if (pct < 55) return 'recovery';
  if (pct < 76) return 'endurance';
  if (pct < 91) return 'tempo';
  if (pct < 106) return 'threshold';
  if (pct < 121) return 'vo2';
  return 'anaerobic';
}
