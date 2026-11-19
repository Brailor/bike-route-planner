import { useEffect } from 'react';
import { usePlanner } from '../state/store';
import { openPlannerDb, type ListItem, type ListName } from './db';
import { createBrowserStore, createServerStore, moveAll, type ListStore } from './listStore';

type State = ReturnType<typeof usePlanner.getState>;

/** Where each list is in the app's state, and how saved items are loaded into it. */
const LISTS: {
  [N in ListName]: { select: (s: State) => ListItem<N>[]; load: (items: ListItem<N>[]) => void };
} = {
  flags: { select: (s) => s.flags, load: (items) => usePlanner.getState().loadFlags(items) },
  routes: {
    select: (s) => s.savedRoutes,
    load: (items) => usePlanner.getState().loadSavedRoutes(items),
  },
};

const openBrowser =
  <N extends ListName>(name: N) =>
  () =>
    openPlannerDb().then((db) => createBrowserStore(db, name));

/**
 * The logged-in user's list, on the server. What was saved in this browser before goes up to the account first; if
 * the browser's storage is blocked there's nothing to move.
 */
export async function openAccount<N extends ListName>(
  name: N,
  server: ListStore<ListItem<N>> = createServerStore(name),
  openLocal: () => Promise<ListStore<ListItem<N>>> = openBrowser(name),
): Promise<ListStore<ListItem<N>>> {
  const local = await openLocal().catch(() => undefined);
  if (local) await moveAll(local, server);
  return server;
}

/** How to open each list: in this browser where there are no accounts (pnpm dev), or the logged-in user's. */
export const OPEN_LIST = {
  browser: { flags: openBrowser('flags'), routes: openBrowser('routes') },
  account: { flags: () => openAccount('flags'), routes: () => openAccount('routes') },
} as const;

const warn = (name: ListName) => (err: unknown) => console.warn(`Could not save ${name}:`, err);

/** Writes the difference between two lists: new or changed items are saved, missing ones removed. */
export function syncList<T extends { id: string }>(
  store: ListStore<T>,
  before: T[],
  after: T[],
  onError: (err: unknown) => void,
) {
  const previous = new Map(before.map((item) => [item.id, item]));
  const kept = new Set(after.map((item) => item.id));
  // Items are replaced, not mutated, so a changed item is a different object.
  for (const item of after) if (previous.get(item.id) !== item) store.save(item).catch(onError);
  for (const id of previous.keys()) if (!kept.has(id)) store.remove(id).catch(onError);
}

/**
 * Loads the saved list into the app's state, then keeps storage in step with it. Without storage (e.g. blocked by
 * the browser, or the server out of reach) the list still works, for this session only.
 */
export function usePersistedList<N extends ListName>(
  name: N,
  open: () => Promise<ListStore<ListItem<N>>>,
) {
  useEffect(() => {
    const { select, load } = LISTS[name];
    const onError = warn(name);
    let cancelled = false;
    let unsubscribe = () => {};
    open()
      .then(async (store) => {
        const saved = await store.list();
        if (cancelled) return;
        load(saved);
        // Items made before storage was ready aren't saved yet.
        syncList(store, saved, select(usePlanner.getState()), onError);
        unsubscribe = usePlanner.subscribe((s, prev) => {
          if (select(s) !== select(prev)) syncList(store, select(prev), select(s), onError);
        });
      })
      .catch(onError);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [name, open]);
}
