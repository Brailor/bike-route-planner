import { afterEach, describe, expect, it } from 'vitest';
import { sectionBounds } from '../track/reroute';
import { spliceDetour } from '../track/sections';
import { at, east, flagOn, metres, routeAlong } from '../test/metres';
import { fixtureRoute } from '../test/route';
import type { LonLat } from '../types';
import { durationWorkout } from '../workouts/workout';
import { usePlanner, type RankedLoop } from './store';

const initial = usePlanner.getState();
const state = () => usePlanner.getState();

describe('waypoint undo/redo', () => {
  afterEach(() => usePlanner.setState(initial, true));

  it('undoes and redoes each kind of edit', () => {
    const {
      addWaypoint,
      insertWaypoint,
      moveWaypoint,
      removeWaypoint,
      clearWaypoints,
      undo,
      redo,
    } = state();
    addWaypoint([16, 48]);
    addWaypoint([16.2, 48]);
    insertWaypoint(1, [16.1, 48.1]);
    moveWaypoint(2, [16.3, 48]);
    removeWaypoint(1);
    clearWaypoints();
    expect(state().waypoints).toEqual([]);

    undo();
    expect(state().waypoints).toEqual([
      [16, 48],
      [16.3, 48],
    ]);
    undo();
    expect(state().waypoints).toEqual([
      [16, 48],
      [16.1, 48.1],
      [16.3, 48],
    ]);
    undo();
    undo();
    expect(state().waypoints).toEqual([
      [16, 48],
      [16.2, 48],
    ]);

    redo();
    redo();
    expect(state().waypoints).toEqual([
      [16, 48],
      [16.1, 48.1],
      [16.3, 48],
    ]);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    state().undo();
    state().redo();
    expect(state().waypoints).toEqual([]);
  });

  it('drops the redo stack on a new edit', () => {
    state().addWaypoint([16, 48]);
    state().undo();
    expect(state().future).toHaveLength(1);
    state().addWaypoint([17, 48]);
    expect(state().future).toHaveLength(0);
    state().redo();
    expect(state().waypoints).toEqual([[17, 48]]);
  });

  it('does not record profile or settings changes', () => {
    state().addWaypoint([16, 48]);
    state().setProfile('road');
    state().updateSettings({ avoidMainRoads: true });
    expect(state().past).toHaveLength(1);
  });

  it('caps the history', () => {
    for (let i = 0; i < 150; i++) state().addWaypoint([16 + i / 1000, 48]);
    expect(state().past).toHaveLength(100);
  });
});

describe('flag selection', () => {
  afterEach(() => usePlanner.setState(initial, true));

  it('needs a route', () => {
    state().startFlagSelection();
    expect(state().flagSelection).toBeUndefined();
  });

  it('starts with two handles on the route and moves each one', () => {
    state().setRoute(fixtureRoute);
    state().startFlagSelection();
    const { a, b } = state().flagSelection!;
    const last = fixtureRoute.geometry.coordinates.length - 1;
    expect(0 < a && a < b && b < last).toBe(true);

    state().moveFlagHandle('b', 3);
    expect(state().flagSelection).toEqual({ a, b: 3 });
    state().moveFlagHandle('a', 1);
    expect(state().flagSelection).toEqual({ a: 1, b: 3 });
  });

  it('ignores handle moves when not selecting', () => {
    state().moveFlagHandle('a', 1);
    expect(state().flagSelection).toBeUndefined();
  });

  it('ends on cancel, and when the route changes', () => {
    state().setRoute(fixtureRoute);
    state().startFlagSelection();
    state().cancelFlagSelection();
    expect(state().flagSelection).toBeUndefined();

    state().startFlagSelection();
    state().setRoute({ ...fixtureRoute });
    expect(state().flagSelection).toBeUndefined();
  });
});

