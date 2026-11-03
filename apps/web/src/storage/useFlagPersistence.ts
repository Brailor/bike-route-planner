import { useEffect } from 'react';
import { usePlanner } from '../state/store';
import type { AvoidFlag } from '../types';
import { openPlannerDb } from './db';
import { createFlagStore, type FlagStore } from './flagStore';

const openDefault = () => openPlannerDb().then(createFlagStore);

const warn = (err: unknown) => console.warn('Could not save flags in this browser:', err);

/** Writes the difference between two flag lists: new or changed flags are saved, missing ones removed. */
export function syncFlags(store: FlagStore, before: AvoidFlag[], after: AvoidFlag[]) {
  const previous = new Map(before.map((f) => [f.id, f]));
  const kept = new Set(after.map((f) => f.id));
  // Flags are replaced, not mutated, so a changed flag is a different object.
  for (const flag of after) if (previous.get(flag.id) !== flag) store.save(flag).catch(warn);
  for (const id of previous.keys()) if (!kept.has(id)) store.remove(id).catch(warn);
}

/**
 * Loads the saved flags into the store, then keeps storage in step with it. Without storage (e.g. blocked by the
 * browser) flags still work, for this session only.
 */
export function useFlagPersistence(open: () => Promise<FlagStore> = openDefault) {
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    open()
      .then(async (store) => {
        const saved = await store.list();
        if (cancelled) return;
        usePlanner.getState().loadFlags(saved);
        // Flags made before storage was ready aren't saved yet.
        syncFlags(store, saved, usePlanner.getState().flags);
        unsubscribe = usePlanner.subscribe((s, prev) => {
          if (s.flags !== prev.flags) syncFlags(store, prev.flags, s.flags);
        });
      })
      .catch(warn);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [open]);
}
