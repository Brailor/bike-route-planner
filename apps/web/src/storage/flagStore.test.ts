import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvoidFlag } from '../types';
import { openPlannerDb, type PlannerDb } from './db';
import { createFlagStore } from './flagStore';

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

describe('flag store', () => {
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
    expect(await createFlagStore(db).list()).toEqual([]);
  });

  it('round-trips every field', async () => {
    const store = createFlagStore(db);
    const full = flag('a', '2026-10-29T10:00:00Z', {
      osmWayIds: [123, 456],
      reason: 'overgrown',
      note: 'nettles past the bridge',
    });
    await store.save(full);
    expect(await store.list()).toEqual([full]);
  });

  it('lists oldest first, whatever the save order', async () => {
    const store = createFlagStore(db);
    await store.save(flag('new', '2026-10-29T12:00:00Z'));
    await store.save(flag('old', '2026-10-28T09:00:00Z'));
    await store.save(flag('mid', '2026-10-29T08:00:00Z'));
    expect((await store.list()).map((f) => f.id)).toEqual(['old', 'mid', 'new']);
  });

  it('replaces a flag saved again under the same id', async () => {
    const store = createFlagStore(db);
    await store.save(flag('a', '2026-10-29T10:00:00Z', { reason: 'private' }));
    await store.save(flag('a', '2026-10-29T10:00:00Z', { reason: 'too_steep', note: 'walked it' }));
    const flags = await store.list();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ reason: 'too_steep', note: 'walked it' });
  });

  it('removes a flag, and ignores unknown ids', async () => {
    const store = createFlagStore(db);
    await store.save(flag('a', '2026-10-29T10:00:00Z'));
    await store.save(flag('b', '2026-10-29T11:00:00Z'));
    await store.remove('a');
    await store.remove('nope');
    expect((await store.list()).map((f) => f.id)).toEqual(['b']);
  });

  it('keeps flags after the database is closed and reopened', async () => {
    await createFlagStore(db).save(flag('a', '2026-10-29T10:00:00Z'));
    db.close();
    db = await openPlannerDb();
    expect((await createFlagStore(db).list()).map((f) => f.id)).toEqual(['a']);
  });
});
