/**
 * Logging in to the API (ADR 0015). Only the web container has accounts; the dev server has none, and the app runs
 * there without a login.
 */
export type Session =
  | { kind: 'in'; username: string }
  | { kind: 'out' }
  /** No accounts on this server (`/api/me` isn't the API's answer): nothing to log in to. */
  | { kind: 'none' };

export interface SessionApi {
  check(): Promise<Session>;
  /** The new session, or undefined for a wrong username or password. */
  logIn(username: string, password: string): Promise<Session | undefined>;
  logOut(): Promise<void>;
}

async function username(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { username?: unknown };
    return typeof body.username === 'string' ? body.username : undefined;
  } catch {
    return undefined;
  }
}

export function createSessionApi(fetchFn: typeof fetch = (...args) => fetch(...args)): SessionApi {
  return {
    async check() {
      const res = await fetchFn('/api/me').catch(() => undefined);
      if (res?.status === 401) return { kind: 'out' };
      const name = res && (await username(res));
      return name ? { kind: 'in', username: name } : { kind: 'none' };
    },
    async logIn(user, password) {
      const res = await fetchFn('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password }),
      });
      if (res.status === 401) return undefined;
      const name = await username(res);
      if (!name) throw new Error(`Login failed (${res.status})`);
      return { kind: 'in', username: name };
    },
    async logOut() {
      const res = await fetchFn('/api/logout', { method: 'POST' });
      if (!res.ok) throw new Error(`Logout failed (${res.status})`);
    },
  };
}
