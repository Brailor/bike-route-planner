// Ranking candidate loops for a workout (README M3). Each part is 0–1, higher is better, so the UI can say why a loop
// ranks where it does; the total is their weighted sum.
import { usesFlag } from '../flags/avoid';
import { segmentLengthsM } from '../geo';
import { perSegment, surfaceBreakdown } from '../route/surface';
import { segmentGrades } from '../speed/model';
import type { AvoidFlag, ProfileSettings, Workout } from '../types';
import { pctFtp } from '../workouts/workout';
import type { LoopCandidate } from './candidates';
import { findClimbs, findStretches, type Climb, type Stretch } from './features';

export interface ScoreContext {
  workout: Workout;
  settings: ProfileSettings;
  flags: readonly AvoidFlag[];
  ftpW: number;
}

export interface LoopScore {
  total: number;
  /** How close the predicted time is to the workout's. */
  time: number;
  /** Whether hard intervals land on stretches without stops, not downhill, and (threshold and up) on climbs. */
  intervals: number | undefined;
  /** Share of the ride on long stretches without stops. */
  flow: number;
  /** Share on the surface the profile and off-road setting ask for. */
  surface: number;
  /** Share not ridden twice: out-and-back loops score low. */
  variety: number;
  /** Still uses a flagged section: there was no way around it. */
  usesFlag: boolean;
}

/** Time is worth nothing this far off (as a share of the target). The goal is within 10% (README M3). */
const TIME_ZERO_AT = 0.25;
/** Intervals from tempo up need the road to themselves; from threshold up a climb helps. */
const HARD_PCT = 76;
const CLIMB_PCT = 91;
/** Gradients steeper than this down (rise over run) make holding power hard. */
const DOWNHILL = -0.02;
/** Stretches at least this long (s) count towards flow. */
const FLOW_MIN_S = 600;
const WEIGHTS = { time: 0.35, intervals: 0.25, flow: 0.1, surface: 0.1, variety: 0.2 };
/** Loops over a flag keep this share of their total. */
const FLAG_PENALTY = 0.5;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function timeScore(predictedS: number, targetS: number): number {
  return clamp01(1 - Math.abs(predictedS / targetS - 1) / TIME_ZERO_AT);
}

/**
 * How well the hard intervals fit where they fall on the loop, weighted by their length; undefined without any. The
 * workout is stretched to the loop's predicted time, so each interval maps to a share of the loop.
 */
export function intervalScore(
  loop: LoopCandidate,
  { workout, ftpW }: Pick<ScoreContext, 'workout' | 'ftpW'>,
  features: { stretches: Stretch[]; climbs: Climb[]; grades: number[] },
): number | undefined {
  const hard = workout.intervals.flatMap((interval) => {
    const pct = interval.power && pctFtp(interval.power, ftpW);
    return pct !== undefined && pct >= HARD_PCT ? [{ ...interval, pct }] : [];
  });
  if (hard.length === 0 || workout.totalDurationS <= 0) return undefined;

  const { timesS } = loop.ride;
  const scale = loop.ride.durationS / workout.totalDurationS;
  const onClimb = (segment: number) =>
    features.climbs.some((c) => c.from <= segment && segment < c.to);
  let weighted = 0;
  let total = 0;
  for (const interval of hard) {
    const t0 = interval.startS * scale;
    const t1 = (interval.startS + interval.durationS) * scale;
    const length = t1 - t0;
    if (length <= 0) continue;
    let downhill = 0;
    let climbing = 0;
    for (let i = 0; i + 1 < timesS.length; i++) {
      const inside = overlap(t0, t1, timesS[i] ?? 0, timesS[i + 1] ?? 0);
      if (inside === 0) continue;
      if ((features.grades[i] ?? 0) < DOWNHILL) downhill += inside;
      if (onClimb(i)) climbing += inside;
    }
    // The longest part of the interval without a stop.
    const stopFree = Math.max(
      0,
      ...features.stretches.map((s) => overlap(t0, t1, timesS[s.from] ?? 0, timesS[s.to] ?? 0)),
    );
    let fit = (stopFree / length) * (1 - downhill / length);
    if (interval.pct >= CLIMB_PCT) fit *= 0.7 + 0.3 * (climbing / length);
    weighted += fit * interval.durationS;
    total += interval.durationS;
  }
  return total > 0 ? clamp01(weighted / total) : undefined;
}

