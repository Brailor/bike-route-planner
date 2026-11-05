import { useEffect } from 'react';
import { GraphHopperEngine } from '../routing/graphhopper/GraphHopperEngine';
import { RoutingError, type RoutingEngine } from '../routing/types';
import { predictRide } from '../speed/model';
import { riderFrom, riderValue } from '../speed/rider';
import { selectSettings, usePlanner } from '../state/store';
import type { Workout } from '../types';
import { findLoops } from './candidates';
import { reverseWaypoints } from './direction';
import { rankLoops, scoreLoop } from './score';

const defaultEngine = new GraphHopperEngine();

/** Loops shown (README M3: top 3). */
export const SHOWN_LOOPS = 3;

function message(err: unknown) {
  if (err instanceof RoutingError && err.kind === 'unavailable')
    return 'Can’t reach the routing engine. Start it with “pnpm routing:start”.';
  if (err instanceof RoutingError && err.kind === 'no_route')
    return 'No loops found from this start. Try moving it onto a road or path.';
  return `Finding loops failed: ${err instanceof Error ? err.message : String(err)}`;
}

/** What a search or a reversal is scored against: the workout searched for, and the current settings. */
function scoreContext(workout: Workout) {
  const state = usePlanner.getState();
  return {
    workout,
    settings: selectSettings(state),
    flags: state.flags,
    ftpW: riderValue(state.userSettings, 'ftpW'),
    rider: riderFrom(state.userSettings),
  };
}

/**
 * Runs each loop search the store asks for: candidates, ranked, the best kept. Results close when what they were
 * found for changes (start, workout, profile, flags, rider), since their times and scores no longer hold.
 */
export function useLoopSearch(engine: RoutingEngine = defaultEngine) {
  const request = usePlanner((s) =>
    s.loops?.status === 'searching' ? s.loops.request : undefined,
  );
  const start = usePlanner((s) => s.waypoints[0]);
  const workout = usePlanner((s) => s.workout);
  const settings = usePlanner(selectSettings);
  const flags = usePlanner((s) => s.flags);
  const userSettings = usePlanner((s) => s.userSettings);

  useEffect(() => {
    usePlanner.getState().closeLoops();
  }, [start, workout, settings, flags, userSettings]);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const context = scoreContext(request.workout);
    findLoops(
      engine,
      {
        start: request.start,
        durationS: request.workout.totalDurationS,
        settings: context.settings,
        flags: context.flags,
        rider: context.rider,
      },
      controller.signal,
    ).then(
      (loops) =>
        usePlanner
          .getState()
          .setLoopResults(request, rankLoops(loops, context).slice(0, SHOWN_LOOPS)),
      // An aborted search's error is dropped like its results: the store ignores answers to closed searches.
      (err: unknown) => usePlanner.getState().setLoopError(request, message(err)),
    );
    return () => controller.abort();
  }, [engine, request]);

  // Riding a loop the other way: the engine routes back through points along it, then it's timed and scored afresh
  // (its climbs are now descents, which matters for where intervals land).
  const reverseIndex = usePlanner((s) => s.loops?.reversing);
  const searched = usePlanner((s) => s.loops?.request);
  const toReverse = usePlanner((s) =>
    reverseIndex === undefined ? undefined : s.loops?.results[reverseIndex]?.loop,
  );
  useEffect(() => {
    if (!searched || reverseIndex === undefined || !toReverse) return;
    const controller = new AbortController();
    const context = scoreContext(searched.workout);
    engine
      .route(
        {
          waypoints: reverseWaypoints(toReverse.route.geometry.coordinates),
          settings: context.settings,
          flags: context.flags,
          passThrough: true,
        },
        controller.signal,
      )
      .then(
        (route) => {
          const ride = predictRide(route, context.settings.profile, context.rider);
          const reversed = { ...toReverse, route, ride };
          usePlanner.getState().setReversedLoop(searched, reverseIndex, {
            loop: reversed,
            score: scoreLoop(reversed, context),
          });
        },
        (err: unknown) =>
          usePlanner
            .getState()
            .setReverseError(
              searched,
              err instanceof RoutingError && err.kind === 'no_route'
                ? 'This loop can’t be ridden the other way.'
                : message(err),
            ),
      );
    return () => controller.abort();
  }, [engine, searched, reverseIndex, toReverse]);
}
