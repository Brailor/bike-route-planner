// Picking the stretch of the current route to flag (M2). Positions are indices into the route's coordinates.
import type { LineString } from 'geojson';
import { segmentLengthsM } from '../geo';

type Coordinates = readonly (readonly number[])[];

/** The two handles. Either may be further along the route; use `selectionRange` for the ordered stretch. */
export interface FlagSelection {
  a: number;
  b: number;
}

export type FlagHandle = keyof FlagSelection;

/** Where the handles start, as fractions of the route's length: near the middle, so both are easy to grab. */
const START_FRACTIONS = [0.4, 0.6] as const;

/** The coordinate whose distance along the route is closest to `fraction` of the total. */
export function indexAtFraction(coordinates: Coordinates, fraction: number): number {
  const lengths = segmentLengthsM(coordinates);
  const target = fraction * lengths.reduce((sum, l) => sum + l, 0);
  let best = 0;
  let distance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const previous = distance;
    distance += lengths[i - 1] ?? 0;
    if (Math.abs(distance - target) < Math.abs(previous - target)) best = i;
    else if (distance > target) break;
  }
  return best;
}

export function initialSelection(coordinates: Coordinates): FlagSelection {
  const [aFraction, bFraction] = START_FRACTIONS;
  const a = indexAtFraction(coordinates, aFraction);
  const b = indexAtFraction(coordinates, bFraction);
  // A long segment across the middle puts both handles on one point; spread them over that segment.
  if (a !== b) return { a, b };
  return a + 1 < coordinates.length ? { a, b: a + 1 } : { a: Math.max(0, a - 1), b };
}

/** First and last coordinate index of the selected stretch. */
export function selectionRange({ a, b }: FlagSelection): [from: number, to: number] {
  return a <= b ? [a, b] : [b, a];
}

export function selectionGeometry(coordinates: Coordinates, selection: FlagSelection): LineString {
  const [from, to] = selectionRange(selection);
  return { type: 'LineString', coordinates: coordinates.slice(from, to + 1).map((c) => [...c]) };
}

export function selectionLengthM(coordinates: Coordinates, selection: FlagSelection): number {
  const [from, to] = selectionRange(selection);
  return segmentLengthsM(coordinates.slice(from, to + 1)).reduce((sum, l) => sum + l, 0);
}
