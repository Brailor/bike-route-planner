import { describe, expect, it } from 'vitest';
import { perSegment, surfaceBreakdown } from '../route/surface';
import type { RouteAttributes, Span } from '../routing/types';
import { at, east } from '../test/metres';
import { matchedSegments, spliceAttributes, trackAttributes, UNMATCHED } from './roads';
import { spliceDetour, type FlaggedSection } from './sections';

/** Matched roads: a line, with surfaces and way IDs as spans over its segments. */
function roads(
  coordinates: number[][],
  surface: Span<string>[],
  osmWayId: Span<number | null>[] = [],
) {
  const attributes: RouteAttributes = {
    surface,
    roadClass: [],
    trackType: [],
    osmWayId,
    crossing: [],
  };
  return { geometry: { type: 'LineString' as const, coordinates }, attributes };
}

/** One value per segment of the track, from its spans. */
const values = <T>(spans: Span<T>[], track: unknown[], fallback: T) =>
  perSegment(spans, track.length - 1, fallback);

describe('trackAttributes', () => {
  // A road east from 0 to 1000 m: asphalt to 500 m, gravel after.
  const ROAD = roads(
    [at(0), at(500), at(1000)],
    [
      { from: 0, to: 1, value: 'asphalt' },
      { from: 1, to: 2, value: 'gravel' },
    ],
  );

  it('gives each segment of a recorded track the surface of the road beside it', () => {
    const noisy = east(0, 1000).map((_, i) => at(i * 10, i % 2 ? 8 : -8));
    const surface = values(trackAttributes(noisy, ROAD).surface, noisy, '');
    expect(surface.slice(0, 50).every((s) => s === 'asphalt')).toBe(true);
    expect(surface.slice(50).every((s) => s === 'gravel')).toBe(true);
  });

  it('works whether the track has more points than the roads, or fewer', () => {
    const dense = roads(east(0, 1000), [
      { from: 0, to: 50, value: 'asphalt' },
      { from: 50, to: 100, value: 'gravel' },
    ]);
    const sparse = east(0, 1000, 100);
    expect(values(trackAttributes(sparse, dense).surface, sparse, '')).toEqual([
      ...Array<string>(5).fill('asphalt'),
      ...Array<string>(5).fill('gravel'),
    ]);
  });

  it('marks a stretch away from every road as unmatched, so its surface is unknown', () => {
    // 100 m north of the road between 400 m and 600 m.
    const away = [...east(0, 390), ...east(400, 600, 10, 100), ...east(610, 1000)];
    const surface = values(trackAttributes(away, ROAD).surface, away, '');
    expect(surface.filter((s) => s === UNMATCHED).length).toBeGreaterThanOrEqual(20);
    expect(surface[0]).toBe('asphalt');
    expect(surface.at(-1)).toBe('gravel');
    const geometry = { type: 'LineString' as const, coordinates: away };
    const breakdown = surfaceBreakdown({ geometry, attributes: trackAttributes(away, ROAD) });
    expect(breakdown.unknown.meters).toBeGreaterThan(200);
    expect(breakdown.unknown.inferredMeters).toBe(0);
  });

  it('finds the road again after a long stretch off it', () => {
    // 1.5 km out north and back, at 300 m along the road.
    const loop = [...east(0, 300), at(300, 750), at(310, 0), ...east(320, 1000)];
    const surface = values(trackAttributes(loop, ROAD).surface, loop, '');
    expect(surface.at(-1)).toBe('gravel');
  });

  it('matches a road ridden out and back pass by pass', () => {
    // The matched path rides the road out (way 1) and back (way 2); so does the track.
    const out = east(0, 1000, 100);
    const back = east(1000, 0, 100).slice(1);
    const path = roads(
      [...out, ...back],
      [{ from: 0, to: 20, value: 'asphalt' }],
      [
        { from: 0, to: 10, value: 1 },
        { from: 10, to: 20, value: 2 },
      ],
    );
    const track = [...east(0, 1000, 25), ...east(1000, 0, 25).slice(1)];
    const ids = values(trackAttributes(track, path).osmWayId, track, null);
    expect(ids.slice(0, 40).every((id) => id === 1)).toBe(true);
    expect(ids.slice(40).every((id) => id === 2)).toBe(true);
  });

  it('keeps a road without a surface tag as untagged, for the surface to be estimated', () => {
    const untagged = roads([at(0), at(1000)], []);
    const track = east(0, 1000, 100);
    expect(trackAttributes(track, untagged).surface).toEqual([
      { from: 0, to: 10, value: 'missing' },
    ]);
  });

  it('carries every attribute over, not just the surface', () => {
    const path = {
      ...ROAD,
      attributes: {
        ...ROAD.attributes,
        roadClass: [{ from: 0, to: 2, value: 'track' }],
        trackType: [{ from: 0, to: 2, value: 'grade2' }],
        osmWayId: [{ from: 0, to: 2, value: 42 }],
        crossing: [{ from: 0, to: 2, value: 'no' }],
      },
    };
    const track = east(0, 1000, 100);
    expect(trackAttributes(track, path)).toMatchObject({
      roadClass: [{ from: 0, to: 10, value: 'track' }],
      trackType: [{ from: 0, to: 10, value: 'grade2' }],
      osmWayId: [{ from: 0, to: 10, value: 42 }],
      crossing: [{ from: 0, to: 10, value: 'no' }],
    });
  });
});

