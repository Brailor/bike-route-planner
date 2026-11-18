import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

const hashWithScrypt = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  length: number,
) => Promise<Buffer>;

export const SESSION_MS = 90 * 24 * 3600 * 1000;
export const USERNAME = /^[a-z0-9_-]{1,32}$/;

async function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  const hash = await hashWithScrypt(password, salt, 32);
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt = '', hash = ''] = stored.split(':');
  const expected = Buffer.from(hash, 'base64');
  const actual = await hashWithScrypt(password, Buffer.from(salt, 'base64'), 32);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('base64');

/**
 * Creates the account, or gives an existing one a new password and ends its sessions. The password is generated
 * (144 random bits), so guessing it over the network is hopeless and logins need no rate limit (ADR 0015).
 */
export async function setPassword(db: DatabaseSync, name: string): Promise<string> {
  if (!USERNAME.test(name)) throw new Error('A username is 1–32 of a–z, 0–9, _ and -');
  const password = randomBytes(18).toString('base64url');
  const hash = await hashPassword(password);
  db.prepare(
    'INSERT INTO users (name, password_hash) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET password_hash = excluded.password_hash',
  ).run(name, hash);
  db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE name = ?)').run(
    name,
  );
  return password;
}

/** A new session token for a correct name and password; the database keeps only its hash. */
export async function logIn(
  db: DatabaseSync,
  name: string,
  password: string,
  now = Date.now(),
): Promise<string | undefined> {
  const user = db.prepare('SELECT id, password_hash FROM users WHERE name = ?').get(name) as
    { id: number; password_hash: string } | undefined;
  if (!user || !(await passwordMatches(password, user.password_hash))) return undefined;
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash(token),
    user.id,
    now + SESSION_MS,
  );
  return token;
}

/** The name of the session's user, or undefined for an unknown or expired session. */
export function sessionUser(db: DatabaseSync, token: string, now = Date.now()): string | undefined {
  const row = db
    .prepare(
      'SELECT users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
    )
    .get(tokenHash(token), now) as { name: string } | undefined;
  return row?.name;
}

export function logOut(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}
