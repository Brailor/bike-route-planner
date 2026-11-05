import { describe, expect, it } from 'vitest';
import { distanceM } from '../geo';
import { isClockwise, REVERSE_VIAS, reverseWaypoints } from './direction';

// A square loop around Vienna, about 1 km a side: east, north, west, south.
const square = [
  [16.37, 48.2],
  [16.3835, 48.2],
  [16.3835, 48.209],
  [16.37, 48.209],
  [16.37, 48.2],
];

describe('isClockwise', () => {
  it('tells the two ways round apart', () => {
    expect(isClockwise(square)).toBe(false); // east first, then north: anticlockwise
    expect(isClockwise([...square].reverse())).toBe(true);
  });
});

describe('reverseWaypoints', () => {
  it('starts and ends at the start, with points along the loop in reverse order', () => {
    const points = reverseWaypoints(square);
    expect(points).toHaveLength(REVERSE_VIAS + 2);
    expect(points[0]).toEqual([16.37, 48.2]);
    expect(points.at(-1)).toEqual([16.37, 48.2]);
    // Together they run round the other way.
    expect(isClockwise(points)).toBe(true);
  });

  it('spaces the points evenly along the loop', () => {
    const points = reverseWaypoints(square);
    const gaps = points.slice(1).map((p, i) => distanceM(points[i]!, p));
    // Around corners a gap is a diagonal, so a little shorter than the distance along the loop.
    const along = (4 * distanceM(square[0]!, square[1]!)) / (REVERSE_VIAS + 1);
    for (const gap of gaps) {
      expect(gap).toBeLessThanOrEqual(along * 1.01);
      expect(gap).toBeGreaterThan(along * 0.7);
    }
  });

  it('puts the first point near the end of the loop and the last near its start', () => {
    const points = reverseWaypoints(square);
    // The last stretch of the square runs south along 16.37: the first point is on it.
    expect(points[1]![0]).toBeCloseTo(16.37, 6);
    // The first stretch runs east along 48.2: the last point before the start is on it.
    expect(points.at(-2)![1]).toBeCloseTo(48.2, 6);
  });
});
