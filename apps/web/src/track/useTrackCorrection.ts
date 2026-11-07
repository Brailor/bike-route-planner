import { useEffect } from 'react';
import { GraphHopperEngine } from '../routing/graphhopper/GraphHopperEngine';
import { RoutingError, type RoutingEngine } from '../routing/types';
import { selectSettings, usePlanner } from '../state/store';
import { rerouteSection } from './reroute';

const defaultEngine = new GraphHopperEngine();

function message(err: unknown) {
  if (err instanceof RoutingError && err.kind === 'unavailable')
    return 'Can’t reach the routing engine. Start it with “pnpm routing:start”.';
  if (err instanceof RoutingError && err.kind === 'no_route')
    return 'No way around found: the track near this section may be off the road network.';
  return `Rerouting failed: ${err instanceof Error ? err.message : String(err)}`;
}

/**
 * Reroutes the opened track around the section the store asks about, under the current profile and avoiding every
 * flag. With "all", each answer moves the question on and this runs again for the next section.
 */
export function useTrackCorrection(engine: RoutingEngine = defaultEngine) {
  const id = usePlanner((s) => (s.track?.rerouting ? s.track.id : undefined));
  const index = usePlanner((s) => s.track?.current);

  useEffect(() => {
    const state = usePlanner.getState();
    const { track } = state;
    if (id === undefined || index === undefined || !track) return;
    const controller = new AbortController();
    rerouteSection(
      engine,
      track.coordinates,
      track.sections,
      index,
      { settings: selectSettings(state), flags: state.flags },
      controller.signal,
    ).then(
      (result) => usePlanner.getState().setSectionResult(id, index, result),
      // An aborted reroute's error is dropped like its result: the store ignores answers no longer asked for.
      (err: unknown) =>
        usePlanner
          .getState()
          .setSectionResult(id, index, { outcome: 'failed', error: message(err) }),
    );
    return () => controller.abort();
  }, [engine, id, index]);
}
