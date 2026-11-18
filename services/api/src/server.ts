import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { logIn, logOut, SESSION_MS, sessionUser } from './accounts.ts';

const COOKIE = 'session';
const MAX_BODY_CHARS = 4096;

function sessionToken(req: IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=');
  }
  return undefined;
}

// HttpOnly: scripts can't read it; Secure: HTTPS only (browsers count http://localhost as secure); Strict: not sent
// on requests from other sites, so no other site can act as the user.
const sessionCookie = (token: string, maxAgeS: number) =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeS}`;

function send(
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(
    status,
    body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
  );
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) return undefined;
  let text = '';
  for await (const chunk of req) {
    text += String(chunk);
    if (text.length > MAX_BODY_CHARS) return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The API (ADR 0015). `GET /api/me` also decides, for the web container, whether `/gh` and `/geo` requests pass.
 */
export function createApi(db: DatabaseSync): RequestListener {
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const token = sessionToken(req);
    const route = `${req.method} ${req.url?.split('?')[0]}`;

    if (route === 'GET /api/me') {
      const username = token && sessionUser(db, token);
      return username ? send(res, 200, { username }) : send(res, 401, { error: 'Not logged in' });
    }
    if (route === 'POST /api/login') {
      const body = await readJson(req);
      const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown };
      if (typeof username !== 'string' || typeof password !== 'string')
        return send(res, 400, { error: 'Send a username and a password' });
      const newToken = await logIn(db, username, password);
      if (!newToken) return send(res, 401, { error: 'Wrong username or password' });
      return send(
        res,
        200,
        { username },
        { 'Set-Cookie': sessionCookie(newToken, SESSION_MS / 1000) },
      );
    }
    if (route === 'POST /api/logout') {
      if (token) logOut(db, token);
      return send(res, 204, undefined, { 'Set-Cookie': sessionCookie('', 0) });
    }
    return send(res, 404, { error: 'Not found' });
  }

  return (req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) send(res, 500, { error: 'Server error' });
    });
  };
}
