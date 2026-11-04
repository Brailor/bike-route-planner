import { describe, expect, it } from 'vitest';
import { distanceM, segmentLengthsM } from '../geo';
import gravelFixture from '../routing/graphhopper/__fixtures__/gravel-offroad-80.json';
import { mapRouteResponse, type GhRouteResponse } from '../routing/graphhopper/response';
import type { RouteResult } from '../routing/types';
import { elevationProfile, pointAtDistance } from './elevation';
import { classifySurface, perSegment, SURFACE_CATEGORIES, surfaceBreakdown } from './surface';

const route = mapRouteResponse(gravelFixture.response as unknown as GhRouteResponse);

describe('distanceM', () => {
  it('measures Wien Stephansplatz → Wien Hbf (~2.0 km)', () => {
    expect(distanceM([16.3725, 48.2085], [16.377, 48.1851])).toBeGreaterThan(2500);
    expect(distanceM([16.3725, 48.2085], [16.377, 48.1851])).toBeLessThan(2700);
  });

  it('sums up to GraphHopper’s route distance', () => {
    const total = segmentLengthsM(route.geometry.coordinates).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(route.distanceM, -1);
  });
});

describe('classifySurface', () => {
  it('uses the tag when present', () => {
    expect(classifySurface('asphalt', 'track', 'grade3')).toEqual({
      category: 'paved',
      inferred: false,
    });
    expect(classifySurface('fine_gravel', 'cycleway', 'missing')).toEqual({
      category: 'gravel',
      inferred: false,
    });
    expect(classifySurface('dirt', 'track', 'missing')).toEqual({
      category: 'ground',
      inferred: false,
    });
  });

  it('infers paved for untagged ordinary roads and grade1 tracks', () => {
    expect(classifySurface('missing', 'residential', 'missing')).toEqual({
      category: 'paved',
      inferred: true,
    });
    expect(classifySurface('missing', 'track', 'grade1')).toEqual({
      category: 'paved',
      inferred: true,
    });
  });

  it('infers from the track grade otherwise', () => {
    expect(classifySurface('missing', 'track', 'grade2').category).toBe('gravel');
    expect(classifySurface('missing', 'track', 'grade5').category).toBe('ground');
  });

  it('stays unknown when nothing reliable is tagged', () => {
    expect(classifySurface('missing', 'path', 'missing')).toEqual({
      category: 'unknown',
      inferred: false,
    });
    expect(classifySurface('other', 'residential', 'missing').category).toBe('unknown');
  });
});

describe('perSegment', () => {
  it('fills gaps with the fallback', () => {
    expect(perSegment([{ from: 1, to: 3, value: 'a' }], 4, '-')).toEqual(['-', 'a', 'a', '-']);
  });
});

describe('surfaceBreakdown', () => {
  it('splits the whole route into categories', () => {
    const breakdown = surfaceBreakdown(route);
    const total = SURFACE_CATEGORIES.reduce((sum, c) => sum + breakdown[c].meters, 0);
    expect(total).toBeCloseTo(route.distanceM, -1);
    expect(breakdown.paved.meters).toBeGreaterThan(0);
    expect(breakdown.ground.meters).toBeGreaterThan(0); // the fixture has dirt tracks
  });

  it('reports inferred metres separately', () => {
    const synthetic: RouteResult = {
      geometry: {
        type: 'LineString',
        coordinates: [
          [16, 48],
          [16.01, 48],
          [16.02, 48],
        ],
      },
      distanceM: 0,
      ascentM: 0,
      descentM: 0,
      durationS: 0,
      attributes: {
        surface: [{ from: 0, to: 2, value: 'missing' }],
        roadClass: [
          { from: 0, to: 1, value: 'residential' },
          { from: 1, to: 2, value: 'track' },
        ],
        trackType: [{ from: 0, to: 2, value: 'grade2' }],
        osmWayId: [],
        crossing: [],
      },
    };
    const b = surfaceBreakdown(synthetic);
    expect(b.paved.inferredMeters).toBeCloseTo(b.paved.meters);
    expect(b.gravel.inferredMeters).toBeCloseTo(b.gravel.meters);
    expect(b.paved.meters).toBeGreaterThan(700);
  });
});

describe('elevationProfile', () => {
  const profile = elevationProfile(route.geometry.coordinates);

  it('has one point per coordinate, with increasing distance', () => {
    expect(profile).toHaveLength(route.geometry.coordinates.length);
    expect(profile[0]?.distanceM).toBe(0);
    expect(profile.every((p, i) => i === 0 || p.distanceM >= profile[i - 1]!.distanceM)).toBe(true);
  });

  it('finds the nearest point for a distance', () => {
    const mid = profile[10]!;
    expect(pointAtDistance(profile, mid.distanceM + 0.1)?.index).toBe(10);
    expect(pointAtDistance(profile, -5)?.index).toBe(0);
    expect(pointAtDistance(profile, 1e9)?.index).toBe(profile.length - 1);
    expect(pointAtDistance([], 0)).toBeUndefined();
  });
});