describe('start and destination from address search', () => {
  afterEach(() => usePlanner.setState(initial, true));

  const graz = { name: 'Graz', point: [15.44, 47.07] as [number, number] };
  const gyor = { name: 'Győr', point: [17.63, 47.68] as [number, number] };
  const wien = { name: 'Wien', point: [16.37, 48.21] as [number, number] };

  it('sets the start, then adds the destination after it', () => {
    state().setStart(graz);
    expect(state().waypoints).toEqual([graz.point]);
    state().setDestination(gyor);
    expect(state().waypoints).toEqual([graz.point, gyor.point]);
  });

  it('replaces the ends and keeps the via points', () => {
    state().addWaypoint([16, 48]);
    state().addWaypoint([16.1, 48.1]);
    state().addWaypoint([16.2, 48.2]);
    state().setStart(graz);
    state().setDestination(gyor);
    expect(state().waypoints).toEqual([graz.point, [16.1, 48.1], gyor.point]);
  });

  it('needs a start before a destination', () => {
    state().setDestination(gyor);
    expect(state().waypoints).toEqual([]);
    expect(state().past).toEqual([]);
  });

  it('names the picked points, by position', () => {
    state().setStart(graz);
    state().setDestination(gyor);
    expect(state().placeNames).toEqual({ '15.44,47.07': 'Graz', '17.63,47.68': 'Győr' });
  });

  it('is undoable like any waypoint edit', () => {
    state().setStart(graz);
    state().setStart(wien);
    state().undo();
    expect(state().waypoints).toEqual([graz.point]);
  });

  it('asks the map to show the waypoints, with a new request each time', () => {
    state().setStart(graz);
    const first = state().mapFocus;
    expect(first).toEqual({ points: [graz.point] });
    state().setDestination(gyor);
    expect(state().mapFocus).toEqual({ points: [graz.point, gyor.point] });
    state().setDestination(gyor);
    expect(state().mapFocus).not.toBe(first);
  });

  it('does not move the map for edits on the map', () => {
    state().addWaypoint([16, 48]);
    expect(state().mapFocus).toBeUndefined();
  });
});

