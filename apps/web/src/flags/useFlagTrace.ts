import { useEffect } from 'react';
import { GraphHopperEngine } from '../routing/graphhopper/GraphHopperEngine';
import { RoutingError, type RoutingEngine } from '../routing/types';
import { usePlanner } from '../state/store';

const defaultEngine = new GraphHopperEngine();

const message = (err: unknown) =>
  err instanceof RoutingError && err.kind === 'no_route'
    ? 'No road or path connects these points. Try clicking closer to one.'
    : err instanceof RoutingError && err.kind === 'unavailable'
      ? 'Can’t reach the routing engine to trace the section.'
      : 'Couldn’t trace the section.';

/** Traces the flag being marked on the map whenever its points change; stale requests are aborted. */
export function useFlagTrace(engine: RoutingEngine = defaultEngine) {
  const points = usePlanner((s) => s.flagDraft?.points);
  const { setDraftTrace, setDraftError } = usePlanner.getState();

  useEffect(() => {
    if (!points || points.length < 2) return;
    // Points change on a click or at the end of a drag, never in bursts, so there's nothing to debounce.
    const controller = new AbortController();
    engine.trace(points, controller.signal).then(
      (trace) => setDraftTrace(points, trace),
      (err: unknown) => {
        if (!controller.signal.aborted) setDraftError(points, message(err));
      },
    );
    return () => controller.abort();
  }, [engine, points, setDraftTrace, setDraftError]);
}
