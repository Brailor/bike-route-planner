// Where a workout's hard intervals fall on a loop (README M3): for scoring, and for showing them on the map and the
// elevation chart.
import type { RidePrediction } from '../speed/model';
import type { Workout } from '../types';
import { pctFtp, zoneOf, type Zone } from '../workouts/workout';

/** Intervals from tempo up (% FTP) need the road to themselves. */
export const HARD_PCT = 76;

export interface PlacedInterval {
  /** Coordinate indices: the interval starts in segment `from` and ends in segment `to - 1`. */
  from: number;
  to: number;
  /** When it starts and ends on the loop (s), with the workout stretched to the loop's predicted time. */
  startS: number;
  endS: number;
  pct: number;
  zone: Zone;
  name?: string;
}

/** First index whose time is at least `t` (binary search; `times` ascending). */
function indexAt(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The workout's intervals from tempo up, placed on the loop. The workout is stretched to the loop's predicted time,
 * so an interval at 20–30 min of a 2 h workout lands at 1/6–1/4 of the loop's time.
 */
export function placeHardIntervals(
  workout: Workout,
  ride: RidePrediction,
  ftpW: number,
): PlacedInterval[] {
  if (workout.totalDurationS <= 0 || ride.timesS.length < 2) return [];
  const scale = ride.durationS / workout.totalDurationS;
  return workout.intervals.flatMap((interval) => {
    const pct = interval.power && pctFtp(interval.power, ftpW);
    if (pct === undefined || pct < HARD_PCT || interval.durationS <= 0) return [];
    const startS = interval.startS * scale;
    const endS = (interval.startS + interval.durationS) * scale;
    // The segment the interval starts in, and the first point at or after its end.
    const after = indexAt(ride.timesS, startS);
    const from = ride.timesS[after] === startS ? after : Math.max(0, after - 1);
    const to = Math.max(indexAt(ride.timesS, endS), from + 1);
    const name = interval.name ? { name: interval.name } : {};
    return [{ from, to, startS, endS, pct, zone: zoneOf(pct), ...name }];
  });
}
