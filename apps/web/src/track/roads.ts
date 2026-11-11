// The roads an opened track runs along (ADR 0012): the engine matches the track to the road network, and each of the
// track's own segments takes the attributes (surface, road class, ...) of the matched road beside it. The track itself
// stays as it is.
import { projectOnSegment } from '../geo';
import { perSegment } from '../route/surface';
import type { RouteAttributes, RouteResult, Span } from '../routing/types';
import { cumulativeM, type Splice } from './sections';

type Coordinates = readonly (readonly number[])[];
type Line = Pick<RouteResult, 'geometry' | 'attributes'>;

/** How far a track segment's middle may be from the matched road and still be on it: GPS error, as matched. */
export const NEAR_M = 30;
/** How much further along the matched roads than along the track the next segment is looked for. */
export const LOOKAHEAD_M = 300;
/**
 * A road segment heading the other way from the track's counts as this much further off, so a road ridden out and
 * back is matched pass by pass. (A track segment too short to have a heading, such as a stop, has no preference.)
 */
export const WRONG_WAY_M = 20;
/**
 * The surface of a stretch no road was matched to. It's no OSM surface, so it counts as unknown, and isn't estimated
 * from the road type the way an untagged road's is.
 */
export const UNMATCHED = 'unmatched';

/** Runs of equal values as spans over segments. */
function toSpans<T>(values: readonly T[]): Span<T>[] {
  const out: Span<T>[] = [];
  values.forEach((value, i) => {
    const last = out.at(-1);
    if (last && last.value === value) last.to = i + 1;
    else out.push({ from: i, to: i + 1, value });
  });
  return out;
}

/**
 * For each of the track's segments, the segment of the matched roads beside it, or `undefined` when none is near.
 * The search only goes forward along the roads, as the track does, so a road ridden twice is matched pass by pass.
 */
export function matchedSegments(track: Coordinates, roads: Coordinates): (number | undefined)[] {
  const roadAlong = cumulativeM(roads);
  const trackAlong = cumulativeM(track);
  const out: (number | undefined)[] = [];
  let cursor = 0; // the road segment the last matched track segment lay along
  let since = 0; // how far along the track that segment started
  for (let i = 0; i + 1 < track.length; i++) {
    const [ax = 0, ay = 0] = track[i] ?? [];
    const [bx = 0, by = 0] = track[i + 1] ?? [];
    const middle = [(ax + bx) / 2, (ay + by) / 2];
    // From the end of the road segment last matched: the track may have been anywhere along it.
    const reach = (roadAlong[cursor + 1] ?? 0) + (trackAlong[i + 1] ?? 0) - since + LOOKAHEAD_M;
    const heading = (trackAlong[i + 1] ?? 0) - (trackAlong[i] ?? 0) >= 1;
    let best: { j: number; off: number; score: number } | undefined;
    for (let j = cursor; j + 1 < roads.length && (roadAlong[j] ?? 0) <= reach; j++) {
      const [cx = 0, cy = 0] = roads[j] ?? [];
      const [dx = 0, dy = 0] = roads[j + 1] ?? [];
      const off = projectOnSegment(middle, [cx, cy], [dx, dy]).distanceM;
      // Longitude and latitude degrees differ in length, but not enough to flip a heading's sign at our latitudes.
      const wrongWay = heading && (bx - ax) * (dx - cx) + (by - ay) * (dy - cy) < 0;
      const score = off + (wrongWay ? WRONG_WAY_M : 0);
      if (!best || score < best.score) best = { j, off, score };
    }
    if (best && best.off <= NEAR_M) {
      out.push(best.j);
      cursor = best.j;
      since = trackAlong[i] ?? 0;
    } else out.push(undefined);
  }
  return out;
}

/** The matched roads' attributes, carried over to the track's own segments. */
export function trackAttributes(track: Coordinates, matched: Line): RouteAttributes {
  const roads = matched.geometry.coordinates;
  const index = matchedSegments(track, roads);
  const n = Math.max(0, roads.length - 1);
  const carry = <T>(spans: readonly Span<T>[], untagged: T, unmatched: T) => {
    const values = perSegment(spans, n, untagged);
    return toSpans(index.map((j) => (j === undefined ? unmatched : (values[j] ?? untagged))));
  };
  const { surface, roadClass, trackType, osmWayId, crossing } = matched.attributes;
  return {
    surface: carry(surface, 'missing', UNMATCHED),
    roadClass: carry(roadClass, 'missing', 'missing'),
    trackType: carry(trackType, 'missing', 'missing'),
    osmWayId: carry<number | null>(osmWayId, null, null),
    crossing: carry(crossing, 'missing', 'missing'),
  };
}

/**
 * The track's attributes once a way around is spliced in (`spliceDetour`): the way around brings its own, from the
 * engine. The two joins take the old track's, since the way around turns off where it runs.
 */
export function spliceAttributes(
  attributes: RouteAttributes,
  trackLength: number,
  detour: Line,
  splice: Splice,
): RouteAttributes {
  const detourSegments = Math.max(0, detour.geometry.coordinates.length - 1);
  const join = <T>(old: readonly Span<T>[], way: readonly Span<T>[], fallback: T) => {
    const before = perSegment(old, Math.max(0, trackLength - 1), fallback);
    const around = perSegment(way, detourSegments, fallback);
    return toSpans([
      ...before.slice(0, splice.kept),
      before[splice.kept] ?? fallback,
      ...around.slice(splice.detourFrom, splice.detourTo),
      before[splice.resumed - 1] ?? fallback,
      ...before.slice(splice.resumed),
    ]);
  };
  const way = detour.attributes;
  return {
    surface: join(attributes.surface, way.surface, 'missing'),
    roadClass: join(attributes.roadClass, way.roadClass, 'missing'),
    trackType: join(attributes.trackType, way.trackType, 'missing'),
    osmWayId: join<number | null>(attributes.osmWayId, way.osmWayId, null),
    crossing: join(attributes.crossing, way.crossing, 'missing'),
  };
}