describe('flags', () => {
  afterEach(() => usePlanner.setState(initial, true));

  it('confirms the selected stretch as a flag and ends the selection', () => {
    state().setRoute(fixtureRoute);
    state().startFlagSelection();
    state().moveFlagHandle('a', 2);
    state().moveFlagHandle('b', 5);
    state().confirmFlag({ reason: 'private', note: 'gate' });

    expect(state().flagSelection).toBeUndefined();
    const [flag] = state().flags;
    expect(flag).toMatchObject({ reason: 'private', note: 'gate' });
    expect(flag?.geometry.coordinates).toEqual(fixtureRoute.geometry.coordinates.slice(2, 6));
    expect(flag?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('confirms nothing without a selection', () => {
    state().setRoute(fixtureRoute);
    state().confirmFlag({});
    expect(state().flags).toEqual([]);
  });

  it('puts loaded flags first, keeping ones made before they arrived', () => {
    state().setRoute(fixtureRoute);
    state().startFlagSelection();
    state().confirmFlag({});
    const early = state().flags[0]!;
    const saved = { ...early, id: 'saved', createdAt: '2026-10-01T00:00:00.000Z' };
    state().loadFlags([saved, early]);
    expect(state().flags.map((f) => f.id)).toEqual(['saved', early.id]);
  });
});

describe('editing flags', () => {
  afterEach(() => usePlanner.setState(initial, true));

  function twoFlags() {
    state().setRoute(fixtureRoute);
    for (const reason of ['private', 'overgrown'] as const) {
      state().startFlagSelection();
      state().confirmFlag({ reason });
    }
    return state().flags.map((f) => f.id) as [string, string];
  }

  it('updates one flag’s details and closes the editor', () => {
    const [a, b] = twoFlags();
    const untouched = state().flags[1];
    state().editFlag(a);
    state().updateFlag(a, { reason: 'too_steep', note: 'walked' });
    expect(state().flags[0]).toMatchObject({ id: a, reason: 'too_steep', note: 'walked' });
    expect(state().flags[1]).toBe(untouched);
    expect(state().flags[1]?.id).toBe(b);
    expect(state().editingFlagId).toBeUndefined();
  });

  it('deletes a flag, closing its editor', () => {
    const [a, b] = twoFlags();
    state().editFlag(a);
    state().deleteFlag(a);
    expect(state().flags.map((f) => f.id)).toEqual([b]);
    expect(state().editingFlagId).toBeUndefined();
  });

  it('keeps another flag open when one is deleted', () => {
    const [a, b] = twoFlags();
    state().editFlag(b);
    state().deleteFlag(a);
    expect(state().editingFlagId).toBe(b);
  });

  it('closes the editor when the flags are hidden', () => {
    const [a] = twoFlags();
    state().editFlag(a);
    state().setFlagsVisible(false);
    expect(state().flagsVisible).toBe(false);
    expect(state().editingFlagId).toBeUndefined();
    state().setFlagsVisible(true);
    expect(state().flagsVisible).toBe(true);
  });

  it('brings a flag into view on request', () => {
    state().showOnMap([
      [16.5, 48.2],
      [16.6, 48.2],
    ]);
    expect(state().mapFocus).toEqual({
      points: [
        [16.5, 48.2],
        [16.6, 48.2],
      ],
    });
  });
});

describe('marking a flag on the map', () => {
  afterEach(() => usePlanner.setState(initial, true));

  const a: [number, number] = [16.56, 48.2];
  const b: [number, number] = [16.57, 48.2];
  const c: [number, number] = [16.58, 48.2];

  it('starts a draft, ending an on-route selection', () => {
    state().setRoute(fixtureRoute);
    state().startFlagSelection();
    state().startFlagDraft();
    expect(state().flagSelection).toBeUndefined();
    expect(state().flagDraft).toEqual({ points: [], trace: undefined, error: undefined });
    state().startFlagSelection();
    expect(state().flagDraft).toBeUndefined();
  });

  it('takes two ends; later clicks are ignored', () => {
    state().startFlagDraft();
    for (const p of [a, b, c]) state().addDraftPoint(p);
    expect(state().flagDraft?.points).toEqual([a, b]);
  });

  it('drops the trace when the points change, and ignores a stale one', () => {
    state().startFlagDraft();
    state().addDraftPoint(a);
    state().addDraftPoint(b);
    const traced = state().flagDraft!.points;
    state().setDraftTrace(traced, fixtureRoute);
    expect(state().flagDraft?.trace).toBe(fixtureRoute);

    state().moveDraftPoint(1, c);
    expect(state().flagDraft?.trace).toBeUndefined();
    state().setDraftTrace(traced, fixtureRoute); // answer for the old points
    expect(state().flagDraft?.trace).toBeUndefined();
    state().setDraftError(traced, 'late');
    expect(state().flagDraft?.error).toBeUndefined();
  });

  it('records a trace error for the current points', () => {
    state().startFlagDraft();
    state().addDraftPoint(a);
    state().addDraftPoint(b);
    state().setDraftError(state().flagDraft!.points, 'No road or path');
    expect(state().flagDraft).toMatchObject({ trace: undefined, error: 'No road or path' });
  });

  it('confirms the whole trace as a flag', () => {
    state().startFlagDraft();
    state().addDraftPoint(a);
    state().addDraftPoint(b);
    state().setDraftTrace(state().flagDraft!.points, fixtureRoute);
    state().confirmDraft({ reason: 'private' });
    expect(state().flagDraft).toBeUndefined();
    expect(state().flags[0]).toMatchObject({ reason: 'private' });
    expect(state().flags[0]?.geometry.coordinates).toEqual(fixtureRoute.geometry.coordinates);
  });

  it('confirms nothing before the trace is in', () => {
    state().startFlagDraft();
    state().addDraftPoint(a);
    state().addDraftPoint(b);
    state().confirmDraft({});
    expect(state().flags).toEqual([]);
    expect(state().flagDraft).toBeDefined();
  });
});

describe('rider settings', () => {
  it('updates fields, and clears one with undefined', () => {
    state().updateUserSettings({ ftpW: 250, weightKg: 70 });
    state().updateUserSettings({ ftpW: undefined, ridePowerPct: 60 });
    expect(state().userSettings).toEqual({ weightKg: 70, ridePowerPct: 60 });
    expect(state().userSettings.ftpW).toBeUndefined();
  });

  it('loads saved settings, keeping fields entered before they arrived', () => {
    state().updateUserSettings({ weightKg: 70 });
    state().loadUserSettings({ ftpW: 280, weightKg: 82 });
    expect(state().userSettings).toEqual({ ftpW: 280, weightKg: 70 });
  });
});

describe('loop search', () => {
  const ranked = (route = fixtureRoute): RankedLoop => ({
    loop: { source: 'round_trip', route, ride: { durationS: 600, timesS: [] } },
    score: {
      total: 0.8,
      time: 1,
      intervals: undefined,
      flow: 1,
      surface: 1,
      variety: 1,
      usesFlag: false,
      intervalOnDescent: false,
    },
  });
  const ready = () => {
    state().addWaypoint([16.56, 48.2]);
    state().setWorkout(durationWorkout('1 h ride', 3600));
    state().searchLoops();
    return state().loops!.request;
  };

  it('needs a start point and a workout', () => {
    state().searchLoops();
    expect(state().loops).toBeUndefined();
    state().setWorkout(durationWorkout('1 h ride', 3600));
    state().searchLoops();
    expect(state().loops).toBeUndefined();
    state().setWorkout(undefined);
    state().addWaypoint([16.56, 48.2]);
    state().searchLoops();
    expect(state().loops).toBeUndefined();
    state().setWorkout(durationWorkout('1 h ride', 3600));
    state().searchLoops();
    expect(state().loops).toMatchObject({ status: 'searching', request: { start: [16.56, 48.2] } });
  });

  it('stores results for the current search, selects the best and brings them into view', () => {
    const request = ready();
    state().setLoopResults(request, [ranked(), ranked()]);
    expect(state().loops).toMatchObject({ status: 'ready', selected: 0 });
    const coords = fixtureRoute.geometry.coordinates;
    const lons = coords.map((c) => c[0]!);
    expect(state().mapFocus?.points[0]![0]).toBe(Math.min(...lons));
    expect(state().mapFocus?.points[1]![0]).toBe(Math.max(...lons));
  });

  it('ignores answers to an older search, and after closing', () => {
    const old = ready();
    state().searchLoops();
    state().setLoopResults(old, [ranked()]);
    state().setLoopError(old, 'late');
    expect(state().loops).toMatchObject({ status: 'searching', results: [] });
    const current = state().loops!.request;
    state().closeLoops();
    state().setLoopResults(current, [ranked()]);
    expect(state().loops).toBeUndefined();
  });

  it('records an error', () => {
    const request = ready();
    state().setLoopError(request, 'No loops');
    expect(state().loops).toMatchObject({ status: 'error', error: 'No loops' });
  });

  it('selects among the results only', () => {
    const request = ready();
    state().setLoopResults(request, [ranked(), ranked()]);
    state().setHoverIndex(3);
    state().selectLoop(1);
    expect(state().loops?.selected).toBe(1);
    expect(state().hoverIndex).toBeUndefined(); // it pointed into the other loop
    state().selectLoop(2);
    state().selectLoop(-1);
    expect(state().loops?.selected).toBe(1);
  });
});

describe('loop direction', () => {
  const ranked = (total: number): RankedLoop => ({
    loop: { source: 'round_trip', route: fixtureRoute, ride: { durationS: 600, timesS: [] } },
    score: {
      total,
      time: 1,
      intervals: undefined,
      flow: 1,
      surface: 1,
      variety: 1,
      usesFlag: false,
      intervalOnDescent: false,
    },
  });
  const ready = () => {
    state().addWaypoint([16.56, 48.2]);
    state().setWorkout(durationWorkout('1 h ride', 3600));
    state().searchLoops();
    const request = state().loops!.request;
    state().setLoopResults(request, [ranked(0.8), ranked(0.7)]);
    return request;
  };

  it('asks for the loop the other way, then swaps it in, keeping this way to switch back to', () => {
    const request = ready();
    state().reverseLoop(1);
    expect(state().loops?.reversing).toBe(1);
    state().reverseLoop(0); // one at a time
    expect(state().loops?.reversing).toBe(1);

    state().setReversedLoop(request, 1, ranked(0.9));
    const [first, second] = state().loops!.results;
    expect(state().loops?.reversing).toBeUndefined();
    expect(second?.score.total).toBe(0.9);
    expect(second?.other?.score.total).toBe(0.7);
    expect(first?.score.total).toBe(0.8); // others untouched

    // Back again at once, without fetching.
    state().reverseLoop(1);
    expect(state().loops?.reversing).toBeUndefined();
    expect(state().loops?.results[1]?.score.total).toBe(0.7);
    expect(state().loops?.results[1]?.other?.score.total).toBe(0.9);
    expect(state().loops?.results[1]?.other?.other).toBeUndefined();
  });

  it('ignores reversals for an older search, and records failures', () => {
    const old = ready();
    state().reverseLoop(0);
    state().setReverseError(old, 'No way round');
    expect(state().loops).toMatchObject({ reversing: undefined, reverseError: 'No way round' });
    state().selectLoop(1);
    expect(state().loops?.reverseError).toBeUndefined();

    state().searchLoops();
    state().setLoopResults(state().loops!.request, [ranked(0.6)]);
    state().setReversedLoop(old, 0, ranked(0.9));
    state().setReverseError(old, 'late');
    expect(state().loops?.results[0]?.score.total).toBe(0.6);
    expect(state().loops?.reverseError).toBeUndefined();
  });
});

describe('opened tracks', () => {
  // Flags at 200–300 m and 700–800 m along a 1 km track.
  const TRACK = east(0, 1000);
  const FIRST = flagOn('first', east(200, 300, 50));
  const SECOND = flagOn('second', east(700, 800, 50));

  function open() {
    state().loadFlags([FIRST, SECOND]);
    state().openTrack('Sunday ride', TRACK, 'none');
    const track = state().track;
    if (!track) throw new Error('no track');
    return track;
  }

  /** The first section rerouted 100 m north, 2 points longer than the stretch it replaces. */
  function detourFor(track: NonNullable<ReturnType<typeof state>['track']>) {
    const [section] = track.sections;
    if (!section) throw new Error('no section');
    const splice = spliceDetour(
      track.coordinates,
      section,
      sectionBounds(track.sections, 0, track.coordinates.length),
      [section.from - 1, section.to + 1],
      [at(150, 100), at(350, 100)],
    );
    return { section, splice, detour: routeAlong([at(150, 100), at(350, 100)], 99) };
  }

  it('opens a track with the sections along flags, showing the first', () => {
    const track = open();
    expect(track).toMatchObject({ name: 'Sunday ride', current: 0, rerouting: undefined });
    expect(track.sections.map((s) => s.flagIds)).toEqual([['first'], ['second']]);
    const [first] = track.sections;
    const shown = state().mapFocus?.points ?? [];
    expect(shown[0]?.[0]).toBeCloseTo(TRACK[first?.from ?? -1]?.[0] ?? 0, 6);
    expect(shown[1]?.[0]).toBeCloseTo(TRACK[first?.to ?? -1]?.[0] ?? 0, 6);
  });

  it('shows the whole track when it runs along no flag', () => {
    state().openTrack('Clear', TRACK, 'none');
    expect(state().track?.sections).toEqual([]);
    expect(state().mapFocus?.points.map(metres)).toEqual([
      [0, 0],
      [1000, 0],
    ]);
  });

  it('closes loops and flag marking, and a loop search closes it', () => {
    state().addWaypoint(TRACK[0] as LonLat);
    state().setWorkout(durationWorkout('1 h', 3600));
    state().searchLoops();
    state().startFlagDraft();
    open();
    expect(state().loops).toBeUndefined();
    expect(state().flagDraft).toBeUndefined();
    state().searchLoops();
    expect(state().track).toBeUndefined();
  });

  it('keeps a section and asks about the next', () => {
    open();
    state().keepSection();
    expect(state().track).toMatchObject({ current: 1 });
    expect(state().track?.sections[0]?.outcome).toBe('kept');
    expect(state().track?.coordinates).toBe(TRACK);
    state().keepSection();
    state().keepSection(); // nothing left to keep
    expect(state().track?.current).toBe(2);
    // Every one answered: the whole track comes back into view.
    expect(state().mapFocus?.points.map(metres)).toEqual([
      [0, 0],
      [1000, 0],
    ]);
  });

  it('splices a way around in, and moves the later sections with the coordinates', () => {
    const track = open();
    const { splice, detour } = detourFor(track);
    const second = track.sections[1];
    state().rerouteSections(false);
    expect(state().track?.rerouting).toBe('one');
    state().setSectionResult(track.id, 0, { outcome: 'rerouted', splice, detour });

    const after = state().track;
    expect(after?.coordinates).toBe(splice.coordinates);
    expect(after?.sections[0]).toMatchObject({
      from: splice.from,
      to: splice.to,
      outcome: 'rerouted',
    });
    // Two points replace the stretch; the way north and back adds about 2 × 100 m.
    expect(after?.sections[0]?.changeM).toBeGreaterThan(150);
    const shift = splice.coordinates.length - TRACK.length;
    expect(after?.sections[1]).toEqual({
      ...second,
      from: (second?.from ?? 0) + shift,
      to: (second?.to ?? 0) + shift,
    });
    expect(after).toMatchObject({ current: 1, rerouting: undefined });
    // The next question comes into view.
    expect(state().mapFocus?.points[0]?.[0]).toBeCloseTo(
      splice.coordinates[after?.sections[1]?.from ?? -1]?.[0] ?? 0,
      6,
    );
  });

  it('reroutes every section in turn with “all”', () => {
    const track = open();
    state().rerouteSections(true);
    state().setSectionResult(track.id, 0, { outcome: 'no_way_around' });
    expect(state().track).toMatchObject({ current: 1, rerouting: 'all' });
    expect(state().track?.sections[0]?.outcome).toBe('no_way_around');
    expect(state().track?.coordinates).toBe(TRACK);
    state().setSectionResult(track.id, 1, { outcome: 'no_way_around' });
    expect(state().track).toMatchObject({ current: 2, rerouting: undefined });
  });

  it('a failure leaves the question open, and asking again clears the error', () => {
    const track = open();
    state().rerouteSections(true);
    state().setSectionResult(track.id, 0, { outcome: 'failed', error: 'Engine down' });
    expect(state().track).toMatchObject({ current: 0, rerouting: undefined });
    expect(state().track?.sections[0]).toMatchObject({ error: 'Engine down' });
    expect(state().track?.sections[0]?.outcome).toBeUndefined();
    state().rerouteSections(false);
    expect(state().track?.sections[0]?.error).toBeUndefined();
  });

  it('ignores answers to another question, another track, or none asked', () => {
    const track = open();
    const { splice, detour } = detourFor(track);
    state().setSectionResult(track.id, 0, { outcome: 'rerouted', splice, detour }); // not asked
    state().rerouteSections(false);
    state().setSectionResult(track.id, 1, { outcome: 'rerouted', splice, detour }); // another section
    state().setSectionResult('another', 0, { outcome: 'rerouted', splice, detour });
    expect(state().track?.coordinates).toBe(TRACK);
    expect(state().track?.current).toBe(0);
    // Keeping isn't possible while a reroute is running, and rerouting isn't started twice.
    state().keepSection();
    state().rerouteSections(true);
    expect(state().track).toMatchObject({ current: 0, rerouting: 'one' });
    state().closeTrack();
    state().setSectionResult(track.id, 0, { outcome: 'rerouted', splice, detour });
    expect(state().track).toBeUndefined();
  });

  /** Asphalt all along: one span over every segment of the coordinates. */
  const asphalt = (coordinates: number[][]) => {
    const all = <T>(value: T) => [{ from: 0, to: coordinates.length - 1, value }];
    return {
      surface: all('asphalt'),
      roadClass: all('residential'),
      trackType: all('missing'),
      osmWayId: all<number | null>(1),
      crossing: all('missing'),
    };
  };

  it('keeps the roads matched to the track as it is, and why they couldn’t be', () => {
    const track = open();
    expect(track).toMatchObject({ roads: undefined, roadsError: undefined });
    state().setTrackRoads(track.id, track.coordinates, { error: 'No match' });
    expect(state().track).toMatchObject({ roads: undefined, roadsError: 'No match' });
    const roads = asphalt(track.coordinates);
    state().setTrackRoads(track.id, track.coordinates, { roads });
    expect(state().track).toMatchObject({ roads, roadsError: undefined });
  });

  it('ignores roads for another track, or for coordinates it no longer has', () => {
    const track = open();
    const roads = asphalt(track.coordinates);
    state().setTrackRoads('another', track.coordinates, { roads });
    state().setTrackRoads(track.id, [...track.coordinates], { roads });
    expect(state().track?.roads).toBeUndefined();
  });

  it('splices the way around’s roads into the track’s', () => {
    const track = open();
    state().setTrackRoads(track.id, track.coordinates, { roads: asphalt(track.coordinates) });
    const { splice, detour } = detourFor(track);
    const gravel = {
      ...detour,
      attributes: { ...detour.attributes, surface: [{ from: 0, to: 1, value: 'gravel' }] },
    };
    state().rerouteSections(false);
    state().setSectionResult(track.id, 0, { outcome: 'rerouted', splice, detour: gravel });
    const roads = state().track?.roads;
    expect(roads?.surface.map((s) => s.value)).toEqual(['asphalt', 'gravel', 'asphalt']);
    expect(roads?.surface.at(-1)?.to).toBe(splice.coordinates.length - 1);
  });

  it('has the track matched afresh when it changed before its roads were known', () => {
    const track = open();
    state().setTrackRoads(track.id, track.coordinates, { error: 'Engine down' });
    const { splice, detour } = detourFor(track);
    state().rerouteSections(false);
    state().setSectionResult(track.id, 0, { outcome: 'rerouted', splice, detour });
    expect(state().track).toMatchObject({ roads: undefined, roadsError: undefined });
  });
});

describe('clearing the map', () => {
  it('removes the waypoints and an opened track; undo brings the waypoints back', () => {
    state().addWaypoint([16, 48]);
    state().openTrack('Sunday ride', east(0, 1000), 'none');
    state().clearMap();
    expect(state().waypoints).toEqual([]);
    expect(state().track).toBeUndefined();
    state().undo();
    expect(state().waypoints).toEqual([[16, 48]]);
  });

  it('removes a track opened with no route, without an empty undo step', () => {
    state().openTrack('Sunday ride', east(0, 1000), 'none');
    state().clearMap();
    expect(state().track).toBeUndefined();
    expect(state().past).toEqual([]);
  });
});
