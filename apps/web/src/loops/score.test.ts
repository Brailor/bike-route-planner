import { describe, expect, it } from 'vitest';
import type { RouteResult, Span } from '../routing/types';
import type { AvoidFlag, ProfileSettings, WorkoutInterval } from '../types';
import { durationWorkout, workoutFromSteps } from '../workouts/workout';
import type { LoopCandidate } from './candidates';
import {
  flowScore,
  intervalScore,
  rankLoops,
  scoreLoop,
  surfaceScore,
  timeScore,
  varietyScore,
  type ScoreContext,
} from './score';
import { findClimbs, findStretches } from './features';
import { segmentGrades } from '../speed/model';

/** Metres → degrees of longitude on the equator. */
const M = 1 / 111_195;
const SEG_M = 100;
const SEG_S = 20; // 18 km/h: 180 segments are an hour

interface LoopOptions {
  segments?: number;
  /** Elevation at each point; flat by default. */
  elevations?: number[];
  crossing?: Span<string>[];
  surface?: Span<string>[];
  /** OSM way of each segment; a new way per segment by default. */
  ways?: (number | null)[];
  /** Seconds per segment. */
  segS?: number;
}

/** A straight loop-to-be east along the equator, a point every 100 m, timed at a steady pace. */
function loop({
  segments = 180,
  elevations,
  crossing = [],
  surface,
  ways,
  segS = SEG_S,
}: LoopOptions = {}) {
  const coordinates = Array.from({ length: segments + 1 }, (_, i) => [
    i * SEG_M * M,
    0,
    elevations?.[i] ?? 200,
  ]);
  const wayList = ways ?? Array.from({ length: segments }, (_, i) => i + 1);
  const route: RouteResult = {
    geometry: { type: 'LineString', coordinates },
    distanceM: segments * SEG_M,
    ascentM: 0,
    descentM: 0,
    durationS: 0,
    attributes: {
      surface: surface ?? [{ from: 0, to: segments, value: 'asphalt' }],
      roadClass: [{ from: 0, to: segments, value: 'residential' }],
      trackType: [],
      osmWayId: wayList.map((value, i) => ({ from: i, to: i + 1, value })),
      crossing,
    },
  };
  const timesS = coordinates.map((_, i) => i * segS);
  return {
    source: 'round_trip',
    route,
    ride: { durationS: segments * segS, timesS },
  } satisfies LoopCandidate;
}

const minutes = (m: number) => m * 60;
/** Point index at a minute of riding. */
const at = (m: number) => (m * 60) / SEG_S;
const signal = (index: number): Span<string> => ({
  from: index,
  to: index + 1,
  value: 'traffic_signals',
});

const GRAVEL: ProfileSettings = { profile: 'gravel', offroadPreference: 80 };

/** A 60-minute workout with one interval at minutes 10–20. */
function workoutWith(power: WorkoutInterval['power']) {
  return workoutFromSteps('w', [
    { durationS: minutes(10), power: { pctFtp: 60 } },
    { durationS: minutes(10), ...(power && { power }) },
    { durationS: minutes(40), power: { pctFtp: 60 } },
  ]);
}

function intervals(l: LoopCandidate, power: WorkoutInterval['power'], ftpW = 250) {
  const coords = l.route.geometry.coordinates;
  return intervalScore(
    l,
    { workout: workoutWith(power), ftpW },
    {
      stretches: findStretches(l.route, l.ride.timesS),
      climbs: findClimbs(coords, l.ride.timesS),
      grades: segmentGrades(coords),
    },
  );
}

/** Elevations with a 6% climb (or descent, negative) over the points [from, to). */
function slopeAt(from: number, to: number, grade = 0.06, segments = 180) {
  let ele = 200;
  return Array.from({ length: segments + 1 }, (_, i) => {
    if (i > from && i <= to) ele += grade * SEG_M;
    return ele;
  });
}

describe('timeScore', () => {
  it('is full on target, 0.6 at 10% off either way, nothing from 25% off', () => {
    expect(timeScore(3600, 3600)).toBe(1);
    expect(timeScore(3960, 3600)).toBeCloseTo(0.6);
    expect(timeScore(3240, 3600)).toBeCloseTo(0.6);
    expect(timeScore(4500, 3600)).toBe(0);
    expect(timeScore(9000, 3600)).toBe(0);
  });
});

describe('intervalScore', () => {
  it('is undefined without intervals from tempo up', () => {
    expect(intervals(loop(), { pctFtp: 70 })).toBeUndefined();
    expect(intervals(loop(), undefined)).toBeUndefined();
  });

  it('is full for tempo on a flat stretch without stops', () => {
    expect(intervals(loop(), { pctFtp: 85 })).toBeCloseTo(1);
  });

  it('wants threshold on a climb: flat ground gets 0.7', () => {
    expect(intervals(loop(), { pctFtp: 100 })).toBeCloseTo(0.7);
    // The climb covers the interval, minutes 10–20.
    const climbing = loop({ elevations: slopeAt(at(10), at(20)) });
    expect(intervals(climbing, { pctFtp: 100 })).toBeGreaterThan(0.95);
  });

  it('counts only the longest part without a stop', () => {
    const stopped = loop({ crossing: [signal(at(15))] });
    expect(intervals(stopped, { pctFtp: 85 })).toBeCloseTo(0.5);
    // A stop outside the interval doesn't matter.
    expect(intervals(loop({ crossing: [signal(at(30))] }), { pctFtp: 85 })).toBeCloseTo(1);
  });

  it('marks down time going downhill', () => {
    const down = loop({ elevations: slopeAt(at(10), at(15), -0.05) });
    expect(intervals(down, { pctFtp: 85 })).toBeLessThan(0.6);
  });

  it('stretches the workout to the loop’s time', () => {
    // A 66-minute loop: the interval maps to minutes 11–22, so a stop at 10.5 min is before it and one at 21 inside.
    const longer = { segments: 198 };
    expect(
      intervals(loop({ ...longer, crossing: [signal(at(10.5))] }), { pctFtp: 85 }),
    ).toBeCloseTo(1);
    expect(intervals(loop({ ...longer, crossing: [signal(at(21))] }), { pctFtp: 85 })).toBeLessThan(
      0.95,
    );
  });

  it('reads watt targets against FTP', () => {
    expect(intervals(loop(), { watts: 250 }, 250)).toBeCloseTo(0.7); // 100%: threshold
    expect(intervals(loop(), { watts: 250 }, 400)).toBeUndefined(); // 62%: endurance
  });
});

