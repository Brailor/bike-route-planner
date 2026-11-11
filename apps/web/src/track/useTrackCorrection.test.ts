import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../profiles/defaults';
import {
  RoutingError,
  type RouteRequest,
  type RouteResult,
  type RoutingEngine,
} from '../routing/types';
import { usePlanner } from '../state/store';
import { at, east, flagOn, metres, routeAlong } from '../test/metres';
import { useTrackCorrection } from './useTrackCorrection';

const TRACK = east(0, 1000);
const FIRST = flagOn('first', east(200, 300, 50), [1]);
const SECOND = flagOn('second', east(700, 800, 50), [2]);

const state = () => usePlanner.getState();

/** Answers each request with a way 100 m north of the track between the two points, on a way of its own. */
const around = ({ waypoints: [a = [0, 0], b = [0, 0]] }: RouteRequest): RouteResult => {
  const [ax] = metres(a);
  const [bx] = metres(b);
  return routeAlong([a, at(ax ?? 0, 100), at(bx ?? 0, 100), b], 99);
};

function fakeEngine(answer: (request: RouteRequest) => Promise<RouteResult>) {
  const calls: { request: RouteRequest; signal: AbortSignal | undefined }[] = [];
  const engine: RoutingEngine = {
    route: (request, signal) => {
      calls.push({ request, signal });
      return answer(request);
    },
    trace: () => Promise.reject(new Error('not used')),
    roundTrip: () => Promise.reject(new Error('not used')),
    match: () => Promise.reject(new Error('not used')),
  };
  return { engine, calls };
}

function open() {
  state().loadFlags([FIRST, SECOND]);
  state().openTrack('Sunday ride', TRACK, 'none');
}

describe('useTrackCorrection', () => {
  it('does nothing until asked', () => {
    const { engine, calls } = fakeEngine((r) => Promise.resolve(around(r)));
    renderHook(() => useTrackCorrection(engine));
    open();
    expect(calls).toEqual([]);
  });

  it('reroutes one section under the current profile, avoiding every flag', async () => {
    const { engine, calls } = fakeEngine((r) => Promise.resolve(around(r)));
    renderHook(() => useTrackCorrection(engine));
    open();
    state().setProfile('road');
    act(() => state().rerouteSections(false));
    await waitFor(() => expect(state().track?.current).toBe(1));
    expect(calls.length).toBeGreaterThan(0);
    for (const { request } of calls) {
      expect(request.settings).toEqual(DEFAULT_SETTINGS.road);
      expect(request.flags).toEqual([FIRST, SECOND]);
    }
    expect(state().track?.sections.map((s) => s.outcome)).toEqual(['rerouted', undefined]);
  });

  it('with “all”, reroutes each section in turn on the corrected track', async () => {
    const { engine, calls } = fakeEngine((r) => Promise.resolve(around(r)));
    renderHook(() => useTrackCorrection(engine));
    open();
    act(() => state().rerouteSections(true));
    await waitFor(() => expect(state().track?.current).toBe(2));
    // Each section asked about in turn, the second on the track with the first one's way around in it.
    const asked = calls.map((c) => c.request.waypoints.map(metres));
    expect(asked[0]).toEqual([
      [140, 0],
      [360, 0],
    ]);
    const second = asked.findIndex((w) => w[0]?.[0] === 640);
    expect(second).toBeGreaterThan(0);
    // Never back into the first section’s way around, which rejoins the track at 360 m.
    expect(asked.slice(second).every(([from]) => (from?.[0] ?? 0) >= 360)).toBe(true);
    expect(state().track?.sections.map((s) => s.outcome)).toEqual(['rerouted', 'rerouted']);
    // Both ways around are in the track.
    const north = state().track?.coordinates.filter((p) => metres(p)[1] === 100) ?? [];
    expect(north.map(metres)).toEqual([
      [140, 100],
      [360, 100],
      [640, 100],
      [860, 100],
    ]);
  });

  it('keeps the question open with the reason when the engine fails', async () => {
    const { engine } = fakeEngine(() =>
      Promise.reject(new RoutingError('Connection refused', 'unavailable')),
    );
    renderHook(() => useTrackCorrection(engine));
    open();
    act(() => state().rerouteSections(true));
    await waitFor(() => expect(state().track?.rerouting).toBeUndefined());
    expect(state().track?.current).toBe(0);
    expect(state().track?.sections[0]?.error).toBe(
      'Can’t reach the routing engine. Start it with “pnpm routing:start”.',
    );
  });

  it('stops rerouting when the track is closed', async () => {
    const { engine, calls } = fakeEngine(() => new Promise(() => {}));
    renderHook(() => useTrackCorrection(engine));
    open();
    act(() => state().rerouteSections(true));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    act(() => state().closeTrack());
    expect(calls.every((c) => c.signal?.aborted)).toBe(true);
  });
});
