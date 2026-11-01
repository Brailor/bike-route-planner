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
