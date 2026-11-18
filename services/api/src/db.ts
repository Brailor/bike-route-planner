import { DatabaseSync } from 'node:sqlite';

/** Opens (and if needed creates) the database: one file, ADR 0015. */
export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flags (
      user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      flag TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );
  `);
  return db;
}
