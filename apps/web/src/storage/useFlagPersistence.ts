import { useEffect } from 'react';
import { usePlanner } from '../state/store';
import type { AvoidFlag } from '../types';
import { openPlannerDb } from './db';
import { createFlagStore, type FlagStore } from './flagStore';
import { createServerFlagStore, moveFlags } from './serverFlagStore';

const openBrowserFlags = () => openPlannerDb().then(createFlagStore);

/**
 * The logged-in user's flags, on the server. Flags saved in this browser before go up to the account first; if the
 * browser's storage is blocked there are none to move.
 */
export async function openAccountFlags(
  server: FlagStore = createServerFlagStore(),
  openBrowser: () => Promise<FlagStore> = openBrowserFlags,
): Promise<FlagStore> {
  const browser = await openBrowser().catch(() => undefined);
  if (browser) await moveFlags(browser, server);
  return server;
}

const warn = (err: unknown) => console.warn('Could not save flags:', err);

/** Writes the difference between two flag lists: new or changed flags are saved, missing ones removed. */
export function syncFlags(store: FlagStore, before: AvoidFlag[], after: AvoidFlag[]) {
  const previous = new Map(before.map((f) => [f.id, f]));
  const kept = new Set(after.map((f) => f.id));
  // Flags are replaced, not mutated, so a changed flag is a different object.
  for (const flag of after) if (previous.get(flag.id) !== flag) store.save(flag).catch(warn);
  for (const id of previous.keys()) if (!kept.has(id)) store.remove(id).catch(warn);
}

/**
 * Loads the saved flags into the store, then keeps storage in step with it: the browser's, or with `openAccountFlags`
 * the server's. Without storage (e.g. blocked by the browser, or the server out of reach) flags still work, for this
 * session only.
 */
export function useFlagPersistence(open: () => Promise<FlagStore> = openBrowserFlags) {
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
