import { useEffect } from 'react';
import { GraphHopperEngine } from '../routing/graphhopper/GraphHopperEngine';
import { RoutingError, type RoutingEngine } from '../routing/types';
import { riderFrom, riderValue } from '../speed/rider';
import { selectSettings, usePlanner } from '../state/store';
import { findLoops } from './candidates';
import { rankLoops } from './score';

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
    const state = usePlanner.getState();
    const context = {
      workout: request.workout,
      settings: selectSettings(state),
      flags: state.flags,
      ftpW: riderValue(state.userSettings, 'ftpW'),
    };
    findLoops(
      engine,
      {
        start: request.start,
        durationS: request.workout.totalDurationS,
        settings: context.settings,
        flags: context.flags,
        rider: riderFrom(state.userSettings),
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
}
