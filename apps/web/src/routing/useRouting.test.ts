import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import gravelFixture from './graphhopper/__fixtures__/gravel-offroad-80.json';
import { mapRouteResponse, type GhRouteResponse } from './graphhopper/response';
import { RoutingError, type RouteRequest, type RoutingEngine } from './types';
import { useRouting } from './useRouting';

const route = mapRouteResponse(gravelFixture.response as unknown as GhRouteResponse);

function fakeEngine() {
  const calls: { request: RouteRequest; signal: AbortSignal | undefined }[] = [];
  let respond: (() => void) | undefined;
  const engine: RoutingEngine = {
    route: (request, signal) => {
      calls.push({ request, signal });
      return new Promise((resolve) => {
        respond = () => resolve(route);
      });
    },
  };
  return { engine, calls, respond: () => respond?.() };
}

describe('useRouting', () => {
  const initial = usePlanner.getState();
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    usePlanner.setState(initial, true);
  });

  it('does not route with fewer than two waypoints', () => {
    const { engine, calls } = fakeEngine();
    renderHook(() => useRouting(engine));
    act(() => usePlanner.getState().addWaypoint([16.5, 48.2]));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls).toHaveLength(0);
  });

  it('debounces bursts of changes into one request', () => {
    const { engine, calls } = fakeEngine();
    renderHook(() => useRouting(engine));
    act(() => {
      usePlanner.getState().addWaypoint([16.5, 48.2]);
      usePlanner.getState().addWaypoint([16.6, 48.2]);
    });
    act(() => usePlanner.getState().updateSettings({ offroadPreference: 90 }));
    act(() => usePlanner.getState().updateSettings({ offroadPreference: 100 }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.settings.offroadPreference).toBe(100);
  });

  it('aborts the in-flight request when inputs change, and keeps only the latest result', async () => {
    const { engine, calls, respond } = fakeEngine();
    renderHook(() => useRouting(engine));
    act(() => {
      usePlanner.getState().addWaypoint([16.5, 48.2]);
      usePlanner.getState().addWaypoint([16.6, 48.2]);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(usePlanner.getState().status.state).toBe('loading');

    act(() => usePlanner.getState().setProfile('road'));
    expect(calls[0]?.signal?.aborted).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(calls).toHaveLength(2);
    await act(async () => {
      respond();
      await Promise.resolve();
    });
    expect(usePlanner.getState().status.state).toBe('ready');
    expect(usePlanner.getState().route).toBe(route);
  });

  it('stores routing errors for the UI', async () => {
    const engine: RoutingEngine = {
      route: () => Promise.reject(new RoutingError('down', 'unavailable')),
    };
    renderHook(() => useRouting(engine));
    act(() => {
      usePlanner.getState().addWaypoint([16.5, 48.2]);
      usePlanner.getState().addWaypoint([16.6, 48.2]);
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(usePlanner.getState().status).toEqual({
      state: 'error',
      kind: 'unavailable',
      message: 'down',
    });
  });
  it('reroutes with every flag when one is added', () => {
    const { engine, calls } = fakeEngine();
    renderHook(() => useRouting(engine));
    act(() => {
      usePlanner.getState().addWaypoint([16.5, 48.2]);
      usePlanner.getState().addWaypoint([16.6, 48.2]);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.flags).toEqual([]);

    const flag = { id: 'f', geometry: route.geometry, createdAt: '2026-11-03T00:00:00Z' };
    act(() => usePlanner.getState().loadFlags([flag]));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.request.flags).toEqual([flag]);
  });
});
