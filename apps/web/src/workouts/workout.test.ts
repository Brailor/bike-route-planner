import { describe, expect, it } from 'vitest';
import { durationWorkout, pctFtp, workoutFromSteps, zoneOf } from './workout';

describe('workoutFromSteps', () => {
  it('places steps one after another', () => {
    const workout = workoutFromSteps('Tempo', [
      { durationS: 600, power: { pctFtp: 60 } },
      { durationS: 1200, power: { watts: 230 }, name: 'Tempo' },
    ]);
    expect(workout).toMatchObject({ name: 'Tempo', totalDurationS: 1800 });
    expect(workout.intervals.map((i) => i.startS)).toEqual([0, 600]);
    expect(workout.intervals[1]).toEqual({
      startS: 600,
      durationS: 1200,
      power: { watts: 230 },
      name: 'Tempo',
    });
    expect(workout.id).not.toBe(workoutFromSteps('Tempo', []).id);
  });

  it('makes a plain ride of a duration, with no target', () => {
    expect(durationWorkout('1 h 30 min ride', 5400)).toMatchObject({
      totalDurationS: 5400,
      intervals: [{ startS: 0, durationS: 5400 }],
    });
  });
});

describe('power and zones', () => {
  it('takes watts as a share of FTP', () => {
    expect(pctFtp({ watts: 250 }, 250)).toBe(100);
    expect(pctFtp({ pctFtp: 88 }, 250)).toBe(88);
  });

  it.each([
    [40, 'recovery'],
    [55, 'endurance'],
    [75, 'endurance'],
    [76, 'tempo'],
    [91, 'threshold'],
    [105, 'threshold'],
    [106, 'vo2'],
    [121, 'anaerobic'],
  ])('%i%% FTP is %s', (pct, zone) => {
    expect(zoneOf(pct)).toBe(zone);
  });
});
