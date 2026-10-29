import { describe, expect, it } from 'vitest';
import gravelFixture from '../routing/graphhopper/__fixtures__/gravel-offroad-80.json';
import { mapRouteResponse, type GhRouteResponse } from '../routing/graphhopper/response';
import { insertionIndex, nearestIndex, surfaceRuns } from './routeGeometry';

const route = mapRouteResponse(gravelFixture.response as unknown as GhRouteResponse);

describe('surfaceRuns', () => {
  const runs = surfaceRuns(route);

  it('covers every segment exactly once, joined end to end', () => {
    const segments = runs.features.reduce((n, f) => n + f.geometry.coordinates.length - 1, 0);
    expect(segments).toBe(route.geometry.coordinates.length - 1);
    runs.features.slice(1).forEach((f, i) => {
      expect(f.geometry.coordinates[0]).toEqual(runs.features[i]!.geometry.coordinates.at(-1));
    });
  });

  it('merges neighbours with the same class', () => {
    runs.features.slice(1).forEach((f, i) => {
      const prev = runs.features[i]!.properties;
      expect(
        f.properties.category !== prev.category || f.properties.inferred !== prev.inferred,
      ).toBe(true);
    });
  });
});

describe('nearestIndex / insertionIndex', () => {
  // A straight east-west line with points every 0.01°.
  const line = Array.from({ length: 11 }, (_, i) => [16 + i * 0.01, 48]);

  it('finds the closest coordinate', () => {
    expect(nearestIndex(line, [16.042, 48.001])).toBe(4);
  });

  it('inserts between start and end on a two-point route', () => {
    expect(
      insertionIndex(
        line,
        [
          [16, 48],
          [16.1, 48],
        ],
        5,
      ),
    ).toBe(1);
  });

  it('inserts into the leg the dragged point belongs to', () => {
    const waypoints: [number, number][] = [
      [16, 48],
      [16.03, 48],
      [16.07, 48],
      [16.1, 48],
    ];
    expect(insertionIndex(line, waypoints, 2)).toBe(1);
    expect(insertionIndex(line, waypoints, 5)).toBe(2);
    expect(insertionIndex(line, waypoints, 9)).toBe(3);
  });
});
