import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { logIn, logOut, SESSION_MS, sessionUser } from './accounts.ts';
import { listFlags, parseFlag, removeFlag, saveFlag } from './flags.ts';

const COOKIE = 'session';
const LOGIN_BODY_CHARS = 4096;
// A flag is a line of up to MAX_POINTS points (flags.ts).
const FLAG_BODY_CHARS = 1_000_000;
const FLAG_PATH = /^\/api\/flags\/([\w-]{1,64})$/;

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

/** The JSON body, or undefined if it isn't JSON or is longer than `maxChars`. */
async function readJson(req: IncomingMessage, maxChars: number): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) return undefined;
  req.setEncoding('utf8'); // so a character split between chunks stays whole
  let text = '';
  for await (const chunk of req) {
    text += String(chunk);
    if (text.length > maxChars) return undefined;
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
  // this function is already a bit too cumbersome, if it grows more, split the routes into separate functions and call them here
  // potentially think about using a router library, but for now this is simple enough to manage
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const token = sessionToken(req);
    const path = req.url?.split('?')[0] ?? '';
    const route = `${req.method} ${path}`;
    const user = token ? sessionUser(db, token) : undefined;
    const notLoggedIn = () => send(res, 401, { error: 'Not logged in' });

    if (route === 'GET /api/me')
      return user ? send(res, 200, { username: user.name }) : notLoggedIn();
    if (route === 'POST /api/login') {
      const body = await readJson(req, LOGIN_BODY_CHARS);
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

    // The user's flags (ADR 0016); each user sees and changes only their own.
    if (route === 'GET /api/flags')
      return user ? send(res, 200, listFlags(db, user.id)) : notLoggedIn();
    const flagId = FLAG_PATH.exec(path)?.[1];
    if (flagId && req.method === 'PUT') {
      if (!user) return notLoggedIn();
      const flag = parseFlag(await readJson(req, FLAG_BODY_CHARS));
      if (!flag || flag.id !== flagId)
        return send(res, 400, { error: 'Send a valid flag with this id' });
      saveFlag(db, user.id, flag);
      return send(res, 204);
    }
    if (flagId && req.method === 'DELETE') {
      if (!user) return notLoggedIn();
      removeFlag(db, user.id, flagId);
      return send(res, 204);
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
