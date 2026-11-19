import { describe, expect, it, vi } from 'vitest';
import type { AvoidFlag } from '../types';
import { createServerStore, moveAll, type ListStore } from './listStore';
import { openAccount } from './usePersistedList';

const flag = (id: string): AvoidFlag => ({
  id,
  geometry: {
    type: 'LineString',
    coordinates: [
      [16, 48],
      [16.001, 48],
    ],
  },
  createdAt: '2026-11-18T09:00:00.000Z',
});

/** A store in memory, logging each call. */
function memoryStore(flags: AvoidFlag[] = [], log: string[] = [], name = '') {
  const saved = new Map(flags.map((f) => [f.id, f]));
  const store: ListStore<AvoidFlag> = {
    list: () => Promise.resolve([...saved.values()]),
    save: (f) => {
      log.push(`${name} save ${f.id}`);
      saved.set(f.id, f);
      return Promise.resolve();
    },
    remove: (id) => {
      log.push(`${name} remove ${id}`);
      saved.delete(id);
      return Promise.resolve();
    },
  };
  return { store, saved };
}

describe('createServerStore', () => {
  it('lists, saves and deletes flags under /api/flags', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(Response.json([flag('a')])));
    const server = createServerStore('flags', fetchFn);
    expect(await server.list()).toEqual([flag('a')]);
    await server.save(flag('a'));
    await server.remove('a');
    expect(fetchFn.mock.calls).toEqual([
      ['/api/flags'],
      [
        '/api/flags/a',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flag('a')),
        },
      ],
      ['/api/flags/a', { method: 'DELETE' }],
    ]);
  });

  it('keeps each list at its own path', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(Response.json([])));
    const routes = createServerStore('routes', fetchFn);
    await routes.list();
    await routes.remove('r 1');
    expect(fetchFn.mock.calls).toEqual([
      ['/api/routes'],
      ['/api/routes/r%201', { method: 'DELETE' }],
    ]);
  });

  it('throws when the server refuses, so the flag isn’t taken as saved', async () => {
    const server = createServerStore('flags', () =>
      Promise.resolve(new Response('', { status: 401 })),
    );
    await expect(server.list()).rejects.toThrow('401');
    await expect(server.save(flag('a'))).rejects.toThrow('401');
    await expect(server.remove('a')).rejects.toThrow('401');
    const page = createServerStore('flags', () => Promise.resolve(Response.json({ error: 'x' })));
    await expect(page.list()).rejects.toThrow("flags aren't a list");
  });
});

describe('moveAll', () => {
  it('removes each flag from the browser only after the server has it', async () => {
    const log: string[] = [];
    const browser = memoryStore([flag('a'), flag('b')], log, 'browser');
    const server = memoryStore([flag('c')], log, 'server');
    await moveAll(browser.store, server.store);
    expect(log).toEqual(['server save a', 'browser remove a', 'server save b', 'browser remove b']);
    expect([...server.saved.keys()]).toEqual(['c', 'a', 'b']);
    expect(browser.saved.size).toBe(0);
  });

  it('keeps a flag in the browser when the server doesn’t take it', async () => {
    const browser = memoryStore([flag('a')]);
    const failing = { ...memoryStore().store, save: () => Promise.reject(new Error('offline')) };
    await expect(moveAll(browser.store, failing)).rejects.toThrow('offline');
    expect([...browser.saved.keys()]).toEqual(['a']);
  });
});

describe('openAccount', () => {
  it('moves the browser’s flags to the account and returns the server store', async () => {
    const browser = memoryStore([flag('a')]);
    const server = memoryStore();
    expect(await openAccount('flags', server.store, () => Promise.resolve(browser.store))).toBe(
      server.store,
    );
    expect([...server.saved.keys()]).toEqual(['a']);
    expect(browser.saved.size).toBe(0);
  });

  it('still opens the account when the browser’s storage is blocked', async () => {
    const server = memoryStore();
    expect(
      await openAccount('flags', server.store, () => Promise.reject(new Error('blocked'))),
    ).toBe(server.store);
  });
});
