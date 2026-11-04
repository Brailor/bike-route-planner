import { useEffect } from 'react';
import { usePlanner } from '../state/store';
import { openPlannerDb } from './db';
import { createSettingsStore, type SettingsStore } from './settingsStore';

const openDefault = () => openPlannerDb().then(createSettingsStore);

const warn = (err: unknown) => console.warn('Could not save rider settings in this browser:', err);

/**
 * Loads the saved rider settings into the store, then saves every change. Without storage they still work, for this
 * session only.
 */
export function useSettingsPersistence(open: () => Promise<SettingsStore> = openDefault) {
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const initial = usePlanner.getState().userSettings;
    open()
      .then(async (store) => {
        const saved = await store.load();
        if (cancelled) return;
        // Settings are replaced, not mutated, so a different object means they were edited before loading finished.
        const editedEarly = usePlanner.getState().userSettings !== initial;
        usePlanner.getState().loadUserSettings(saved);
        if (editedEarly) store.save(usePlanner.getState().userSettings).catch(warn);
        unsubscribe = usePlanner.subscribe((s, prev) => {
          if (s.userSettings !== prev.userSettings) store.save(s.userSettings).catch(warn);
        });
      })
      .catch(warn);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [open]);
}
