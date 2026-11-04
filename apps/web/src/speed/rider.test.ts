import { describe, expect, it } from 'vitest';
import { RIDER_DEFAULTS, riderFrom } from './rider';

describe('riderFrom', () => {
  it('rides at the given share of FTP', () => {
    expect(riderFrom({ ftpW: 300, weightKg: 68, ridePowerPct: 70 })).toEqual({
      weightKg: 68,
      powerW: 210,
    });
  });

  it('fills in defaults for anything not entered', () => {
    expect(riderFrom({})).toEqual({
      weightKg: RIDER_DEFAULTS.weightKg,
      powerW: (RIDER_DEFAULTS.ftpW * RIDER_DEFAULTS.ridePowerPct) / 100,
    });
    expect(riderFrom({ ftpW: 250 }).powerW).toBeCloseTo(250 * 0.65);
  });
});
