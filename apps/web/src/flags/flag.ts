// "Do not ride" flags (README M2): a stretch of a route, kept and avoided in every later route.
import type { RouteResult } from '../routing/types';
import type { AvoidFlag } from '../types';
import { selectionGeometry, selectionRange, type FlagSelection } from './selection';

export type FlagReason = NonNullable<AvoidFlag['reason']>;

export const FLAG_REASONS: Record<FlagReason, string> = {
  overgrown: 'Overgrown',
  private: 'Private',
  too_steep: 'Too steep',
  bad_surface: 'Bad surface',
  other: 'Other',
};

export interface FlagDetails {
  reason?: FlagReason;
  note?: string;
}

/** OSM ways the selected segments run on, in route order. Segments of untagged or unknown ways have none. */
export function selectionWayIds(route: RouteResult, selection: FlagSelection): number[] {
  const [from, to] = selectionRange(selection);
  const ids = route.attributes.osmWayId
    .filter((span) => span.from < to && span.to > from && span.value !== null)
    .map((span) => span.value as number);
  return [...new Set(ids)];
}

export function flagFromSelection(
  route: RouteResult,
  selection: FlagSelection,
  { reason, note }: FlagDetails,
  id: string,
  createdAt: Date,
): AvoidFlag {
  const osmWayIds = selectionWayIds(route, selection);
  const trimmed = note?.trim();
  return {
    id,
    geometry: selectionGeometry(route.geometry.coordinates, selection),
    ...(osmWayIds.length && { osmWayIds }),
    ...(reason && { reason }),
    ...(trimmed && { note: trimmed }),
    createdAt: createdAt.toISOString(),
  };
}
