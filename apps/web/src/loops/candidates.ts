// Candidate loops for a workout (README M3): a spread of loops from the start that take about the workout's time, for
// scoring to choose from. Two kinds: the engine's own round trips, and loops through points on a circle.
import { RoutingError, type RouteResult, type RoutingEngine } from '../routing/types';
import { cruiseSpeedMs, predictRide, type RidePrediction, type Rider } from '../speed/model';
import type { AvoidFlag, LonLat, ProfileSettings } from '../types';

export interface LoopSearch {
  start: LonLat;
  durationS: number;
  settings: ProfileSettings;
  flags?: readonly AvoidFlag[];
  rider: Rider;
}

export type LoopSource = 'round_trip' | 'waypoints';

export interface LoopCandidate {
  source: LoopSource;
  route: RouteResult;
  /** The speed model's timing of the loop. */
  ride: RidePrediction;
}

/** Roads are this much longer than straight lines between loop points (live, Vienna, 20–60 km: 1.2–1.5). */
export const DETOUR = 1.35;
/** Real loops are slower than flat cruising (hills, junctions, rough stretches): the first round's guess. */
const FIRST_GUESS_SPEED_FACTOR = 0.9;
/** Directions tried for each kind of loop. */
const DIRECTIONS = 6;
/** Loops whose time is this close to the target (as a share) aren't asked for again. */
const CLOSE_ENOUGH = 0.05;
/** Points on the circle besides the start. */
const VIA_POINTS = 3;
/** Requests at once: the engine is local and each takes well under a second. */
const CONCURRENCY = 4;
/** Loops sharing more than this share of their ways (of the shorter loop's) count as the same loop. */
const SAME_LOOP = 0.8;

const M_PER_DEG_LAT = 111_320;

/**
 * The start and `VIA_POINTS` points evenly spaced on a circle through it, then the start again. The circle lies in
 * the direction `rotation` (radians, counterclockwise from east) and is sized so roads through the points come to
 * about `distanceM`.
 */
export function loopWaypoints(start: LonLat, distanceM: number, rotation: number): LonLat[] {
  const n = VIA_POINTS + 1;
  const straightM = distanceM / DETOUR;
  const radiusM = straightM / (n * 2 * Math.sin(Math.PI / n));
  const [lon, lat] = start;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const at = (angle: number, [x, y]: LonLat, r: number): LonLat => [
    x + (r * Math.cos(angle)) / mPerDegLon,
    y + (r * Math.sin(angle)) / M_PER_DEG_LAT,
  ];
  const centre = at(rotation, start, radiusM);
  const vias = Array.from({ length: VIA_POINTS }, (_, k) =>
    at(rotation + Math.PI + ((k + 1) * 2 * Math.PI) / n, centre, radiusM),
  );
  return [[lon, lat], ...vias, [lon, lat]];
}

interface Plan {
  source: LoopSource;
  /** Distance asked of the engine (m). */
  distanceM: number;
  /** Round-trip seed, or the circle's direction as a step of 2π / DIRECTIONS. */
  variant: number;
}

interface Planned extends LoopCandidate {
  plan: Plan;
}

/** Runs `fn` over `items`, at most `limit` at a time; results in input order. */
async function settleLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T).then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const wayIds = (route: RouteResult) =>
  new Set(route.attributes.osmWayId.flatMap((s) => (s.value === null ? [] : [s.value])));

/** Drops loops that mostly use the same ways as one kept before them. */
export function distinctLoops<T extends { route: RouteResult }>(loops: readonly T[]): T[] {
  const kept: { loop: T; ways: Set<number> }[] = [];
  for (const loop of loops) {
    const ways = wayIds(loop.route);
    const same = kept.some((k) => {
      let shared = 0;
      for (const id of ways) if (k.ways.has(id)) shared++;
      return shared > SAME_LOOP * Math.min(ways.size, k.ways.size);
    });
    if (!same) kept.push({ loop, ways });
  }
  return kept.map((k) => k.loop);
}

/** How far a loop's time is from the target, as a share of it. */
const offBy = (loop: LoopCandidate, durationS: number) =>
  Math.abs(loop.ride.durationS / durationS - 1);

/**
 * Loops from `search.start` that should take about `search.durationS`, distinct from each other, in the order found.
 * First, loops in `DIRECTIONS` directions of each kind, sized from a flat-road speed guess. Then each one whose time
 * is off by more than `CLOSE_ENOUGH` is asked for again in the same direction, scaled by how far off it was; the
 * closer of the two is kept. Per loop, because the error is mostly terrain: live from central Vienna, loops of about
 * the same length took 2.1–3.8 h for a 2.5 h target, depending on how far into the Wienerwald they went.
 */
export async function findLoops(
  engine: RoutingEngine,
  search: LoopSearch,
  signal?: AbortSignal,
): Promise<LoopCandidate[]> {
  const { start, durationS, settings, flags, rider } = search;
  const errors: unknown[] = [];

  /** The loop for each plan, or undefined where the engine couldn't make one. */
  const run = async (plans: Plan[]) => {
    const settled = await settleLimited(plans, CONCURRENCY, async (plan) => {
      signal?.throwIfAborted(); // don't start more once aborted
      const extra = flags ? { flags } : {};
      return plan.source === 'round_trip'
        ? engine.roundTrip(
            { start, distanceM: plan.distanceM, seed: plan.variant, settings, ...extra },
            signal,
          )
        : engine.route(
            {
              waypoints: loopWaypoints(
                start,
                plan.distanceM,
                (plan.variant * 2 * Math.PI) / DIRECTIONS,
              ),
              settings,
              ...extra,
            },
            signal,
          );
    });
    signal?.throwIfAborted();
    return settled.map((result, i): Planned | undefined => {
      const plan = plans[i] as Plan;
      if (result.status === 'rejected') {
        errors.push(result.reason);
        return undefined;
      }
      return {
        source: plan.source,
        route: result.value,
        ride: predictRide(result.value, settings.profile, rider),
        plan,
      };
    });
  };

  const guessM = durationS * cruiseSpeedMs(settings.profile, rider) * FIRST_GUESS_SPEED_FACTOR;
  const sources: LoopSource[] = ['round_trip', 'waypoints'];
  const first = (
    await run(
      sources.flatMap((source) =>
        Array.from({ length: DIRECTIONS }, (_, variant) => ({
          source,
          distanceM: guessM,
          variant,
        })),
      ),
    )
  ).filter((loop) => loop !== undefined);

  const off = first.filter((loop) => offBy(loop, durationS) > CLOSE_ENOUGH);
  const retried = await run(
    off.map(({ plan, ride }) => ({
      ...plan,
      distanceM: (plan.distanceM * durationS) / ride.durationS,
    })),
  );
  const better = new Map(
    off.map((loop, i) => {
      const retry = retried[i];
      return [loop, retry && offBy(retry, durationS) < offBy(loop, durationS) ? retry : loop];
    }),
  );

  const loops = distinctLoops(first.map((loop) => better.get(loop) ?? loop)).map(
    ({ source, route, ride }) => ({ source, route, ride }),
  );
  if (loops.length === 0) {
    const [error] = errors;
    throw error instanceof Error
      ? error
      : new RoutingError('No loop found from this start', 'no_route');
  }
  return loops;
}
