import { describe, expect, it } from 'vitest';
import type { AvoidFlag, ProfileSettings } from '../../types';
import { buildCustomModel, FLAG_FACTOR, LIKELY_PAVED, LIKELY_UNPAVED } from './customModel';

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

describe('buildCustomModel with flags', () => {
  const flag = (id: string, osmWayIds?: number[]): AvoidFlag => ({
    id,
    geometry: {
      type: 'LineString',
      coordinates: [
        [16.56, 48.2],
        [16.562, 48.2],
      ],
    },
    createdAt: '2026-11-03T00:00:00Z',
    ...(osmWayIds && { osmWayIds }),
  });

  it('penalises each flag only on its own ways, inside its own area', () => {
    const model = buildCustomModel({ profile: 'road' }, [flag('a', [1, 2]), flag('b', [3])]);
    expect(model?.areas?.features.map((f) => f.id)).toEqual(['flag_0', 'flag_1']);
    expect(model?.areas?.features.every((f) => f.geometry.type === 'Polygon')).toBe(true);
    expect(model?.priority).toEqual([
      { if: 'in_flag_0 && (osm_way_id == 1 || osm_way_id == 2)', multiply_by: FLAG_FACTOR },
      { if: 'in_flag_1 && (osm_way_id == 3)', multiply_by: FLAG_FACTOR },
    ]);
  });

  it('falls back to the whole area when a flag has no ways recorded', () => {
    expect(buildCustomModel({ profile: 'road' }, [flag('a')])?.priority).toEqual([
      { if: 'in_flag_0', multiply_by: FLAG_FACTOR },
    ]);
  });

  it('adds the flag rules after the profile settings', () => {
    const model = buildCustomModel({ profile: 'road', avoidMainRoads: true }, [flag('a', [1])]);
    expect(model?.priority?.map((s) => s.if)).toEqual([
      'road_class == TRUNK || road_class == PRIMARY',
      'road_class == SECONDARY',
      'in_flag_0 && (osm_way_id == 1)',
    ]);
  });

  it('avoids strongly, but within LM limits and without blocking', () => {
    expect(Number(FLAG_FACTOR)).toBeGreaterThan(0);
    expect(Number(FLAG_FACTOR)).toBeLessThanOrEqual(0.01);
  });
});
