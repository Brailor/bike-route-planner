import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import type { AvoidFlag } from '../types';
import type { FlagStore } from './flagStore';
import { syncFlags, useFlagPersistence } from './useFlagPersistence';

const flag = (id: string, note?: string): AvoidFlag => ({
  id,
  geometry: {
    type: 'LineString',
    coordinates: [
      [16, 48],
      [16.001, 48],
    ],
  },
  createdAt: '2026-11-02T12:00:00.000Z',
  ...(note && { note }),
});

function fakeStore(saved: AvoidFlag[] = []) {
  const store = {
    list: vi.fn<FlagStore['list']>(() => Promise.resolve(saved)),
    save: vi.fn<FlagStore['save']>(() => Promise.resolve()),
    remove: vi.fn<FlagStore['remove']>(() => Promise.resolve()),
  };
  return store;
}

describe('syncFlags', () => {
  it('saves new and changed flags and removes missing ones', () => {
    const store = fakeStore();
    const kept = flag('kept');
    syncFlags(
      store,
      [kept, flag('changed'), flag('gone')],
      [kept, flag('changed', 'x'), flag('new')],
    );
    expect(store.save.mock.calls.map(([f]) => f.id)).toEqual(['changed', 'new']);
    expect(store.remove.mock.calls).toEqual([['gone']]);
  });
});

describe('useFlagPersistence', () => {
  it('loads saved flags into the store', async () => {
    const store = fakeStore([flag('saved')]);
    renderHook(() => useFlagPersistence(() => Promise.resolve(store)));
    await waitFor(() => expect(usePlanner.getState().flags.map((f) => f.id)).toEqual(['saved']));
    expect(store.save).not.toHaveBeenCalled();
  });

  it('saves flags as they are added, including ones made before loading finished', async () => {
    const store = fakeStore([flag('saved')]);
    usePlanner.getState().loadFlags([flag('early')]);
    renderHook(() => useFlagPersistence(() => Promise.resolve(store)));
    await waitFor(() => expect(usePlanner.getState().flags).toHaveLength(2));
    expect(store.save.mock.calls.map(([f]) => f.id)).toEqual(['early']);

    act(() => usePlanner.getState().loadFlags([flag('later')]));
    expect(store.save.mock.calls.map(([f]) => f.id)).toEqual(['early', 'later']);
  });

  it('stops writing once unmounted', async () => {
    const store = fakeStore();
    const { unmount } = renderHook(() => useFlagPersistence(() => Promise.resolve(store)));
    await waitFor(() => expect(store.list).toHaveBeenCalled());
    unmount();
    act(() => usePlanner.getState().loadFlags([flag('after')]));
    expect(store.save).not.toHaveBeenCalled();
  });

  it('keeps working without storage, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useFlagPersistence(() => Promise.reject(new Error('blocked'))));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    act(() => usePlanner.getState().loadFlags([flag('session')]));
    expect(usePlanner.getState().flags).toHaveLength(1);
    warn.mockRestore();
  });
});
