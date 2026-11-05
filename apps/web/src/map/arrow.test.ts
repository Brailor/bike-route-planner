import { describe, expect, it } from 'vitest';
import { arrowImage } from './arrow';

const SIZE = 32;
const { width, height, data } = arrowImage(SIZE);
const pixel = (x: number, y: number) => {
  const i = (y * SIZE + x) * 4;
  return { r: data[i] ?? 0, a: data[i + 3] ?? 0 };
};

describe('arrowImage', () => {
  it('is a square of RGBA pixels', () => {
    expect([width, height, data.length]).toEqual([SIZE, SIZE, SIZE * SIZE * 4]);
  });

  it('points right: dark at the tip, nothing beyond it or in the corners', () => {
    const tip = pixel(Math.floor(0.72 * SIZE) - 2, SIZE / 2);
    expect(tip.a).toBe(255);
    expect(tip.r).toBeLessThan(80); // dark
    expect(pixel(SIZE - 2, SIZE / 2).a).toBe(0);
    for (const [x, y] of [
      [0, 0],
      [SIZE - 1, 0],
      [0, SIZE - 1],
      [SIZE - 1, SIZE - 1],
    ] as const)
      expect(pixel(x, y).a).toBe(0);
  });

  it('is open on the left: a chevron, not a filled triangle', () => {
    expect(pixel(Math.floor(0.32 * SIZE), SIZE / 2).a).toBe(0);
  });

  it('has a white outline around the dark stroke', () => {
    // Moving out from the tip along the middle row: dark, then white, then clear.
    const row = Array.from({ length: SIZE }, (_, x) => pixel(x, SIZE / 2));
    const lastDark = row.findLastIndex((p) => p.a === 255 && p.r < 80);
    expect(lastDark).toBeGreaterThan(0);
    expect(row.slice(lastDark + 1).some((p) => p.a === 255 && p.r === 255)).toBe(true);
  });

  it('is the same above and below the middle', () => {
    for (let y = 0; y < SIZE / 2; y++)
      for (let x = 0; x < SIZE; x++) expect(pixel(x, y).a).toBe(pixel(x, SIZE - 1 - y).a);
  });
});
