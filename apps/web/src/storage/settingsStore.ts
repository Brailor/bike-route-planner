// The rider's settings (M3): FTP, weight and ride power, kept between visits.
import type { UserSettings } from '../types';
import type { PlannerDb } from './db';

const USER_KEY = 'user';

export interface SettingsStore {
  /** Empty when nothing has been saved yet. */
  load(): Promise<UserSettings>;
  save(settings: UserSettings): Promise<void>;
}

export function createSettingsStore(db: PlannerDb): SettingsStore {
  return {
    load: async () => (await db.get('settings', USER_KEY)) ?? {},
    save: async (settings) => {
      await db.put('settings', settings, USER_KEY);
    },
  };
}
