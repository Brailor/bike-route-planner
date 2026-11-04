import { describe, expect, it } from 'vitest';
import { workoutFromSteps } from '../workouts/workout';
import { placeHardIntervals } from './placement';

/** A loop timed at 10 s per point: 61 points are 600 s. */
const ride = (points: number, perPointS = 10) => {
  const timesS = Array.from({ length: points }, (_, i) => i * perPointS);
  return { durationS: timesS.at(-1) ?? 0, timesS };
};

const workout = workoutFromSteps('w', [
  { durationS: 120, power: { pctFtp: 60 } },
  { durationS: 120, power: { pctFtp: 105 }, name: 'Threshold' },
  { durationS: 60 },
  { durationS: 120, power: { watts: 300 } },
  { durationS: 180, power: { pctFtp: 80 } },
]);

describe('placeHardIntervals', () => {
  it('places intervals from tempo up at their time on the loop, with zone and name', () => {
    expect(placeHardIntervals(workout, ride(61), 250)).toEqual([
      { from: 12, to: 24, startS: 120, endS: 240, pct: 105, zone: 'threshold', name: 'Threshold' },
      { from: 30, to: 42, startS: 300, endS: 420, pct: 120, zone: 'vo2' },
      { from: 42, to: 60, startS: 420, endS: 600, pct: 80, zone: 'tempo' },
    ]);
  });

  it('stretches the workout to the loop’s time', () => {
    // A 1200 s loop for the 600 s workout: everything lands twice as late.
    const [first] = placeHardIntervals(workout, ride(61, 20), 250);
    expect(first).toMatchObject({ from: 12, to: 24, startS: 240, endS: 480 });
  });

  it('starts in the segment an interval begins in, and covers at least one segment', () => {
    // 30 s per point: the threshold interval (120–240 s) starts inside segment 4 and ends at point 8.
    const [first] = placeHardIntervals(workout, ride(21, 30), 250);
    expect(first).toMatchObject({ from: 4, to: 8 });
    const short = workoutFromSteps('s', [
      { durationS: 1, power: { pctFtp: 150 } },
      { durationS: 599 },
    ]);
    expect(placeHardIntervals(short, ride(61), 250)[0]).toMatchObject({ from: 0, to: 1 });
  });

  it('reads watts against FTP, so a higher FTP can make an interval easy', () => {
    expect(placeHardIntervals(workout, ride(61), 500).map((p) => p.pct)).toEqual([105, 80]);
  });

  it('places nothing without a time or a route', () => {
    expect(placeHardIntervals(workoutFromSteps('w', []), ride(61), 250)).toEqual([]);
    expect(placeHardIntervals(workout, ride(1), 250)).toEqual([]);
  });
});
