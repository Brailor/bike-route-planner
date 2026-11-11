import { usesFlag } from '../flags/avoid';
import type { RouteResult, RoutingEngine } from '../routing/types';
import type { AvoidFlag, LonLat, ProfileSettings } from '../types';
import {
  anchors,
  cumulativeM,
  spliceDetour,
  type Bounds,
  type FlaggedSection,
  type Splice,
} from './sections';

/**
 * Ways around a section are asked for from this far along the track either side of it. Close in, the way around
 * keeps most of the track, but where there's no way around close by (a bridge, a long dam), it has to come back to
 * the track just past the flag, which can cost kilometres; further out, the engine can rejoin the track where it
 * suits. Live (6 routes around Vienna, 200–600 m flags): the cheapest came from 50 m for 2, 1 km for 2 and 3 km for
 * 2; against 50 m alone, those 4 added 0.5–3.6 km less riding.
 */
export const ANCHOR_DISTANCES_M = [50, 300, 1000, 3000] as const;

/**
 * Giving up a metre of the user's own track (beyond the flagged section) costs as much as riding this many metres
 * more: a way around that rejoins the track further away has to save four times what it replaces.
 */
export const GIVE_UP_COST = 0.25;

export type Reroute =
  /** `detour`: the way around as routed, whose attributes go into the track's. */
  | { outcome: 'rerouted'; splice: Splice; detour: Pick<RouteResult, 'geometry' | 'attributes'> }
  | { outcome: 'no_way_around' };

/** Where a way around `sections[index]` may run along the track: up to its neighbours, not into them. */
export function sectionBounds(
  sections: readonly FlaggedSection[],
  index: number,
  trackLength: number,
): Bounds {
  return { min: sections[index - 1]?.to ?? 0, max: sections[index + 1]?.from ?? trackLength - 1 };
}

const lengthM = (coordinates: readonly (readonly number[])[]) =>
  cumulativeM(coordinates).at(-1) ?? 0;

/** What a way around costs: the riding it adds, and a share of the user's own track it gives up. */
export function spliceCost(
  track: readonly (readonly number[])[],
  section: FlaggedSection,
  splice: Splice,
): number {
  const addedM = lengthM(splice.coordinates) - lengthM(track);
  const givenUpM =
    lengthM(track.slice(splice.kept, section.from + 1)) +
    lengthM(track.slice(section.to, splice.resumed + 1));
  return addedM + GIVE_UP_COST * givenUpM;
}

/**
 * The track with a way around one of its flagged sections: the engine routes between points on the track either
 * side of it, from each of the anchor distances, avoiding every flag; the cheapest answer is spliced in. When every
 * way still runs along a flag, there's none.
 */
export async function rerouteSection(
  engine: RoutingEngine,
  track: readonly (readonly number[])[],
  sections: readonly FlaggedSection[],
  index: number,
  { settings, flags }: { settings: ProfileSettings; flags: readonly AvoidFlag[] },
  signal?: AbortSignal,
): Promise<Reroute> {
  const section = sections[index];
  if (!section) throw new Error(`No section ${index}`);
  const bounds = sectionBounds(sections, index, track.length);
  // A short track gives the same anchors for several distances; each pair is asked for once.
  const pairs = new Map(
    ANCHOR_DISTANCES_M.map((d) => {
      const ends = anchors(track, section, bounds, d);
      return [ends.join(), ends] as const;
    }),
  );
  const answers = await Promise.allSettled(
    [...pairs.values()].map(async (ends) => {
      const waypoints = ends.map((i): LonLat => [track[i]?.[0] ?? 0, track[i]?.[1] ?? 0]);
      const route = await engine.route({ waypoints, settings, flags }, signal);
      return usesFlag(route, flags)
        ? undefined
        : {
            splice: spliceDetour(track, section, bounds, ends, route.geometry.coordinates),
            detour: route,
          };
    }),
  );
  const splices = answers.flatMap((a) => (a.status === 'fulfilled' && a.value ? [a.value] : []));
  const failed = answers.find((a) => a.status === 'rejected');
  // Only when no answer came back is a failure the outcome: an error, rather than "no way around".
  if (failed && answers.every((a) => a.status === 'rejected')) throw failed.reason;
  const best = splices
    .map((way) => ({ ...way, cost: spliceCost(track, section, way.splice) }))
    .sort((a, b) => a.cost - b.cost)[0];
  return best
    ? { outcome: 'rerouted', splice: best.splice, detour: best.detour }
    : { outcome: 'no_way_around' };
}
