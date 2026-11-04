import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import roundTripFixture from '../routing/graphhopper/__fixtures__/gravel-round-trip.json';
import { mapRouteResponse, type GhRouteResponse } from '../routing/graphhopper/response';
import {
  RoutingError,
  type RoundTripRequest,
  type RouteResult,
  type RoutingEngine,
} from '../routing/types';
import { cruiseSpeedMs } from '../speed/model';
import { usePlanner } from '../state/store';
import type { AvoidFlag } from '../types';
import { durationWorkout } from '../workouts/workout';
import { useLoopSearch } from './useLoopSearch';

const loopRoute = mapRouteResponse(roundTripFixture.response as unknown as GhRouteResponse);
const START = roundTripFixture.input.start as [number, number];

/** The recorded loop, on ways of its own each time, so no two answers count as the same loop. */
let call = 0;
const distinct = (): RouteResult => {
  call++;
  return {
    ...loopRoute,
    attributes: {
      ...loopRoute.attributes,
      osmWayId: loopRoute.attributes.osmWayId.map((s) => ({
        ...s,
        value: call * 1e9 + (s.value ?? 0),
      })),
    },
  };
};

function fakeEngine() {
  const roundTrips: { request: RoundTripRequest; signal: AbortSignal | undefined }[] = [];
  const engine: RoutingEngine = {
    trace: () => Promise.reject(new Error('not used')),
    route: () => Promise.resolve(distinct()),
    roundTrip: (request, signal) => {
      roundTrips.push({ request, signal });
      return Promise.resolve(distinct());
    },
  };
  return { engine, roundTrips };
}

const state = () => usePlanner.getState();

function ready() {
  state().addWaypoint(START);
  state().setWorkout(durationWorkout('25 min ride', 25 * 60));
}

describe('useLoopSearch', () => {
  it('finds, ranks and keeps the best three loops', async () => {
    ready();
    const { engine } = fakeEngine();
    renderHook(() => useLoopSearch(engine));
    act(() => state().searchLoops());
    await waitFor(() => expect(state().loops?.status).toBe('ready'));
    const results = state().loops!.results;
    expect(results).toHaveLength(3);
    const totals = results.map((r) => r.score.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it('searches from the start with the profile settings, flags and rider', async () => {
    ready();
    const flag = {
      id: 'f',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [0, 0.001],
        ],
      },
    } as AvoidFlag;
    act(() => {
      state().setProfile('mtb');
      state().loadFlags([flag]);
      state().updateUserSettings({ ftpW: 300, weightKg: 70, ridePowerPct: 60 });
    });
    const { engine, roundTrips } = fakeEngine();
    renderHook(() => useLoopSearch(engine));
    act(() => state().searchLoops());
    await waitFor(() => expect(state().loops?.status).toBe('ready'));
    const { request } = roundTrips[0]!;
    expect(request.start).toEqual(START);
    expect(request.settings.profile).toBe('mtb');
    expect(request.flags).toEqual([flag]);
    // Sized for this rider: 60% of 300 W at 70 kg on the MTB.
    const guess = 25 * 60 * cruiseSpeedMs('mtb', { weightKg: 70, powerW: 180 }) * 0.9;
    expect(request.distanceM).toBeCloseTo(guess, 0);
  });

  it('explains when the engine is down', async () => {
    ready();
    const down = () => Promise.reject(new RoutingError('down', 'unavailable'));
    const engine: RoutingEngine = { trace: down, route: down, roundTrip: down };
    renderHook(() => useLoopSearch(engine));
    act(() => state().searchLoops());
    await waitFor(() => expect(state().loops?.status).toBe('error'));
    expect(state().loops?.error).toMatch(/Can’t reach the routing engine/);
  });

  it.each([
    ['the start moves', () => state().moveWaypoint(0, [16.6, 48.2])],
    ['the workout changes', () => state().setWorkout(durationWorkout('1 h', 3600))],
    ['the profile changes', () => state().setProfile('road')],
    ['a flag is added', () => state().loadFlags([{ id: 'n' } as AvoidFlag])],
    ['the rider changes', () => state().updateUserSettings({ ftpW: 280 })],
  ])('closes results when %s', async (_, change) => {
    ready();
    const { engine } = fakeEngine();
    renderHook(() => useLoopSearch(engine));
    act(() => state().searchLoops());
    await waitFor(() => expect(state().loops?.status).toBe('ready'));
    act(change);
    expect(state().loops).toBeUndefined();
  });

  it('keeps results when something else changes, such as the destination', async () => {
    ready();
    const { engine } = fakeEngine();
    renderHook(() => useLoopSearch(engine));
    act(() => state().searchLoops());
    await waitFor(() => expect(state().loops?.status).toBe('ready'));
    act(() => state().addWaypoint([16.6, 48.21]));
    expect(state().loops?.status).toBe('ready');
  });

  it('aborts a search that’s closed, and drops its answer', async () => {
    ready();
    const signals: (AbortSignal | undefined)[] = [];
    let release = () => {};
    const { engine } = fakeEngine();
    const slow: RoutingEngine = {
      ...engine,
      roundTrip: (r, s) => {
        signals.push(s);
        return new Promise((resolve) => (release = () => resolve(engine.roundTrip(r, s))));
      },
    };
    renderHook(() => useLoopSearch(slow));
    act(() => state().searchLoops());
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    act(() => state().closeLoops());
    expect(signals[0]?.aborted).toBe(true);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(state().loops).toBeUndefined();
  });
});
