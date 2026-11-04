import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, openPlannerDb } from './db';
import { createFlagStore } from './flagStore';
import { createSettingsStore } from './settingsStore';

describe('settings store', () => {
  beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
  afterEach(() => vi.unstubAllGlobals());

  it('starts empty, then keeps what was saved across reopening', async () => {
    let db = await openPlannerDb();
    expect(await createSettingsStore(db).load()).toEqual({});
    await createSettingsStore(db).save({ ftpW: 250, weightKg: 70 });
    await createSettingsStore(db).save({ ftpW: 260, weightKg: 70, ridePowerPct: 60 });
    db.close();

    db = await openPlannerDb();
    expect(await createSettingsStore(db).load()).toEqual({
      ftpW: 260,
      weightKg: 70,
      ridePowerPct: 60,
    });
    db.close();
  });

  it('upgrades a version 1 database without losing its flags', async () => {
    // Version 1 as released: the flags store only.
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('flags', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      },
    });
    const geometry = {
      type: 'LineString' as const,
      coordinates: [
        [16, 48],
        [16.001, 48],
      ],
    };
    await v1.put('flags', { id: 'old', geometry, createdAt: '2026-11-01T10:00:00Z' });
    v1.close();

    const db = await openPlannerDb();
    expect((await createFlagStore(db).list()).map((f) => f.id)).toEqual(['old']);
    await createSettingsStore(db).save({ ftpW: 240 });
    expect(await createSettingsStore(db).load()).toEqual({ ftpW: 240 });
    db.close();
  });
});