describe('matchedSegments', () => {
  it('only looks forward along the roads', () => {
    // East and back along one road: once on the way back, the way out is behind.
    const path = [at(0), at(500), at(0)];
    const track = [at(0, 3), at(300, 3), at(500, 3), at(450, 3), at(440, 3), at(430, 3)];
    expect(matchedSegments(track, path)).toEqual([0, 0, 1, 1, 1]);
  });

  it('has no heading for a track segment too short to have one', () => {
    // Standing still at 450 m (GPS jitter half a metre back), beside both passes: the pass out it was on.
    const path = [at(0), at(500), at(0)];
    expect(matchedSegments([at(300, 3), at(450, 3), at(449.5, 3)], path)).toEqual([0, 0]);
  });

  /** A lap round a 200 m square, `inset` metres in from its corners, a point every `step` metres. */
  const lap = (inset: number, step: number) => {
    const [lo, hi] = [inset, 200 - inset];
    const side = (from: number[], to: number[]) => {
      const n = Math.round(Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!) / step);
      return Array.from({ length: n }, (_, k) =>
        at(from[0]! + ((to[0]! - from[0]!) * k) / n, from[1]! + ((to[1]! - from[1]!) * k) / n),
      );
    };
    const corners = [
      [lo, lo],
      [hi, lo],
      [hi, hi],
      [lo, hi],
    ];
    return corners.flatMap((c, k) => side(c, corners[(k + 1) % 4]!));
  };

  it('matches laps lap by lap', () => {
    // Two laps of the same square, ridden twice.
    const once = lap(0, 50);
    const path = [...once, ...once, at(0)];
    const track = [...lap(5, 10), ...lap(5, 10), at(5, 5)];
    const index = matchedSegments(track, path);
    const half = (track.length - 1) / 2;
    expect(index.slice(0, half).every((j) => j !== undefined && j < once.length)).toBe(true);
    expect(index.slice(half + 2).every((j) => j !== undefined && j >= once.length)).toBe(true);
  });

  it('doesn’t reach ahead to a later lap, even one closer to the track', () => {
    // The matched path goes round twice, the second time 3 m closer; the track only once.
    const first = lap(0, 50);
    const path = [...first, ...lap(3, 50), at(3, 3)];
    const track = [...lap(5, 10), at(5, 5)];
    expect(matchedSegments(track, path).every((j) => j !== undefined && j < first.length)).toBe(
      true,
    );
  });

  it('looks as far ahead along the roads as the track went while off them', () => {
    // The road is mapped every 10 m; the track runs 100 m north of it from 100 m to 900 m, then back on it.
    const path = east(0, 1000);
    const track = [...east(0, 100), ...east(110, 890, 10, 100), ...east(900, 1000)];
    const index = matchedSegments(track, path);
    expect(index.at(-1)).toBe(99);
  });
});

describe('spliceAttributes', () => {
  const TRACK = east(0, 1000);
  const SECTION: FlaggedSection = { from: 40, to: 60, flagIds: ['f'] };
  const ASPHALT: RouteAttributes = {
    surface: [{ from: 0, to: 100, value: 'asphalt' }],
    roadClass: [{ from: 0, to: 100, value: 'residential' }],
    trackType: [],
    osmWayId: [{ from: 0, to: 100, value: 1 }],
    crossing: [],
  };

  it('puts the way around’s own attributes in its place', () => {
    // Back along the track's road to a junction at 300 m, round on gravel (way 7), and from 700 m back along it.
    const coordinates = [...east(350, 300), at(300, 200), at(700, 200), ...east(700, 650)];
    const detour = roads(
      coordinates,
      [
        { from: 0, to: 5, value: 'paving_stones' },
        { from: 5, to: 8, value: 'gravel' },
        { from: 8, to: 13, value: 'paving_stones' },
      ],
      [
        { from: 0, to: 5, value: 1 },
        { from: 5, to: 8, value: 7 },
        { from: 8, to: 13, value: 1 },
      ],
    );
    const splice = spliceDetour(TRACK, SECTION, { min: 0, max: 100 }, [35, 65], coordinates);
    const spliced = spliceAttributes(ASPHALT, TRACK.length, detour, splice);
    // Up to the junction (and the join onto the way around) the old track's; then the way around's three segments.
    expect(spliced.surface).toEqual([
      { from: 0, to: 31, value: 'asphalt' },
      { from: 31, to: 34, value: 'gravel' },
      { from: 34, to: splice.coordinates.length - 1, value: 'asphalt' },
    ]);
    expect(spliced.osmWayId.map((s) => s.value)).toEqual([1, 7, 1]);
    // What the way around doesn't say is untagged.
    expect(spliced.roadClass).toEqual([
      { from: 0, to: 31, value: 'residential' },
      { from: 31, to: 34, value: 'missing' },
      { from: 34, to: splice.coordinates.length - 1, value: 'residential' },
    ]);
  });
});
