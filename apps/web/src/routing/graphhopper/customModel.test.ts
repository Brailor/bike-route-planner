import { describe, expect, it } from 'vitest';
import type { ProfileSettings } from '../../types';
import { buildCustomModel, LIKELY_PAVED, LIKELY_UNPAVED } from './customModel';

const factors = (settings: ProfileSettings) =>
  (buildCustomModel(settings)?.priority ?? []).map((s) => Number(s.multiply_by));

describe('buildCustomModel', () => {
  it('sends no model when nothing is adjusted', () => {
    expect(buildCustomModel({ profile: 'road' })).toBeUndefined();
    expect(buildCustomModel({ profile: 'gravel', offroadPreference: 50 })).toBeUndefined();
  });

  it('penalises likely-paved ways and cancels the cycle-network boost when off-road is preferred', () => {
    const model = buildCustomModel({ profile: 'gravel', offroadPreference: 100 });
    expect(model?.priority).toEqual([
      { if: LIKELY_PAVED, multiply_by: '0.3' },
      { if: `bike_network != MISSING && (${LIKELY_PAVED})`, multiply_by: '0.67' },
    ]);
  });

  it('penalises likely-unpaved ways when paved is preferred', () => {
    expect(buildCustomModel({ profile: 'mtb', offroadPreference: 0 })?.priority).toEqual([
      { if: LIKELY_UNPAVED, multiply_by: '0.3' },
    ]);
  });

  it('scales the penalty linearly with distance from neutral', () => {
    expect(factors({ profile: 'gravel', offroadPreference: 75 })[0]).toBe(0.65);
    expect(factors({ profile: 'gravel', offroadPreference: 25 })[0]).toBe(0.65);
  });

  it('ignores the off-road slider on the road profile', () => {
    expect(buildCustomModel({ profile: 'road', offroadPreference: 100 })).toBeUndefined();
  });

  it('penalises main roads when asked', () => {
    expect(buildCustomModel({ profile: 'road', avoidMainRoads: true })?.priority).toEqual([
      { if: 'road_class == TRUNK || road_class == PRIMARY', multiply_by: '0.2' },
      { if: 'road_class == SECONDARY', multiply_by: '0.5' },
    ]);
  });

  // ADR 0002: GraphHopper rejects any multiply_by outside [0, 1] under LM.
  it('only ever emits LM-safe factors', () => {
    for (const profile of ['road', 'gravel', 'mtb'] as const)
      for (let p = -20; p <= 120; p += 5)
        for (const avoidMainRoads of [false, true])
          for (const f of factors({ profile, offroadPreference: p, avoidMainRoads })) {
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThanOrEqual(1);
          }
  });
});
