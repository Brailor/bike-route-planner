import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoutingError, type RouteResult, type RoutingEngine } from '../routing/types';
import { usePlanner } from '../state/store';
import { at, east, flagOn, routeAlong } from '../test/metres';
import { spliceDetour } from './sections';
import { useTrackRoads } from './useTrackRoads';

const TRACK = east(0, 1000);
const state = () => usePlanner.getState();

/** Matches every track to the road it lies on: way 7, asphalt. */
const onRoad = (): RouteResult => {
  const road = routeAlong([at(0), at(1000)], 7);
  return {
    ...road,
    attributes: { ...road.attributes, surface: [{ from: 0, to: 1, value: 'asphalt' }] },
  };
};

function fakeEngine(answer: (track: readonly (readonly number[])[]) => Promise<RouteResult>) {
  const calls: { track: readonly (readonly number[])[]; signal: AbortSignal | undefined }[] = [];
  const engine: RoutingEngine = {
    route: () => Promise.reject(new Error('not used')),
    trace: () => Promise.reject(new Error('not used')),
    roundTrip: () => Promise.reject(new Error('not used')),
    match: (track, signal) => {
      calls.push({ track, signal });
      return answer(track);
    },
  };
  return { engine, calls };
}

describe('useTrackRoads', () => {
  it('matches an opened track, and keeps its roads', async () => {
    const { engine, calls } = fakeEngine(() => Promise.resolve(onRoad()));
    renderHook(() => useTrackRoads(engine));
    expect(calls).toEqual([]);
    act(() => state().openTrack('Sunday ride', TRACK, 'none'));
    await waitFor(() => expect(state().track?.roads).toBeDefined());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.track).toBe(TRACK);
    expect(state().track?.roads?.surface).toEqual([{ from: 0, to: 100, value: 'asphalt' }]);
    expect(state().track?.roads?.osmWayId).toEqual([{ from: 0, to: 100, value: 7 }]);
  });

  it('says why when the engine can’t be reached, or can’t match the track', async () => {
    const down = fakeEngine(() => Promise.reject(new RoutingError('down', 'unavailable')));
    const { unmount } = renderHook(() => useTrackRoads(down.engine));
    act(() => state().openTrack('Sunday ride', TRACK, 'none'));
    await waitFor(() =>
      expect(state().track?.roadsError).toContain('Can’t reach the routing engine'),
    );
    unmount();

    const broken = fakeEngine(() =>
      Promise.reject(new RoutingError('Sequence is broken', 'bad_request')),
    );
    renderHook(() => useTrackRoads(broken.engine));
    act(() => state().openTrack('Sunday ride', TRACK, 'none'));
    await waitFor(() =>
      expect(state().track?.roadsError).toBe(
        'Surfaces unknown: the track couldn’t be matched to the roads.',
      ),
    );
    expect(broken.calls).toHaveLength(1); // not tried again
  });

  it('waits while a section is rerouted, and matches the track that comes of it', () => {
    const { engine, calls } = fakeEngine(() => new Promise(() => {}));
    renderHook(() => useTrackRoads(engine));
    act(() => {
      state().loadFlags([flagOn('f', east(400, 600, 50))]);
      state().openTrack('Sunday ride', TRACK, 'none');
    });
    expect(calls).toHaveLength(1);
    act(() => state().rerouteSections(false));
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(calls).toHaveLength(1);

    const track = state().track!;
    const section = track.sections[0]!;
    const detour = [at(350, 100), at(650, 100)];
    const splice = spliceDetour(TRACK, section, { min: 0, max: 100 }, [35, 65], detour);
    act(() =>
      state().setSectionResult(track.id, 0, {
        outcome: 'rerouted',
        splice,
        detour: routeAlong(detour, 9),
      }),
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]?.track).toBe(splice.coordinates);
  });

  it('keeps no error from a match it stopped, and matches again after a section is kept as it was', async () => {
    // The engine gives up on an aborted request, as fetch does.
    const { engine, calls } = fakeEngine(() => new Promise(() => {}));
    const aborting: RoutingEngine = {
      ...engine,
      match: (track, signal) =>
        new Promise((_, reject) => {
          void engine.match(track, signal);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    };
    renderHook(() => useTrackRoads(aborting));
    act(() => {
      state().loadFlags([flagOn('f', east(400, 600, 50))]);
      state().openTrack('Sunday ride', TRACK, 'none');
    });
    act(() => state().rerouteSections(false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(state().track?.roadsError).toBeUndefined();
    const track = state().track!;
    act(() => state().setSectionResult(track.id, 0, { outcome: 'no_way_around' }));
    expect(calls).toHaveLength(2);
  });

  it('stops matching a track that’s closed', () => {
    const { engine, calls } = fakeEngine(() => new Promise(() => {}));
    renderHook(() => useTrackRoads(engine));
    act(() => state().openTrack('Sunday ride', TRACK, 'none'));
    act(() => state().closeTrack());
    expect(calls[0]?.signal?.aborted).toBe(true);
  });
});
