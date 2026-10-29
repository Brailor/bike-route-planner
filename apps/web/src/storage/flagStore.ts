// "Do not ride" flags (M2). They apply to every future route, so they outlive the session.
import type { AvoidFlag } from '../types';
import type { PlannerDb } from './db';

export interface FlagStore {
  /** Oldest first. */
  list(): Promise<AvoidFlag[]>;
  /** Inserts the flag, or replaces the stored one with the same id. */
  save(flag: AvoidFlag): Promise<void>;
  /** No-op for an unknown id. */
  remove(id: string): Promise<void>;
}

export function createFlagStore(db: PlannerDb): FlagStore {
  return {
    list: () => db.getAllFromIndex('flags', 'createdAt'),
    save: async (flag) => {
      await db.put('flags', flag);
    },
    remove: (id) => db.delete('flags', id),
  };
}
