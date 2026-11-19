import { isDate, isId, lineCoordinates } from './items.ts';

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

/**
 * The flag in `body`, rebuilt from the fields the app uses, or undefined if it isn't a valid flag. What comes back
 * is all the database ever stores, so a client can't park arbitrary data on the server.
 */
export function parseFlag(body: unknown): Flag | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { id, geometry, osmWayIds, reason, note, createdAt } = body as Record<string, unknown>;
  const coordinates = lineCoordinates(geometry, MAX_POINTS);
  if (!isId(id) || !isDate(createdAt) || !coordinates) return undefined;
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
    geometry: { type: 'LineString', coordinates },
    ...(osmWayIds !== undefined && { osmWayIds: osmWayIds as number[] }),
    ...(reason !== undefined && { reason: reason as Flag['reason'] }),
    ...(note !== undefined && { note }),
    createdAt: new Date(createdAt).toISOString(),
  };
}
