import { afterEach, describe, expect, it } from 'vitest';
import { fixtureRoute } from '../test/route';
import { usePlanner } from './store';

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
