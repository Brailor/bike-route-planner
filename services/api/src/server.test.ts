import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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

test('anything else is a 404', async () => {
  assert.equal((await fetch(`${base}/api/users`)).status, 404);
  assert.equal((await fetch(`${base}/api/me`, { method: 'POST' })).status, 404);
});
