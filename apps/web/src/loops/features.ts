// What a loop's roads offer a workout (README M3): climbs for hard efforts uphill, and stretches without stops for
// steady efforts. Positions are indices into the route's coordinates; times come from the speed model.
import { segmentLengthsM } from '../geo';
import type { RouteResult, Span } from '../routing/types';

export interface Climb {
  /** Coordinate indices of the foot and the top. */
  from: number;
  to: number;
  lengthM: number;
  gainM: number;
  /** Average gradient (rise over run). */
  grade: number;
  /** Riding time from foot to top (s). */
  durationS: number;
}

/** Distance from the start to each coordinate (m). */
function cumulativeM(coordinates: readonly (readonly number[])[]): number[] {
  const along = [0];
  for (const l of segmentLengthsM(coordinates)) along.push((along.at(-1) ?? 0) + l);
  return along;
}

/** A dip of more than this below the highest point so far ends a climb (m): small dips and noise don't. */
const DIP_TOLERANCE_M = 10;
/** Climbs need at least this gain (m) and average gradient to count. */
const MIN_CLIMB_GAIN_M = 20;
const MIN_CLIMB_GRADE = 0.03;

/**
 * Climbs along the route: from a low point up to the highest point before the road drops more than
 * `DIP_TOLERANCE_M` below it, kept when steep and high enough. `timesS` is the time at each coordinate.
 */
export function findClimbs(
  coordinates: readonly (readonly number[])[],
  timesS: readonly number[],
): Climb[] {
  const along = cumulativeM(coordinates);
  const ele = (i: number) => coordinates[i]?.[2] ?? 0;

  const climbs: Climb[] = [];
  const add = (from: number, to: number) => {
    const lengthM = (along[to] ?? 0) - (along[from] ?? 0);
    const gainM = ele(to) - ele(from);
    if (lengthM <= 0 || gainM < MIN_CLIMB_GAIN_M || gainM / lengthM < MIN_CLIMB_GRADE) return;
    climbs.push({
      from,
      to,
      lengthM,
      gainM,
      grade: gainM / lengthM,
      durationS: (timesS[to] ?? 0) - (timesS[from] ?? 0),
    });
  };

  let low = 0; // lowest point since the last climb ended: where the next one starts
  let high = 0; // highest point since `low`
  for (let i = 1; i < coordinates.length; i++) {
    if (ele(i) > ele(high)) high = i;
    if (ele(high) - ele(i) > DIP_TOLERANCE_M) {
      // Dropped clearly below the top: a climb (if any) ended there; start looking from here.
      if (high > low) add(low, high);
      low = i;
      high = i;
    } else if (ele(i) <= ele(low)) {
      // Down to the start or below: whatever rose before gained less than the tolerance, so it wasn't a climb. On
      // the level, the foot moves on to where the road starts rising.
      low = i;
      high = i;
    }
  }
  if (high > low) add(low, high);
  return climbs;
}

/** A stretch between two stops (or the start or end), where a steady effort isn't interrupted. */
export interface Stretch {
  from: number;
  to: number;
  lengthM: number;
  durationS: number;
}

/** Crossings with lights or level crossings: the rider may have to stop whichever way they meet them. */
const ALWAYS_STOP = new Set(['traffic_signals', 'railway', 'railway_barrier']);
/** Crossings without lights: a stop only where the route is the path crossing the road, not the road itself. */
const PATH_CROSSINGS = new Set(['marked', 'unmarked', 'uncontrolled']);
const PATH_CLASSES = new Set(['cycleway', 'path', 'footway', 'pedestrian', 'steps', 'bridleway']);
/** Stops this close together are one: the crossings around one junction, or both sides of one crossing (m). */
const SAME_STOP_M = 30;

const valueAt = <T>(spans: readonly Span<T>[], index: number) =>
  spans.find((s) => s.from <= index && index < s.to)?.value;

/** Coordinate indices where the rider may have to stop, in route order. */
export function findStops(route: RouteResult): number[] {
  const { crossing, roadClass } = route.attributes;
  const along = cumulativeM(route.geometry.coordinates);
  const stops: number[] = [];
  for (const span of crossing) {
    const stop =
      ALWAYS_STOP.has(span.value) ||
      (PATH_CROSSINGS.has(span.value) && PATH_CLASSES.has(valueAt(roadClass, span.from) ?? ''));
    if (!stop) continue;
    const last = stops.at(-1);
    if (last === undefined || (along[span.from] ?? 0) - (along[last] ?? 0) > SAME_STOP_M)
      stops.push(span.from);
  }
  return stops;
}

/** The route cut at its stops: the stretches a steady effort could be ridden on, in route order. */
export function findStretches(route: RouteResult, timesS: readonly number[]): Stretch[] {
  const last = route.geometry.coordinates.length - 1;
  const along = cumulativeM(route.geometry.coordinates);
  const cuts = [0, ...findStops(route).filter((i) => i > 0 && i < last), last];
  return cuts.slice(1).map((to, i) => {
    const from = cuts[i] ?? 0;
    return {
      from,
      to,
      lengthM: (along[to] ?? 0) - (along[from] ?? 0),
      durationS: (timesS[to] ?? 0) - (timesS[from] ?? 0),
    };
  });
}
