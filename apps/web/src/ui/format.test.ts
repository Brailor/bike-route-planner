import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, formatElevation, formatPercent } from './format';

describe('format', () => {
  it('formats distances', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(17_349)).toBe('17.3 km');
  });

  it('formats durations', () => {
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2 h 05 min');
  });

  it('formats elevation and percentages', () => {
    expect(formatElevation(334.6)).toBe('335 m');
    expect(formatPercent(0.456)).toBe('46%');
  });
});
