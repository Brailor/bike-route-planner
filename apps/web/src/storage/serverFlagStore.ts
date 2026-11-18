// Flags kept on the server for the logged-in user (ADR 0016), so they follow them between phone and computer.
import type { AvoidFlag } from '../types';
import type { FlagStore } from './flagStore';

function ok(res: Response): Response {
  if (!res.ok) throw new Error(`Flags request failed (${res.status})`);
  return res;
}

export function createServerFlagStore(
  fetchFn: typeof fetch = (...args) => fetch(...args),
): FlagStore {
  const url = (id: string) => `/api/flags/${encodeURIComponent(id)}`;
  return {
    list: async () => {
      const flags = (await ok(await fetchFn('/api/flags')).json()) as unknown;
      if (!Array.isArray(flags)) throw new Error('Flags response is not a list');
      return flags as AvoidFlag[];
    },
    save: async (flag) => {
      ok(
        await fetchFn(url(flag.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flag),
        }),
      );
    },
    remove: async (id) => {
      ok(await fetchFn(url(id), { method: 'DELETE' }));
    },
  };
}

/**
 * Moves every flag from `from` to `to`, each removed from `from` only once `to` has it. Used once per browser: the
 * flags saved in it before logging in go to the account, so a later login here (a friend's) finds none to take.
 */
export async function moveFlags(from: FlagStore, to: FlagStore): Promise<void> {
  for (const flag of await from.list()) {
    await to.save(flag);
    await from.remove(flag.id);
  }
}
