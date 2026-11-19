import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import type { AvoidFlag, SavedRoute } from '../types';
import type { ListStore } from './listStore';
import { syncList, usePersistedList } from './usePersistedList';

type FlagStore = ListStore<AvoidFlag>;

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

describe('syncList', () => {
  it('saves new and changed flags and removes missing ones', () => {
    const store = fakeStore();
    const kept = flag('kept');
    syncList(
      store,
      [kept, flag('changed'), flag('gone')],
      [kept, flag('changed', 'x'), flag('new')],
      () => {},
    );
    expect(store.save.mock.calls.map(([f]) => f.id)).toEqual(['changed', 'new']);
    expect(store.remove.mock.calls).toEqual([['gone']]);
  });
});

describe('usePersistedList', () => {
  it('loads saved flags into the store', async () => {
    const store = fakeStore([flag('saved')]);
    renderHook(() => usePersistedList('flags', () => Promise.resolve(store)));
    await waitFor(() => expect(usePlanner.getState().flags.map((f) => f.id)).toEqual(['saved']));
    expect(store.save).not.toHaveBeenCalled();
  });

  it('saves flags as they are added, including ones made before loading finished', async () => {
    const store = fakeStore([flag('saved')]);
    usePlanner.getState().loadFlags([flag('early')]);
    renderHook(() => usePersistedList('flags', () => Promise.resolve(store)));
    await waitFor(() => expect(usePlanner.getState().flags).toHaveLength(2));
    expect(store.save.mock.calls.map(([f]) => f.id)).toEqual(['early']);

    act(() => usePlanner.getState().loadFlags([flag('later')]));
    expect(store.save.mock.calls.map(([f]) => f.id)).toEqual(['early', 'later']);
  });

  it('stops writing once unmounted', async () => {
    const store = fakeStore();
    const { unmount } = renderHook(() => usePersistedList('flags', () => Promise.resolve(store)));
    await waitFor(() => expect(store.list).toHaveBeenCalled());
    unmount();
    act(() => usePlanner.getState().loadFlags([flag('after')]));
    expect(store.save).not.toHaveBeenCalled();
  });

  it('keeps working without storage, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => usePersistedList('flags', () => Promise.reject(new Error('blocked'))));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    act(() => usePlanner.getState().loadFlags([flag('session')]));
    expect(usePlanner.getState().flags).toHaveLength(1);
    warn.mockRestore();
  });

  it('keeps saved routes in step with their own store', async () => {
    const route: SavedRoute = {
      id: 'r',
      name: 'Lobau',
      geometry: flag('x').geometry,
      distanceM: 75,
      elevation: 'none',
      createdAt: '2026-11-18T10:00:00Z',
    };
    const store = {
      list: vi.fn<ListStore<SavedRoute>['list']>(() => Promise.resolve([route])),
      save: vi.fn<ListStore<SavedRoute>['save']>(() => Promise.resolve()),
      remove: vi.fn<ListStore<SavedRoute>['remove']>(() => Promise.resolve()),
    };
    renderHook(() => usePersistedList('routes', () => Promise.resolve(store)));
    await waitFor(() => expect(usePlanner.getState().savedRoutes).toEqual([route]));

    act(() =>
      usePlanner.getState().saveRoute('Hütteldorf', flag('y').geometry.coordinates, 'file'),
    );
    expect(store.save.mock.calls.map(([r]) => r.name)).toEqual(['Hütteldorf']);
    act(() => usePlanner.getState().deleteSavedRoute('r'));
    expect(store.remove.mock.calls).toEqual([['r']]);
    expect(usePlanner.getState().flags).toEqual([]);
  });
});
