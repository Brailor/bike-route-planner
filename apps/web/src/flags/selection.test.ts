import { describe, expect, it } from 'vitest';
import {
  indexAtFraction,
  initialSelection,
  selectionGeometry,
  selectionLengthM,
  selectionRange,
} from './selection';

/** Points along the equator; 0.001° of longitude there is ~111.2 m. */
const line = (...lons: number[]) => lons.map((lon) => [lon, 0, 100]);
const EVEN = line(0, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01);

describe('indexAtFraction', () => {
  it('finds the point at that share of the distance, not of the point count', () => {
    expect(indexAtFraction(EVEN, 0.4)).toBe(4);
    // Dense points at the start: 40% of the distance is the last dense point (3), not 40% of the points (2).
    expect(indexAtFraction(line(0, 0.0001, 0.0002, 0.0003, 0.01), 0.4)).toBe(3);
    expect(indexAtFraction(line(0, 0.006, 0.01), 0.4)).toBe(1);
  });

  it('clamps to the ends', () => {
    expect(indexAtFraction(EVEN, 0)).toBe(0);
    expect(indexAtFraction(EVEN, 1)).toBe(10);
  });
});

describe('initialSelection', () => {
  it('places the handles around the middle', () => {
    expect(initialSelection(EVEN)).toEqual({ a: 4, b: 6 });
  });

  it('keeps the handles apart when one long segment spans the middle', () => {
    // Both 40% and 60% are closest to the middle point.
    expect(initialSelection(line(0, 0.005, 0.01))).toEqual({ a: 1, b: 2 });
    expect(initialSelection(line(0, 0.01))).toEqual({ a: 0, b: 1 });
  });

  it('stays in bounds on a single-point route', () => {
    expect(initialSelection(line(0))).toEqual({ a: 0, b: 0 });
  });
});

describe('selected stretch', () => {
  it('is ordered along the route whichever handle comes first', () => {
    expect(selectionRange({ a: 6, b: 2 })).toEqual([2, 6]);
    expect(selectionGeometry(EVEN, { a: 6, b: 2 }).coordinates).toEqual(EVEN.slice(2, 7));
  });

  it('includes both handle points, with elevation', () => {
    expect(selectionGeometry(EVEN, { a: 3, b: 4 })).toEqual({
      type: 'LineString',
      coordinates: [
        [0.003, 0, 100],
        [0.004, 0, 100],
      ],
    });
  });

  it('measures the distance between the handles', () => {
    expect(selectionLengthM(EVEN, { a: 7, b: 2 })).toBeCloseTo(556, 0);
    expect(selectionLengthM(EVEN, { a: 5, b: 5 })).toBe(0);
  });
});