/** Share of the ride's time on stretches of at least `FLOW_MIN_S`. */
export function flowScore(stretches: readonly Stretch[], durationS: number): number {
  if (durationS <= 0) return 0;
  const long = stretches
    .filter((s) => s.durationS >= FLOW_MIN_S)
    .reduce((sum, s) => sum + s.durationS, 0);
  return clamp01(long / durationS);
}

/**
 * Share of the loop on the preferred surface. Road: paved. Gravel and MTB: unpaved and paved mixed by the off-road
 * setting (0–100). Untagged surfaces count half each way.
 */
export function surfaceScore(loop: LoopCandidate, settings: ProfileSettings): number {
  const b = surfaceBreakdown(loop.route);
  const total = b.paved.meters + b.gravel.meters + b.ground.meters + b.unknown.meters;
  if (total <= 0) return 0;
  const paved = b.paved.meters + b.unknown.meters / 2;
  const unpaved = b.gravel.meters + b.ground.meters + b.unknown.meters / 2;
  const offroad = settings.profile === 'road' ? 0 : (settings.offroadPreference ?? 50) / 100;
  return clamp01((offroad * unpaved + (1 - offroad) * paved) / total);
}

/** 1 minus the share of the loop's length on ways it has already ridden and left. */
export function varietyScore(loop: LoopCandidate): number {
  const coords = loop.route.geometry.coordinates;
  const lengths = segmentLengthsM(coords);
  const ways = perSegment(loop.route.attributes.osmWayId, lengths.length, null);
  const left = new Set<number>();
  let repeated = 0;
  let total = 0;
  ways.forEach((way, i) => {
    const previous = ways[i - 1];
    if (previous !== undefined && previous !== null && previous !== way) left.add(previous);
    const length = lengths[i] ?? 0;
    total += length;
    if (way !== null && left.has(way)) repeated += length;
  });
  return total > 0 ? clamp01(1 - repeated / total) : 1;
}

export function scoreLoop(loop: LoopCandidate, context: ScoreContext): LoopScore {
  const coords = loop.route.geometry.coordinates;
  const stretches = findStretches(loop.route, loop.ride.timesS);
  const climbs = findClimbs(coords, loop.ride.timesS);
  const grades = segmentGrades(coords);

  const time = timeScore(loop.ride.durationS, context.workout.totalDurationS);
  const intervals = intervalScore(loop, context, { stretches, climbs, grades });
  const flow = flowScore(stretches, loop.ride.durationS);
  const surface = surfaceScore(loop, context.settings);
  const variety = varietyScore(loop);
  const flagged = usesFlag(loop.route, context.flags);

  // Without hard intervals, their weight goes to flow: a steady ride wants few stops.
  const sum =
    WEIGHTS.time * time +
    (intervals === undefined
      ? (WEIGHTS.flow + WEIGHTS.intervals) * flow
      : WEIGHTS.intervals * intervals + WEIGHTS.flow * flow) +
    WEIGHTS.surface * surface +
    WEIGHTS.variety * variety;
  return {
    total: sum * (flagged ? FLAG_PENALTY : 1),
    time,
    intervals,
    flow,
    surface,
    variety,
    usesFlag: flagged,
  };
}

/** Loops with their scores, best first. */
export function rankLoops(loops: readonly LoopCandidate[], context: ScoreContext) {
  return loops
    .map((loop) => ({ loop, score: scoreLoop(loop, context) }))
    .sort((a, b) => b.score.total - a.score.total);
}
