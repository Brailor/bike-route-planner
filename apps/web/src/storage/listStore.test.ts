import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvoidFlag, SavedRoute } from '../types';
import { openDB } from 'idb';
import { DB_NAME, openPlannerDb, type PlannerDb } from './db';
import { createBrowserStore } from './listStore';

const flag = (id: string, createdAt: string, extra: Partial<AvoidFlag> = {}): AvoidFlag => ({
  id,
  geometry: {
    type: 'LineString',
    coordinates: [
      [16.2, 48.1],
      [16.21, 48.11],
    ],
  },
  createdAt,
  ...extra,
});

describe('browser store', () => {
  let db: PlannerDb;

  beforeEach(async () => {
    // A fresh factory per test, so no database survives from one test to the next.
    vi.stubGlobal('indexedDB', new IDBFactory());
    db = await openPlannerDb();
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  it('starts empty', async () => {
    expect(await createBrowserStore(db, 'flags').list()).toEqual([]);
  });

  it('round-trips every field', async () => {
    const store = createBrowserStore(db, 'flags');
    const full = flag('a', '2026-10-29T10:00:00Z', {
      osmWayIds: [123, 456],
      reason: 'overgrown',
      note: 'nettles past the bridge',
    });
    await store.save(full);
    expect(await store.list()).toEqual([full]);
  });

  it('lists oldest first, whatever the save order', async () => {
    const store = createBrowserStore(db, 'flags');
    await store.save(flag('new', '2026-10-29T12:00:00Z'));
    await store.save(flag('old', '2026-10-28T09:00:00Z'));
    await store.save(flag('mid', '2026-10-29T08:00:00Z'));
    expect((await store.list()).map((f) => f.id)).toEqual(['old', 'mid', 'new']);
  });

  it('replaces a flag saved again under the same id', async () => {
    const store = createBrowserStore(db, 'flags');
    await store.save(flag('a', '2026-10-29T10:00:00Z', { reason: 'private' }));
    await store.save(flag('a', '2026-10-29T10:00:00Z', { reason: 'too_steep', note: 'walked it' }));
    const flags = await store.list();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ reason: 'too_steep', note: 'walked it' });
  });

  it('removes a flag, and ignores unknown ids', async () => {
    const store = createBrowserStore(db, 'flags');
    await store.save(flag('a', '2026-10-29T10:00:00Z'));
    await store.save(flag('b', '2026-10-29T11:00:00Z'));
    await store.remove('a');
    await store.remove('nope');
    expect((await store.list()).map((f) => f.id)).toEqual(['b']);
  });

  it('keeps flags after the database is closed and reopened', async () => {
    await createBrowserStore(db, 'flags').save(flag('a', '2026-10-29T10:00:00Z'));
    db.close();
    db = await openPlannerDb();
    expect((await createBrowserStore(db, 'flags').list()).map((f) => f.id)).toEqual(['a']);
  });

  it('keeps saved routes apart from flags', async () => {
    const route: SavedRoute = {
      id: 'a',
      name: 'Lobau',
      geometry: flag('x', '').geometry,
      distanceM: 750,
      elevation: 'none',
      createdAt: '2026-11-18T10:00:00Z',
    };
    await createBrowserStore(db, 'routes').save(route);
    await createBrowserStore(db, 'flags').save(flag('a', '2026-11-18T09:00:00Z'));
    expect(await createBrowserStore(db, 'routes').list()).toEqual([route]);
    await createBrowserStore(db, 'routes').remove('a');
    expect((await createBrowserStore(db, 'flags').list()).map((f) => f.id)).toEqual(['a']);
  });

  it('upgrades a version 2 database without losing its flags', async () => {
    db.close();
    vi.stubGlobal('indexedDB', new IDBFactory());
    // Version 2 as released: flags and settings.
    const v2 = await openDB(DB_NAME, 2, {
      upgrade(old) {
        old.createObjectStore('flags', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        old.createObjectStore('settings');
      },
    });
    await v2.put('flags', flag('old', '2026-11-01T10:00:00Z'));
    v2.close();
    db = await openPlannerDb();
    expect((await createBrowserStore(db, 'flags').list()).map((f) => f.id)).toEqual(['old']);
    expect(await createBrowserStore(db, 'routes').list()).toEqual([]);
  });
});
