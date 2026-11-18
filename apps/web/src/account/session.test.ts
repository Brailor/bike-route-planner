import { describe, expect, it, vi } from 'vitest';
import { createSessionApi } from './session';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createSessionApi', () => {
  it('reads the session from /api/me', async () => {
    const api = (res: Response | Error) =>
      createSessionApi(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res)));
    expect(await api(json(200, { username: 'anna' })).check()).toEqual({
      kind: 'in',
      username: 'anna',
    });
    expect(await api(json(401, { error: 'Not logged in' })).check()).toEqual({ kind: 'out' });
    // The dev server answers with the app's own page, or nothing: no accounts there.
    expect(await api(new Response('<!doctype html>', { status: 200 })).check()).toEqual({
      kind: 'none',
    });
    expect(await api(new Response('', { status: 404 })).check()).toEqual({ kind: 'none' });
    expect(await api(new TypeError('Failed to fetch')).check()).toEqual({ kind: 'none' });
  });

  it('logs in with a JSON body; a wrong password is undefined, anything else unexpected throws', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(json(200, { username: 'anna' })));
    expect(await createSessionApi(fetchFn).logIn('anna', 'pw')).toEqual({
      kind: 'in',
      username: 'anna',
    });
    expect(fetchFn).toHaveBeenCalledWith('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username":"anna","password":"pw"}',
    });
    expect(
      await createSessionApi(() => Promise.resolve(json(401, {}))).logIn('anna', 'x'),
    ).toBeUndefined();
    await expect(
      createSessionApi(() => Promise.resolve(json(502, {}))).logIn('anna', 'pw'),
    ).rejects.toThrow('502');
  });

  it('logs out, and says when that failed', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    await createSessionApi(fetchFn).logOut();
    expect(fetchFn).toHaveBeenCalledWith('/api/logout', { method: 'POST' });
    await expect(
      createSessionApi(() => Promise.resolve(new Response(null, { status: 502 }))).logOut(),
    ).rejects.toThrow('502');
  });
});
