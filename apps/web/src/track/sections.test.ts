import { describe, expect, it } from 'vitest';
import { at, east, flagOn as flag, metres } from '../test/metres';
import {
  anchors,
  cumulativeM,
  flaggedSections,
  spliceDetour,
  type FlaggedSection,
} from './sections';

const TRACK = east(0, 1000);
const MIDDLE = flag('middle', east(400, 600, 50));

describe('flaggedSections', () => {
  it('finds the stretch of the track along a flag', () => {
    const [section, ...rest] = flaggedSections(TRACK, [MIDDLE]);
    expect(rest).toEqual([]);
    expect(section?.flagIds).toEqual(['middle']);
    // From just before the flag's avoided part (it starts 8 m in) to just after, within the matching distance.
    const along = cumulativeM(TRACK);
    expect(along[section?.from ?? -1]).toBeGreaterThanOrEqual(408 - 15 - 10);
    expect(along[section?.from ?? -1]).toBeLessThanOrEqual(408);
    expect(along[section?.to ?? -1]).toBeGreaterThanOrEqual(592);
    expect(along[section?.to ?? -1]).toBeLessThanOrEqual(592 + 15 + 10);
  });

  it('finds a flag drawn the other way', () => {
    const reversed = flag('reversed', east(600, 400, 50));
    expect(flaggedSections(TRACK, [reversed])).toHaveLength(1);
  });

  it('finds a recorded track that strays a little either side', () => {
    const noisy = TRACK.map((_, i) => at(i * 10, i % 2 ? 9 : -9));
    expect(flaggedSections(noisy, [MIDDLE])).toHaveLength(1);
  });

  it('a stray GPS point doesn’t split the stretch', () => {
    const stray = TRACK.map((p, i) => (i === 50 ? at(500, 40) : p));
    expect(flaggedSections(stray, [MIDDLE])).toHaveLength(1);
  });

  it('finds a planned track with one long segment along the flag', () => {
    expect(flaggedSections([at(0), at(1000)], [MIDDLE])).toEqual([
      { from: 0, to: 1, flagIds: ['middle'] },
    ]);
  });

  it('ignores a track that crosses the flagged way', () => {
    const crossing = flag('crossing', [at(500, -100), at(500, 100)]);
    expect(flaggedSections(TRACK, [crossing])).toEqual([]);
  });

  it('ignores a parallel way, and counts a GPS trace close to the flag', () => {
    expect(flaggedSections(east(0, 1000, 10, 30), [MIDDLE])).toEqual([]);
    expect(flaggedSections(east(0, 1000, 10, 10), [MIDDLE])).toHaveLength(1);
  });

  it('ignores a track that only touches the start of the flag', () => {
    const turning = [...east(0, 440), at(440, 100)];
    expect(flaggedSections(turning, [MIDDLE])).toEqual([]);
  });

  it('finds each pass of a track that rides the flag out and back', () => {
    const outAndBack = [...east(0, 1000), ...east(1000, 0).slice(1)];
    const sections = flaggedSections(outAndBack, [MIDDLE]);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.to).toBeLessThan(100);
    expect(sections[1]?.from).toBeGreaterThan(100);
  });

  it('asks once about a track that turns back just past a flag', () => {
    const turning = [...east(0, 650), ...east(650, 0).slice(1)];
    expect(flaggedSections(turning, [MIDDLE])).toEqual([
      expect.objectContaining({ flagIds: ['middle'] }),
    ]);
  });

  it('finds a flag with no length, where the track passes it', () => {
    const spot = flag('spot', [at(500), at(500)]);
    expect(flaggedSections(TRACK, [spot])).toHaveLength(1);
    expect(flaggedSections(east(0, 1000, 10, 30), [spot])).toEqual([]);
  });

  it('merges flags close together along the track, in track order', () => {
    const second = flag('second', east(250, 350, 50));
    const first = flag('first', east(100, 200, 50));
    expect(flaggedSections(TRACK, [second, first]).map((s) => s.flagIds)).toEqual([
      ['first', 'second'],
    ]);
    const far = flag('far', east(700, 800, 50));
    expect(flaggedSections(TRACK, [far, first]).map((s) => s.flagIds)).toEqual([
      ['first'],
      ['far'],
    ]);
  });

  it('finds nothing without flags or a track', () => {
    expect(flaggedSections(TRACK, [])).toEqual([]);
    expect(flaggedSections([at(500)], [MIDDLE])).toEqual([]);
  });
});

const SECTION: FlaggedSection = { from: 40, to: 60, flagIds: ['middle'] };
const BOUNDS = { min: 0, max: TRACK.length - 1 };

describe('anchors', () => {
  it('are the given distance along the track either side of the section', () => {
    expect(anchors(TRACK, SECTION, BOUNDS, 50)).toEqual([35, 65]);
    expect(anchors(TRACK, SECTION, BOUNDS, 300)).toEqual([10, 90]);
  });

  it('stay within the bounds', () => {
    expect(anchors(TRACK, SECTION, { min: 38, max: 62 }, 50)).toEqual([38, 62]);
  });
});

