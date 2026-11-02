import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import { GeocodingError, type GeocodeRequest, type Geocoder, type Place } from './types';
import { usePlaceSearch } from './usePlaceSearch';

const place = (name: string): Place => ({ name, detail: '', point: [16, 48] });

function fakeGeocoder() {
  const calls: { request: GeocodeRequest; signal: AbortSignal | undefined }[] = [];
  const answers: ((result: Place[] | Error) => void)[] = [];
  const geocoder: Geocoder = {
    search: (request, signal) => {
      calls.push({ request, signal });
      return new Promise((resolve, reject) =>
        answers.push((r) => (r instanceof Error ? reject(r) : resolve(r))),
      );
    },
  };
  /** Answers the i-th request. */
  const answer = (i: number, result: Place[] | Error) =>
    act(async () => {
      answers[i]?.(result);
      await Promise.resolve(); // let the hook's .then run inside act
    });
  return { geocoder, calls, answer };
}

describe('usePlaceSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(1000);
    });

  it('does not search short queries', () => {
    const { geocoder, calls } = fakeGeocoder();
    const { result } = renderHook(() => usePlaceSearch(' gr ', geocoder));
    settle();
    expect(calls).toHaveLength(0);
    expect(result.current).toEqual({ places: [], current: true, error: undefined });
  });

  it('debounces typing into one search, ranked near the map centre', () => {
    const { geocoder, calls } = fakeGeocoder();
    usePlanner.getState().setMapCentre([15.44, 47.07]);
    const { rerender } = renderHook(({ q }) => usePlaceSearch(q, geocoder), {
      initialProps: { q: 'gra' },
    });
    rerender({ q: 'graz' });
    rerender({ q: 'graz h' });
    settle();
    expect(calls.map((c) => c.request)).toEqual([{ query: 'graz h', near: [15.44, 47.07] }]);
  });

  it('keeps the last places while the next query loads, then replaces them', async () => {
    const { geocoder, answer } = fakeGeocoder();
    const { result, rerender } = renderHook(({ q }) => usePlaceSearch(q, geocoder), {
      initialProps: { q: 'graz' },
    });
    settle();
    await answer(0, [place('Graz')]);
    expect(result.current).toMatchObject({ places: [place('Graz')], current: true });

    rerender({ q: 'graz hbf' });
    expect(result.current).toMatchObject({ places: [place('Graz')], current: false });
    settle();
    await answer(1, [place('Graz Hauptbahnhof')]);
    expect(result.current).toMatchObject({ places: [place('Graz Hauptbahnhof')], current: true });
  });

  it('aborts a search the user has typed past', () => {
    const { geocoder, calls } = fakeGeocoder();
    const { rerender } = renderHook(({ q }) => usePlaceSearch(q, geocoder), {
      initialProps: { q: 'graz' },
    });
    settle();
    rerender({ q: 'graz hbf' });
    expect(calls[0]?.signal?.aborted).toBe(true);
  });

  it('reports errors for the current query', async () => {
    const { geocoder, answer } = fakeGeocoder();
    const { result } = renderHook(() => usePlaceSearch('graz', geocoder), {});
    settle();
    await answer(0, new GeocodingError('down', 'unavailable'));
    expect(result.current).toMatchObject({ places: [], current: true });
    expect(result.current.error?.kind).toBe('unavailable');
  });
});
