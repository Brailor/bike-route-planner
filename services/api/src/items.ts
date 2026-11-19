import type { DatabaseSync } from 'node:sqlite';

/**
 * What a user keeps on the server (ADR 0016): each kind in its own table, with the item as JSON in one column,
 * since it's only ever read whole. Table and column names come from this fixed list, never from a request.
 */
const TABLES = {
  flags: { column: 'flag' },
  routes: { column: 'route' },
} as const;

export type Collection = keyof typeof TABLES;

export interface Item {
  id: string;
  createdAt: string;
}

export const isId = (id: unknown): id is string =>
  typeof id === 'string' && /^[\w-]{1,64}$/.test(id);
export const isDate = (d: unknown): d is string =>
  typeof d === 'string' && !Number.isNaN(Date.parse(d));
const isPoint = (p: unknown) =>
  Array.isArray(p) &&
  (p.length === 2 || p.length === 3) &&
  p.every((n) => typeof n === 'number' && Number.isFinite(n));

/** The coordinates of a GeoJSON LineString of 2 to `maxPoints` [lon, lat, ele?] points, or undefined. */
export function lineCoordinates(geometry: unknown, maxPoints: number): number[][] | undefined {
  const { type, coordinates } = (geometry ?? {}) as Record<string, unknown>;
  if (type !== 'LineString' || !Array.isArray(coordinates)) return undefined;
  if (coordinates.length < 2 || coordinates.length > maxPoints || !coordinates.every(isPoint))
    return undefined;
  return coordinates as number[][];
}

/** The user's items, oldest first. */
export function listItems(db: DatabaseSync, collection: Collection, userId: number): unknown[] {
  const { column } = TABLES[collection];
  const rows = db
    .prepare(
      `SELECT ${column} AS item FROM ${collection} WHERE user_id = ? ORDER BY created_at, id`,
    )
    .all(userId) as { item: string }[];
  return rows.map((row) => JSON.parse(row.item) as unknown);
}

/** Inserts the item, or replaces the user's item with the same id. */
export function saveItem(
  db: DatabaseSync,
  collection: Collection,
  userId: number,
  item: Item,
): void {
  const { column } = TABLES[collection];
  db.prepare(
    `INSERT INTO ${collection} (user_id, id, created_at, ${column}) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, id) DO UPDATE SET created_at = excluded.created_at, ${column} = excluded.${column}`,
  ).run(userId, item.id, item.createdAt, JSON.stringify(item));
}

export function removeItem(
  db: DatabaseSync,
  collection: Collection,
  userId: number,
  id: string,
): void {
  db.prepare(`DELETE FROM ${collection} WHERE user_id = ? AND id = ?`).run(userId, id);
}
