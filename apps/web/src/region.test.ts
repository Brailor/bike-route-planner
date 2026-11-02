import { describe, expect, it } from 'vitest';
import { inSupportedRegion } from './region';

describe('inSupportedRegion', () => {
  it.each([
    ['Vienna', [16.37, 48.21]],
    ['Bregenz (far west of Austria)', [9.75, 47.5]],
    ['Budapest', [19.04, 47.5]],
    ['Debrecen (far east of Hungary)', [21.63, 47.53]],
  ] as const)('includes %s', (_, point) => {
    expect(inSupportedRegion([...point])).toBe(true);
  });

  it.each([
    ['Berlin', [13.4, 52.52]],
    ['Rome', [12.5, 41.9]],
    ['Cluj-Napoca', [23.6, 46.77]],
  ] as const)('excludes %s', (_, point) => {
    expect(inSupportedRegion([...point])).toBe(false);
  });
});
