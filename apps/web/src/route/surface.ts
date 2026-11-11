// Surface categories for the breakdown bar and route colouring. OSM surface tags are often missing, so a missing tag
// is inferred from road class and track grade where that's reliable (same rules as the gravel custom model, see
// docs/spikes/2026-10-29-gravel.md) and reported as inferred.
import { segmentLengthsM } from '../geo';
import type { RouteResult, Span } from '../routing/types';

export type SurfaceCategory = 'paved' | 'gravel' | 'ground' | 'unknown';
export const SURFACE_CATEGORIES: readonly SurfaceCategory[] = [
  'paved',
  'gravel',
  'ground',
  'unknown',
];

export interface SurfaceClass {
  category: SurfaceCategory;
  /** True when the surface tag was missing and the category was inferred. */
  inferred: boolean;
}

const TAGGED: Record<string, SurfaceCategory> = {
  asphalt: 'paved',
  concrete: 'paved',
  paved: 'paved',
  paving_stones: 'paved',
  cobblestone: 'paved',
  compacted: 'gravel',
  fine_gravel: 'gravel',
  gravel: 'gravel',
  unpaved: 'gravel',
  ground: 'ground',
  dirt: 'ground',
  grass: 'ground',
  sand: 'ground',
  wood: 'ground',
};

const OFFROAD_CLASSES = new Set(['track', 'path', 'bridleway']);

const BY_TRACK_GRADE: Record<string, SurfaceCategory> = {
  grade1: 'paved',
  grade2: 'gravel',
  grade3: 'gravel',
  grade4: 'ground',
  grade5: 'ground',
};

export function classifySurface(
  surface: string,
  roadClass: string,
  trackType: string,
): SurfaceClass {
  const tagged = TAGGED[surface];
  if (tagged) return { category: tagged, inferred: false };
  if (surface !== 'missing') return { category: 'unknown', inferred: false };
  if (!OFFROAD_CLASSES.has(roadClass)) return { category: 'paved', inferred: true };
  const byGrade = BY_TRACK_GRADE[trackType];
  return byGrade ? { category: byGrade, inferred: true } : { category: 'unknown', inferred: false };
}

/** Expands spans into one value per geometry segment. */
export function perSegment<T>(spans: readonly Span<T>[], segmentCount: number, fallback: T): T[] {
  const out = new Array<T>(segmentCount).fill(fallback);
  for (const { from, to, value } of spans)
    for (let i = from; i < to && i < segmentCount; i++) out[i] = value;
  return out;
}

/** Surface class of each geometry segment. */
export function segmentSurfaces(
  route: Pick<RouteResult, 'geometry' | 'attributes'>,
): SurfaceClass[] {
  const n = Math.max(0, route.geometry.coordinates.length - 1);
  const surface = perSegment(route.attributes.surface, n, 'missing');
  const roadClass = perSegment(route.attributes.roadClass, n, 'missing');
  const trackType = perSegment(route.attributes.trackType, n, 'missing');
  return surface.map((s, i) =>
    classifySurface(s, roadClass[i] ?? 'missing', trackType[i] ?? 'missing'),
  );
}

export type SurfaceBreakdown = Record<SurfaceCategory, { meters: number; inferredMeters: number }>;

export function surfaceBreakdown(
  route: Pick<RouteResult, 'geometry' | 'attributes'>,
): SurfaceBreakdown {
  const result = Object.fromEntries(
    SURFACE_CATEGORIES.map((c) => [c, { meters: 0, inferredMeters: 0 }]),
  ) as SurfaceBreakdown;
  const lengths = segmentLengthsM(route.geometry.coordinates);
  segmentSurfaces(route).forEach(({ category, inferred }, i) => {
    const len = lengths[i] ?? 0;
    result[category].meters += len;
    if (inferred) result[category].inferredMeters += len;
  });
  return result;
}
