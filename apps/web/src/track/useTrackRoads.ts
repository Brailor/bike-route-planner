import { useEffect } from 'react';
import { GraphHopperEngine } from '../routing/graphhopper/GraphHopperEngine';
import { RoutingError, type RoutingEngine } from '../routing/types';
import { usePlanner } from '../state/store';
import { trackAttributes } from './roads';

const defaultEngine = new GraphHopperEngine();

function message(err: unknown) {
  if (err instanceof RoutingError && err.kind === 'unavailable')
    return 'Can’t reach the routing engine for the surfaces. Start it with “pnpm routing:start”.';
  return 'Surfaces unknown: the track couldn’t be matched to the roads.';
}

/**
 * Finds the roads an opened track runs along, for its surfaces (ADR 0012), in the background: a long ride takes the
 * engine some seconds. Not while a section is being rerouted, as that changes the track; a track changed before
 * its roads arrive is matched again.
 */
export function useTrackRoads(engine: RoutingEngine = defaultEngine) {
  const id = usePlanner((s) => s.track?.id);
  const coordinates = usePlanner((s) => s.track?.coordinates);
  const needed = usePlanner(
    (s) => s.track !== undefined && !s.track.roads && !s.track.roadsError && !s.track.rerouting,
  );

  useEffect(() => {
    if (!needed || id === undefined || !coordinates) return;
    const controller = new AbortController();
    engine.match(coordinates, controller.signal).then(
      (matched) =>
        usePlanner
          .getState()
          .setTrackRoads(id, coordinates, { roads: trackAttributes(coordinates, matched) }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        usePlanner.getState().setTrackRoads(id, coordinates, { error: message(err) });
      },
    );
    return () => controller.abort();
  }, [engine, id, coordinates, needed]);
}
