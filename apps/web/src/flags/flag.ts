// "Do not ride" flags (README M2): a stretch of a route, kept and avoided in every later route.
import { segmentLengthsM } from '../geo';
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

/** The flag with its reason and note replaced: unset or blank ones are left out. */
export function withDetails(flag: AvoidFlag, { reason, note }: FlagDetails): AvoidFlag {
  const rest: AvoidFlag = { ...flag };
  delete rest.reason;
  delete rest.note;
  const trimmed = note?.trim();
  return { ...rest, ...(reason && { reason }), ...(trimmed && { note: trimmed }) };
}

/** Length of a flagged stretch, in metres. */
export const flagLengthM = (flag: AvoidFlag) =>
  segmentLengthsM(flag.geometry.coordinates).reduce((sum, l) => sum + l, 0);

export function flagFromSelection(
  route: RouteResult,
  selection: FlagSelection,
  { reason, note }: FlagDetails,
  id: string,
  createdAt: Date,
): AvoidFlag {
  const osmWayIds = selectionWayIds(route, selection);
  const flag: AvoidFlag = {
    id,
    geometry: selectionGeometry(route.geometry.coordinates, selection),
    ...(osmWayIds.length && { osmWayIds }),
    createdAt: createdAt.toISOString(),
  };
  return withDetails(flag, { reason, note });
}
