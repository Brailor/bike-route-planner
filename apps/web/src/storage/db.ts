// Browser persistence (README: IndexedDB until sync/sharing is needed).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AvoidFlag, UserSettings } from '../types';

export const DB_NAME = 'bike-route-planner';
const DB_VERSION = 2;

interface PlannerSchema extends DBSchema {
  flags: { key: string; value: AvoidFlag; indexes: { createdAt: string } };
  /** One record per settings kind, keyed by name (e.g. 'user'). */
  settings: { key: string; value: UserSettings };
}

export type PlannerDb = IDBPDatabase<PlannerSchema>;

export function openPlannerDb(name = DB_NAME): Promise<PlannerDb> {
  return openDB<PlannerSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      // One step per version, applied in order. Append new steps; never edit a released one.
      if (oldVersion < 1) {
        const flags = db.createObjectStore('flags', { keyPath: 'id' });
        flags.createIndex('createdAt', 'createdAt');
      }
      if (oldVersion < 2) db.createObjectStore('settings');
    },
  });
}
