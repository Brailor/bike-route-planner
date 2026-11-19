// Lists kept per user: flags (M2), which apply to every future route, and saved routes (ADR 0016). In this browser,
// or on the server for a logged-in user, so they follow them between phone and computer.
import type { ListItem, ListName, PlannerDb } from './db';

export interface ListStore<T extends { id: string }> {
  /** Oldest first. */
  list(): Promise<T[]>;
  /** Inserts the item, or replaces the stored one with the same id. */
  save(item: T): Promise<void>;
  /** No-op for an unknown id. */
  remove(id: string): Promise<void>;
}

export function createBrowserStore<N extends ListName>(
  db: PlannerDb,
  name: N,
): ListStore<ListItem<N>> {
  return {
    list: () => db.getAllFromIndex(name, 'createdAt'),
    save: async (item) => {
      await db.put(name, item);
    },
    remove: (id) => db.delete(name, id),
  };
}

function ok(res: Response): Response {
  if (!res.ok) throw new Error(`${res.url || 'Request'} failed (${res.status})`);
  return res;
}

/** The logged-in user's list on the server, at /api/<name>. */
export function createServerStore<N extends ListName>(
  name: N,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): ListStore<ListItem<N>> {
  const url = (id: string) => `/api/${name}/${encodeURIComponent(id)}`;
  return {
    list: async () => {
      const items = (await ok(await fetchFn(`/api/${name}`)).json()) as unknown;
      if (!Array.isArray(items)) throw new Error(`The server's ${name} aren't a list`);
      return items as ListItem<N>[];
    },
    save: async (item) => {
      ok(
        await fetchFn(url(item.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        }),
      );
    },
    remove: async (id) => {
      ok(await fetchFn(url(id), { method: 'DELETE' }));
    },
  };
}

/**
 * Moves every item from `from` to `to`, each removed from `from` only once `to` has it. Used once per browser: what
 * was saved in it before logging in goes to the account, so a later login here (a friend's) finds nothing to take.
 */
export async function moveAll<T extends { id: string }>(
  from: ListStore<T>,
  to: ListStore<T>,
): Promise<void> {
  for (const item of await from.list()) {
    await to.save(item);
    await from.remove(item.id);
  }
}
