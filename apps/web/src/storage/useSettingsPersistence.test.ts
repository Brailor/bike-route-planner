import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import type { UserSettings } from '../types';
import type { SettingsStore } from './settingsStore';
import { useSettingsPersistence } from './useSettingsPersistence';

function fakeStore(saved: UserSettings = {}) {
  return {
    load: vi.fn<SettingsStore['load']>(() => Promise.resolve(saved)),
    save: vi.fn<SettingsStore['save']>(() => Promise.resolve()),
  };
}

describe('useSettingsPersistence', () => {
  it('loads saved settings into the store without saving them back', async () => {
    const store = fakeStore({ ftpW: 270 });
    renderHook(() => useSettingsPersistence(() => Promise.resolve(store)));
    await waitFor(() => expect(usePlanner.getState().userSettings).toEqual({ ftpW: 270 }));
    expect(store.save).not.toHaveBeenCalled();
  });

  it('saves every change after loading', async () => {
    const store = fakeStore({ ftpW: 270 });
    renderHook(() => useSettingsPersistence(() => Promise.resolve(store)));
    await waitFor(() => expect(usePlanner.getState().userSettings.ftpW).toBe(270));

    act(() => usePlanner.getState().updateUserSettings({ weightKg: 64 }));
    expect(store.save).toHaveBeenLastCalledWith({ ftpW: 270, weightKg: 64 });
  });

  it('saves settings entered before loading finished, merged with the saved ones', async () => {
    const store = fakeStore({ ftpW: 270, weightKg: 80 });
    renderHook(() => useSettingsPersistence(() => Promise.resolve(store)));
    act(() => usePlanner.getState().updateUserSettings({ weightKg: 64 }));
    await waitFor(() => expect(store.save).toHaveBeenCalledOnce());
    expect(store.save).toHaveBeenCalledWith({ ftpW: 270, weightKg: 64 });
    expect(usePlanner.getState().userSettings).toEqual({ ftpW: 270, weightKg: 64 });
  });

  it('does nothing once unmounted, even if loading finishes later', async () => {
    const store = fakeStore({ ftpW: 270 });
    const { unmount } = renderHook(() => useSettingsPersistence(() => Promise.resolve(store)));
    unmount();
    await waitFor(() => expect(store.load).toHaveBeenCalled());
    await act(() => Promise.resolve()); // let the loaded settings arrive
    act(() => usePlanner.getState().updateUserSettings({ weightKg: 64 }));
    expect(usePlanner.getState().userSettings).toEqual({ weightKg: 64 });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('keeps working for the session when storage is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useSettingsPersistence(() => Promise.reject(new Error('blocked'))));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    act(() => usePlanner.getState().updateUserSettings({ ftpW: 230 }));
    expect(usePlanner.getState().userSettings).toEqual({ ftpW: 230 });
    warn.mockRestore();
  });
});
