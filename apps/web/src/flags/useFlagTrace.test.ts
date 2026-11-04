import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoutingError, type RouteResult, type RoutingEngine } from '../routing/types';
import { usePlanner } from '../state/store';
import { fixtureRoute } from '../test/route';
import type { LonLat } from '../types';
import { useFlagTrace } from './useFlagTrace';

function fakeEngine() {
  const calls: { points: LonLat[]; signal: AbortSignal | undefined }[] = [];
  const answers: ((r: RouteResult | Error) => void)[] = [];
  const engine: RoutingEngine = {
    route: () => Promise.reject(new Error('not used')),
    roundTrip: () => Promise.reject(new Error('not used')),
    trace: (points, signal) => {
      calls.push({ points, signal });
      return new Promise((resolve, reject) =>
        answers.push((r) => (r instanceof Error ? reject(r) : resolve(r))),
      );
    },
  };
  const answer = (i: number, r: RouteResult | Error) =>
    act(async () => {
      answers[i]?.(r);
      await Promise.resolve();
    });
  return { engine, calls, answer };
}

const store = () => usePlanner.getState();

describe('useFlagTrace', () => {
  it('traces once there are two points, and stores the trace', async () => {
    const { engine, calls, answer } = fakeEngine();
    renderHook(() => useFlagTrace(engine));
    act(() => {
      store().startFlagDraft();
      store().addDraftPoint([16.56, 48.2]);
    });
    expect(calls).toHaveLength(0);
    act(() => store().addDraftPoint([16.57, 48.2]));
    expect(calls.map((c) => c.points)).toEqual([
      [
        [16.56, 48.2],
        [16.57, 48.2],
      ],
    ]);
    await answer(0, fixtureRoute);
    expect(store().flagDraft?.trace).toBe(fixtureRoute);
  });

  it('aborts a trace the points have moved past', () => {
    const { engine, calls } = fakeEngine();
    renderHook(() => useFlagTrace(engine));
    act(() => {
      store().startFlagDraft();
      store().addDraftPoint([16.56, 48.2]);
      store().addDraftPoint([16.57, 48.2]);
    });
    act(() => store().moveDraftPoint(1, [16.58, 48.2]));
    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal?.aborted).toBe(true);
  });

  it('explains when no road or path connects the points', async () => {
    const { engine, answer } = fakeEngine();
    renderHook(() => useFlagTrace(engine));
    act(() => {
      store().startFlagDraft();
      store().addDraftPoint([16.56, 48.2]);
      store().addDraftPoint([16.57, 48.2]);
    });
    await answer(0, new RoutingError('Connection not found', 'no_route'));
    expect(store().flagDraft?.error).toMatch(/No road or path connects these points/);
  });
});