describe('spliceDetour', () => {
  it('drops the part of the way around that rides back along the track', () => {
    // From the anchor at 350 m back to a junction at 300 m, around, and from 700 m back to the anchor at 650 m.
    const detour = [...east(350, 300), at(300, 200), at(700, 200), ...east(700, 650)];
    const { coordinates, from, to } = spliceDetour(TRACK, SECTION, BOUNDS, [35, 65], detour);
    const route = coordinates.map(metres);
    expect(route.slice(29, 35)).toEqual([
      [290, 0],
      [300, 0],
      [300, 0],
      [300, 200],
      [700, 200],
      [700, 0],
    ]);
    expect(route[35]).toEqual([700, 0]);
    expect(route.at(-1)).toEqual([1000, 0]);
    expect([from, to]).toEqual([31, 34]);
    expect(route.slice(from, to + 1)).toEqual([
      [300, 0],
      [300, 200],
      [700, 200],
      [700, 0],
    ]);
  });

  it('drops the part of the way around that rides on along the track', () => {
    const detour = [...east(350, 380), at(380, 200), at(620, 200), ...east(620, 650)];
    const route = spliceDetour(TRACK, SECTION, BOUNDS, [35, 65], detour).coordinates.map(metres);
    expect(route.slice(37, 42)).toEqual([
      [370, 0],
      [380, 0],
      [380, 0],
      [380, 200],
      [620, 200],
    ]);
    expect(route.slice(42, 45)).toEqual([
      [620, 0],
      [620, 0],
      [630, 0],
    ]);
  });

  it('joins the way around at the anchors when it starts and ends off the track', () => {
    const detour = [at(350, 20), at(350, 200), at(650, 200), at(650, 20)];
    const { coordinates, from, to } = spliceDetour(TRACK, SECTION, BOUNDS, [35, 65], detour);
    expect(coordinates.map(metres)).toEqual([
      ...east(0, 350).map(metres),
      [350, 20],
      [350, 200],
      [650, 200],
      [650, 20],
      ...east(650, 1000).map(metres),
    ]);
    expect([from, to]).toEqual([36, 39]);
  });

  it('never cuts into the track beyond the bounds', () => {
    const detour = [...east(350, 300), at(300, 200), at(700, 200), ...east(700, 650)];
    const route = spliceDetour(
      TRACK,
      SECTION,
      { min: 32, max: 68 },
      [35, 65],
      detour,
    ).coordinates.map(metres);
    expect(route.slice(0, 33)).toEqual(east(0, 320).map(metres));
    expect(route.slice(-33)).toEqual(east(680, 1000).map(metres));
  });

  it('keeps the way around’s elevation only when the track has elevation', () => {
    const detour = [
      [...at(350), 200],
      [...at(350, 200), 210],
      [...at(650, 200), 220],
      [...at(650), 230],
    ];
    const flat = spliceDetour(TRACK, SECTION, BOUNDS, [35, 65], detour);
    expect(flat.coordinates.every((p) => p.length === 2)).toBe(true);
    const hilly = spliceDetour(
      TRACK.map((p) => [...p, 190]),
      SECTION,
      BOUNDS,
      [35, 65],
      detour,
    );
    expect(hilly.coordinates.slice(hilly.from, hilly.to + 1).map((p) => p[2])).toEqual([
      200, 210, 220, 230,
    ]);
  });

  it('splices in whole a way around too short to trim', () => {
    // Both points lie within reach of the track either side of a one-segment section.
    const short: FlaggedSection = { from: 40, to: 41, flagIds: ['middle'] };
    const { coordinates, from, to } = spliceDetour(
      TRACK,
      short,
      BOUNDS,
      [35, 46],
      [at(398, 3), at(412, 3)],
    );
    expect(coordinates.slice(from, to + 1).map(metres)).toEqual([
      [398, 3],
      [412, 3],
    ]);
  });

  it('rejoins the pass of the track nearest the section, not an earlier one over the same junction', () => {
    // North through the junction at (200, 0), round a loop, then east through it again, 5 m off the road.
    const looped = [
      ...Array.from({ length: 41 }, (_, i) => at(200, -200 + i * 10)),
      at(0, 200),
      at(0, 5),
      ...east(0, 1000, 10, 5),
    ];
    const [section] = flaggedSections(looped, [MIDDLE]);
    if (!section) throw new Error('no section');
    const bounds = { min: 0, max: looped.length - 1 };
    // Back along the road to the junction, then off south-east.
    const detour = [...east(350, 200), at(250, -150), at(700, -150), ...east(700, 650)];
    const { coordinates } = spliceDetour(
      looped,
      section,
      bounds,
      anchors(looped, section, bounds, 50),
      detour,
    );
    expect(coordinates.map(metres)).toContainEqual([0, 200]);
  });

  it('tells which of the old track it kept either side', () => {
    const detour = [...east(350, 300), at(300, 200), at(700, 200), ...east(700, 650)];
    expect(spliceDetour(TRACK, SECTION, BOUNDS, [35, 65], detour)).toMatchObject({
      kept: 30,
      resumed: 70,
    });
    expect(
      spliceDetour(TRACK, SECTION, BOUNDS, [35, 65], [at(350, 20), at(650, 20)]),
    ).toMatchObject({ kept: 35, resumed: 65 });
  });

  it('leaves the track it was given alone', () => {
    const track = TRACK.map((p) => [...p]);
    const { coordinates } = spliceDetour(track, SECTION, BOUNDS, [35, 65], [at(350), at(650)]);
    coordinates[0]![0] = 0;
    expect(track).toEqual(TRACK);
  });
});
