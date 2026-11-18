import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logIn, logOut, SESSION_MS, sessionUser, setPassword } from './accounts.ts';
import { openDb } from './db.ts';

test('a generated password logs in; a wrong one or an unknown name does not', async () => {
  const db = openDb(':memory:');
  const password = await setPassword(db, 'anna');
  assert.ok(password.length >= 24);
  const token = await logIn(db, 'anna', password);
  assert.ok(token);
  assert.equal(sessionUser(db, token)?.name, 'anna');
  assert.equal(await logIn(db, 'anna', `${password}x`), undefined);
  assert.equal(await logIn(db, 'bert', password), undefined);
});

test('only a hash of the password and of the session token is stored', async () => {
  const db = openDb(':memory:');
  const password = await setPassword(db, 'anna');
  const token = (await logIn(db, 'anna', password))!;
  const stored = JSON.stringify([
    db.prepare('SELECT * FROM users').all(),
    db.prepare('SELECT * FROM sessions').all(),
  ]);
  assert.ok(!stored.includes(password));
  assert.ok(!stored.includes(token));
});

test('a session ends when it expires or on logout', async () => {
  const db = openDb(':memory:');
  const password = await setPassword(db, 'anna');
  const now = Date.now();
  const token = (await logIn(db, 'anna', password, now))!;
  assert.equal(sessionUser(db, token, now + SESSION_MS - 1)?.name, 'anna');
  assert.equal(sessionUser(db, token, now + SESSION_MS), undefined);
  // The next login clears expired sessions away.
  await logIn(db, 'anna', password, now + SESSION_MS);
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get()!.n, 1);
  logOut(db, token);
  assert.equal(sessionUser(db, token, now), undefined);
});

test('a new password replaces the old one and ends existing sessions', async () => {
  const db = openDb(':memory:');
  const old = await setPassword(db, 'anna');
  const token = (await logIn(db, 'anna', old))!;
  const fresh = await setPassword(db, 'anna');
  assert.equal(sessionUser(db, token), undefined);
  assert.equal(await logIn(db, 'anna', old), undefined);
  assert.ok(await logIn(db, 'anna', fresh));
});

test('usernames are short and plain', async () => {
  const db = openDb(':memory:');
  await assert.rejects(setPassword(db, 'Anna Smith'));
  await assert.rejects(setPassword(db, ''));
  await assert.rejects(setPassword(db, 'a'.repeat(33)));
});
