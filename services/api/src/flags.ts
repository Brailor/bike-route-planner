import type { DatabaseSync } from 'node:sqlite';

/** A "do not ride" flag as the app stores it (apps/web/src/types.ts AvoidFlag). */
export interface Flag {
  id: string;
  geometry: { type: 'LineString'; coordinates: number[][] };
  osmWayIds?: number[];
  reason?: (typeof REASONS)[number];
  note?: string;
  createdAt: string;
}

const REASONS = ['overgrown', 'private', 'too_steep', 'bad_surface', 'other'] as const;
export const MAX_POINTS = 10_000;
export const MAX_NOTE_CHARS = 2000;

const isPoint = (p: unknown) =>
  Array.isArray(p) &&
  (p.length === 2 || p.length === 3) &&
  p.every((n) => typeof n === 'number' && Number.isFinite(n));

/**
 * The flag in `body`, rebuilt from the fields the app uses, or undefined if it isn't a valid flag. What comes back
 * is all the database ever stores, so a client can't park arbitrary data on the server.
 */
export function parseFlag(body: unknown): Flag | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { id, geometry, osmWayIds, reason, note, createdAt } = body as Record<string, unknown>;
  const { type, coordinates } = (geometry ?? {}) as Record<string, unknown>;
  if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) return undefined;
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return undefined;
  if (type !== 'LineString' || !Array.isArray(coordinates)) return undefined;
  if (coordinates.length < 2 || coordinates.length > MAX_POINTS || !coordinates.every(isPoint))
    return undefined;
  if (
    osmWayIds !== undefined &&
    !(
      Array.isArray(osmWayIds) &&
      osmWayIds.length <= MAX_POINTS &&
      osmWayIds.every(Number.isSafeInteger)
    )
  )
    return undefined;
  if (reason !== undefined && !REASONS.includes(reason as Flag['reason'] & string))
    return undefined;
  if (note !== undefined && !(typeof note === 'string' && note.length <= MAX_NOTE_CHARS))
    return undefined;
  return {
    id,
    geometry: { type, coordinates: coordinates as number[][] },
    ...(osmWayIds !== undefined && { osmWayIds: osmWayIds as number[] }),
    ...(reason !== undefined && { reason: reason as Flag['reason'] }),
    ...(note !== undefined && { note }),
    createdAt: new Date(createdAt).toISOString(),
  };
}

/** The user's flags, oldest first. */
export function listFlags(db: DatabaseSync, userId: number): Flag[] {
  const rows = db
    .prepare('SELECT flag FROM flags WHERE user_id = ? ORDER BY created_at, id')
    .all(userId) as { flag: string }[];
  return rows.map((row) => JSON.parse(row.flag) as Flag);
}

/** Inserts the flag, or replaces the user's flag with the same id. */
export function saveFlag(db: DatabaseSync, userId: number, flag: Flag): void {
  db.prepare(
    'INSERT INTO flags (user_id, id, created_at, flag) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, id) DO UPDATE SET created_at = excluded.created_at, flag = excluded.flag',
  ).run(userId, flag.id, flag.createdAt, JSON.stringify(flag));
}

export function removeFlag(db: DatabaseSync, userId: number, id: string): void {
  db.prepare('DELETE FROM flags WHERE user_id = ? AND id = ?').run(userId, id);
}
