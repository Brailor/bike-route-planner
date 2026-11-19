import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { setPassword } from './accounts.ts';
import { openDb } from './db.ts';
import { createApi } from './server.ts';

const db = openDb(':memory:');
const server = createServer(createApi(db));
let base = '';
let password = '';

before(async () => {
  password = await setPassword(db, 'anna');
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const logIn = (body: unknown, contentType = 'application/json') =>
  fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: JSON.stringify(body),
  });
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!;

test('login sets an HttpOnly, Secure, SameSite=Strict cookie that /api/me accepts', async () => {
  const res = await logIn({ username: 'anna', password });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { username: 'anna' });
  const cookie = res.headers.get('set-cookie')!;
  assert.match(
    cookie,
    /^session=[\w-]+; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=7776000$/,
  );

  const me = await fetch(`${base}/api/me`, { headers: { Cookie: `other=1; ${cookieOf(res)}` } });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { username: 'anna' });
});

test('/api/me refuses no cookie and an unknown one', async () => {
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api/me`, { headers: { Cookie: 'session=made-up' } })).status,
    401,
  );
});

test('a wrong password is refused, a malformed login is a 400', async () => {
  assert.equal((await logIn({ username: 'anna', password: 'guess' })).status, 401);
  assert.equal((await logIn({ username: 'anna' })).status, 400);
  // Only JSON: a plain form post from another site can't log anyone in.
  assert.equal((await logIn({ username: 'anna', password }, 'text/plain')).status, 400);
  assert.equal(
    (await logIn({ username: 'anna', password, padding: 'x'.repeat(5000) })).status,
    400,
  );
});

test('logout ends the session and clears the cookie', async () => {
  const cookie = cookieOf(await logIn({ username: 'anna', password }));
  const out = await fetch(`${base}/api/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(out.status, 204);
  assert.match(out.headers.get('set-cookie')!, /^session=; .*Max-Age=0$/);
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookie } })).status, 401);
});

const flag = {
  id: 'f1',
  geometry: {
    type: 'LineString',
    coordinates: [
      [16.37, 48.2],
      [16.38, 48.21],
    ],
  },
  createdAt: '2026-11-18T09:00:00.000Z',
};
const putFlag = (cookie: string, body: unknown, id = 'f1') =>
  fetch(`${base}/api/flags/${id}`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const flagsOf = async (cookie: string): Promise<unknown> =>
  (await fetch(`${base}/api/flags`, { headers: { Cookie: cookie } })).json();

test('a logged-in user saves, lists and deletes their flags; another user sees none of them', async () => {
  const anna = cookieOf(await logIn({ username: 'anna', password }));
  const benPassword = await setPassword(db, 'ben');
  const ben = cookieOf(await logIn({ username: 'ben', password: benPassword }));

  assert.equal((await putFlag(anna, flag)).status, 204);
  assert.equal((await putFlag(anna, { ...flag, note: 'Gate' })).status, 204);
  assert.deepEqual(await flagsOf(anna), [{ ...flag, note: 'Gate' }]);
  assert.deepEqual(await flagsOf(ben), []);

  // Ben can't delete Anna's flag, and a flag line of 10,000 points fits in a request.
  const long = {
    ...flag,
    geometry: { ...flag.geometry, coordinates: Array(10_000).fill([16.371234, 48.212345]) },
  };
  assert.equal(
    (await fetch(`${base}/api/flags/f1`, { method: 'DELETE', headers: { Cookie: ben } })).status,
    204,
  );
  assert.equal(((await flagsOf(anna)) as unknown[]).length, 1);
  assert.equal((await putFlag(anna, long)).status, 204);
  assert.deepEqual(await flagsOf(anna), [long]);

  assert.equal(
    (await fetch(`${base}/api/flags/f1`, { method: 'DELETE', headers: { Cookie: anna } })).status,
    204,
  );
  assert.deepEqual(await flagsOf(anna), []);
});

test('flags need a login, a valid flag and a matching id', async () => {
  const anna = cookieOf(await logIn({ username: 'anna', password }));
  assert.equal((await fetch(`${base}/api/flags`)).status, 401);
  assert.equal((await putFlag('', flag)).status, 401);
  assert.equal((await fetch(`${base}/api/flags/f1`, { method: 'DELETE' })).status, 401);

  assert.equal((await putFlag(anna, flag, 'f2')).status, 400);
  assert.equal((await putFlag(anna, { ...flag, reason: 'muddy' })).status, 400);
  assert.equal((await putFlag(anna, { ...flag, note: 'x'.repeat(1_000_001) })).status, 400);
  assert.deepEqual(await flagsOf(anna), []);
});

test('a character split between two parts of a request body arrives whole', async () => {
  const cookie = cookieOf(await logIn({ username: 'anna', password }));
  const body = Buffer.from(JSON.stringify({ ...flag, note: 'Brücke gesperrt' }));
  const cut = body.indexOf('ü') + 1; // between the two bytes of ü
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(
      `${base}/api/flags/f1`,
      { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' } },
      (res) => resolve(res.resume().statusCode),
    );
    req.on('error', reject);
    req.write(body.subarray(0, cut));
    setTimeout(() => req.end(body.subarray(cut)), 50);
  });
  assert.equal(status, 204);
  assert.deepEqual(await flagsOf(cookie), [{ ...flag, note: 'Brücke gesperrt' }]);
  await fetch(`${base}/api/flags/f1`, { method: 'DELETE', headers: { Cookie: cookie } });
});

test('saved routes are their own collection, and a 50,000-point route fits in a request', async () => {
  const cookie = cookieOf(await logIn({ username: 'anna', password }));
  const route = {
    id: 'r1',
    name: 'Long ride',
    geometry: {
      type: 'LineString',
      coordinates: Array(50_000).fill([16.3712345, 48.2101234, 183.12]),
    },
    distanceM: 250_000,
    elevation: 'file',
    createdAt: '2026-11-18T09:00:00.000Z',
  };
  const put = (body: unknown, id = 'r1') =>
    fetch(`${base}/api/routes/${id}`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const list = async (): Promise<unknown> =>
    (await fetch(`${base}/api/routes`, { headers: { Cookie: cookie } })).json();

  assert.equal((await fetch(`${base}/api/routes`)).status, 401);
  assert.equal((await put(route)).status, 204);
  assert.deepEqual(await list(), [route]);
  assert.deepEqual(await flagsOf(cookie), []);
  // A flag isn't a route, nor a route with another id.
  assert.equal((await put(flag)).status, 400);
  assert.equal((await put(route, 'r2')).status, 400);
  assert.equal((await put({ ...route, name: 'x'.repeat(3_000_001) })).status, 400);

  assert.equal(
    (await fetch(`${base}/api/routes/r1`, { method: 'DELETE', headers: { Cookie: cookie } }))
      .status,
    204,
  );
  assert.deepEqual(await list(), []);
});

test('anything else is a 404', async () => {
  assert.equal((await fetch(`${base}/api/users`)).status, 404);
  const anna = cookieOf(await logIn({ username: 'anna', password }));
  for (const [method, path] of [
    ['GET', '/api/workouts'],
    ['GET', '/api/flags/f1'],
    ['POST', '/api/flags'],
    ['PUT', '/api/flags'],
  ] as const)
    assert.equal(
      (await fetch(`${base}${path}`, { method, headers: { Cookie: anna } })).status,
      404,
      `${method} ${path}`,
    );
  assert.equal((await fetch(`${base}/api/me`, { method: 'POST' })).status, 404);
});
