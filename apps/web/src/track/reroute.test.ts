import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../profiles/defaults';
import type { RouteRequest, RouteResult, RoutingEngine } from '../routing/types';
import { at, east, flagOn, metres, routeAlong as route } from '../test/metres';
import { rerouteSection, sectionBounds, spliceCost } from './reroute';
import { spliceDetour, type FlaggedSection } from './sections';

const TRACK = east(0, 1000);
const FLAG = flagOn('f', [at(400), at(600)], [7]);
const SECTIONS: FlaggedSection[] = [{ from: 40, to: 60, flagIds: ['f'] }];
const SETTINGS = DEFAULT_SETTINGS.gravel;

function engine(answer: (request: RouteRequest) => RouteResult) {
  const requests: RouteRequest[] = [];
  const fake: RoutingEngine = {
    route: (request) => {
      requests.push(request);
      return Promise.resolve(answer(request));
    },
    trace: () => Promise.reject(new Error('not used')),
    roundTrip: () => Promise.reject(new Error('not used')),
  };
  return { fake, requests };
}

describe('sectionBounds', () => {
  it('runs from the section before to the one after, or the track’s ends', () => {
    const sections = [
      { from: 10, to: 20, flagIds: [] },
      { from: 40, to: 50, flagIds: [] },
      { from: 70, to: 80, flagIds: [] },
    ];
    expect(sectionBounds(sections, 1, 101)).toEqual({ min: 20, max: 70 });
    expect(sectionBounds(sections, 0, 101)).toEqual({ min: 0, max: 40 });
    expect(sectionBounds(sections, 2, 101)).toEqual({ min: 50, max: 100 });
  });
});

describe('spliceCost', () => {
  it('is the riding added, plus a quarter of the track given up beyond the section', () => {
    // 200 m north and back adds 400 m; the track from 300 m to 400 m and 600 m to 700 m is given up.
    const splice = spliceDetour(
      TRACK,
      SECTIONS[0]!,
      { min: 0, max: 100 },
      [30, 70],
      [at(300), at(300, 200), at(700, 200), at(700)],
    );
    expect(spliceCost(TRACK, SECTIONS[0]!, splice)).toBeCloseTo(400 + 0.25 * 200, 0);
  });
});

/** Answers with a way `north` metres north of the track between the two points asked for. */
const northOf = (request: RouteRequest, north: number, wayId = 1) => {
  const [a = [0, 0], b = [0, 0]] = request.waypoints;
  const [ax = 0] = metres(a);
  const [bx = 0] = metres(b);
  return route([a, at(ax, north), at(bx, north), b], wayId);
};

describe('rerouteSection', () => {
  it('asks for ways around from each distance, avoiding every flag', async () => {
    const { fake, requests } = engine((r) => northOf(r, 100));
    await rerouteSection(fake, TRACK, SECTIONS, 0, { settings: SETTINGS, flags: [FLAG] });
    // 50 m, 300 m, then the track's ends for both 1 km and 3 km: asked for once.
    expect(requests.map((r) => r.waypoints.map(metres))).toEqual([
      [
        [350, 0],
        [650, 0],
      ],
      [
        [100, 0],
        [900, 0],
      ],
      [
        [0, 0],
        [1000, 0],
      ],
    ]);
    expect(requests.every((r) => r.settings === SETTINGS && r.flags?.[0] === FLAG)).toBe(true);
  });

  it('splices in the cheapest way around', async () => {
    // Close in, the only way around is 1 km out; from 300 m out, one 100 m out rejoins the track.
    const { fake } = engine((r) =>
      northOf(r, metres(r.waypoints[0] ?? [0, 0])[0] === 350 ? 1000 : 100),
    );
    const result = await rerouteSection(fake, TRACK, SECTIONS, 0, {
      settings: SETTINGS,
      flags: [FLAG],
    });
    if (result.outcome !== 'rerouted') throw new Error(result.outcome);
    const { coordinates, from, to } = result.splice;
    expect(coordinates.slice(from, to + 1).map(metres)).toEqual([
      [100, 0],
      [100, 100],
      [900, 100],
      [900, 0],
    ]);
  });

  it('keeps more of the track unless giving it up saves enough riding', async () => {
    // From further out, the ways around are 5 m shorter each side, but give up 250 m or more of the track each side.
    const { fake } = engine((r) =>
      northOf(r, metres(r.waypoints[0] ?? [0, 0])[0] === 350 ? 100 : 95),
    );
    const result = await rerouteSection(fake, TRACK, SECTIONS, 0, {
      settings: SETTINGS,
      flags: [FLAG],
    });
    if (result.outcome !== 'rerouted') throw new Error(result.outcome);
    expect(metres(result.splice.coordinates[result.splice.from] ?? [])).toEqual([350, 0]);
  });

  it('leaves out ways that still run along a flag', async () => {
    const { fake } = engine((r) =>
      metres(r.waypoints[0] ?? [0, 0])[0] === 100 ? northOf(r, 100) : northOf(r, 0, 7),
    );
    const result = await rerouteSection(fake, TRACK, SECTIONS, 0, {
      settings: SETTINGS,
      flags: [FLAG],
    });
    if (result.outcome !== 'rerouted') throw new Error(result.outcome);
    expect(metres(result.splice.coordinates[result.splice.from] ?? [])).toEqual([100, 0]);
  });

  it('finds no way around when every way still runs along the flag', async () => {
    const { fake } = engine(() => route(TRACK.slice(35, 66), FLAG.osmWayIds?.[0] ?? 0));
    expect(
      await rerouteSection(fake, TRACK, SECTIONS, 0, { settings: SETTINGS, flags: [FLAG] }),
    ).toEqual({ outcome: 'no_way_around' });
  });

  it('makes do with the answers that came back, and fails only when none did', async () => {
    const { fake } = engine((r) => {
      if (metres(r.waypoints[0] ?? [0, 0])[0] === 350) throw new Error('timeout');
      return northOf(r, 100);
    });
    const result = await rerouteSection(fake, TRACK, SECTIONS, 0, {
      settings: SETTINGS,
      flags: [FLAG],
    });
    expect(result.outcome).toBe('rerouted');

    const signal = new AbortController().signal;
    const failing: RoutingEngine = {
      route: (_, s) => Promise.reject(new Error(s === signal ? 'no route' : 'wrong signal')),
      trace: () => Promise.reject(new Error('not used')),
      roundTrip: () => Promise.reject(new Error('not used')),
    };
    await expect(
      rerouteSection(failing, TRACK, SECTIONS, 0, { settings: SETTINGS, flags: [FLAG] }, signal),
    ).rejects.toThrow('no route');
  });
});