describe('flowScore', () => {
  it('is the share of time on stretches of 10 minutes or more', () => {
    const stretches = [15, 5, 10].map((m) => ({
      from: 0,
      to: 0,
      lengthM: 0,
      durationS: minutes(m),
    }));
    expect(flowScore(stretches, minutes(30))).toBeCloseTo(25 / 30);
  });
});

describe('surfaceScore', () => {
  const half = (unpaved: string): Span<string>[] => [
    { from: 0, to: 90, value: 'asphalt' },
    { from: 90, to: 180, value: unpaved },
  ];

  it('mixes paved and unpaved by the off-road setting', () => {
    expect(surfaceScore(loop(), { profile: 'road' })).toBeCloseTo(1);
    expect(surfaceScore(loop({ surface: half('gravel') }), { profile: 'road' })).toBeCloseTo(0.5);
    expect(surfaceScore(loop({ surface: half('gravel') }), GRAVEL)).toBeCloseTo(0.5);
    expect(surfaceScore(loop(), GRAVEL)).toBeCloseTo(0.2);
    const allGravel = loop({ surface: [{ from: 0, to: 180, value: 'gravel' }] });
    expect(surfaceScore(allGravel, { profile: 'mtb', offroadPreference: 100 })).toBeCloseTo(1);
  });

  it('counts untagged surfaces half each way', () => {
    const unknown = loop({ surface: [{ from: 0, to: 180, value: 'mystery' }] });
    expect(surfaceScore(unknown, { profile: 'road' })).toBeCloseTo(0.5);
    expect(surfaceScore(unknown, GRAVEL)).toBeCloseTo(0.5);
  });
});

describe('varietyScore', () => {
  it('is 1 on new ways throughout', () => {
    expect(varietyScore(loop())).toBe(1);
  });

  it('marks down ways ridden again after leaving them, as out and back', () => {
    expect(varietyScore(loop({ segments: 6, ways: [1, 2, 3, 3, 2, 1] }))).toBeCloseTo(4 / 6);
    expect(varietyScore(loop({ segments: 4, ways: [1, 1, 1, 1] }))).toBe(1); // one long way
    expect(varietyScore(loop({ segments: 4, ways: [null, 1, null, null] }))).toBe(1); // unknown ways never count
  });
});

describe('scoreLoop', () => {
  const context = (over: Partial<ScoreContext> = {}): ScoreContext => ({
    workout: durationWorkout('1 h ride', 3600),
    settings: { profile: 'road' },
    flags: [],
    ftpW: 250,
    ...over,
  });

  it('weighs the parts; without hard intervals their weight goes to flow', () => {
    const score = scoreLoop(loop(), context());
    expect(score).toMatchObject({
      time: 1,
      intervals: undefined,
      flow: 1,
      surface: 1,
      variety: 1,
      usesFlag: false,
    });
    expect(score.total).toBeCloseTo(1);
    // A stop every 8 minutes: no stretch reaches 10.
    const stopping = loop({ crossing: [4, 12, 20, 28, 36, 44, 52].map((m) => signal(at(m))) });
    const flowless = scoreLoop(stopping, context());
    expect(flowless.flow).toBe(0);
    expect(flowless.total).toBeCloseTo(1 - 0.35);
  });

  it('uses the interval fit when the workout has hard intervals', () => {
    const score = scoreLoop(loop(), context({ workout: workoutWith({ pctFtp: 100 }) }));
    expect(score.intervals).toBeCloseTo(0.7);
    expect(score.total).toBeCloseTo(1 - 0.25 * 0.3);
  });

  it('halves loops that still use a flag', () => {
    const l = loop({ segments: 10 });
    const flag: AvoidFlag = {
      id: 'f',
      geometry: { type: 'LineString', coordinates: l.route.geometry.coordinates.slice(2, 8) },
      createdAt: '2026-11-04T00:00:00Z',
    };
    const workout = durationWorkout('w', l.ride.durationS);
    const clean = scoreLoop(l, context({ workout }));
    const flagged = scoreLoop(l, context({ workout, flags: [flag] }));
    expect(flagged.usesFlag).toBe(true);
    expect(flagged.total).toBeCloseTo(clean.total / 2);
  });
});

describe('rankLoops', () => {
  it('puts the best loop first', () => {
    const slow = loop({ segS: 26 }); // 78 min for a 60-minute ride
    const onTime = loop();
    const ranked = rankLoops([slow, onTime], {
      workout: durationWorkout('w', 3600),
      settings: { profile: 'road' },
      flags: [],
      ftpW: 250,
    });
    expect(ranked.map((r) => r.loop)).toEqual([onTime, slow]);
    expect(ranked[0]!.score.total).toBeGreaterThan(ranked[1]!.score.total);
  });
});
