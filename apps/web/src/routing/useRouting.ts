import { useEffect } from 'react';
import { selectSettings, usePlanner } from '../state/store';
import { GraphHopperEngine } from './graphhopper/GraphHopperEngine';
import { RoutingError, type RoutingEngine } from './types';

const defaultEngine = new GraphHopperEngine();

/** Short enough to feel live while dragging a slider, long enough not to fire a request per pixel. */
const DEBOUNCE_MS = 250;

/** Re-routes whenever waypoints or profile settings change; stale requests are aborted. */
export function useRouting(engine: RoutingEngine = defaultEngine) {
  const waypoints = usePlanner((s) => s.waypoints);
  const settings = usePlanner(selectSettings);
  // Every flag applies to every route, so saving one reroutes the current route around it.
  const flags = usePlanner((s) => s.flags);
  const { setRoute, setRouteLoading, setRouteError } = usePlanner.getState();

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute(undefined);
      return;
    }
    const controller = new AbortController();
    setRouteLoading();
    const timer = setTimeout(() => {
      engine
        .route({ waypoints, settings, flags }, controller.signal)
        .then(setRoute, (err: unknown) => {
          if (controller.signal.aborted) return;
          setRouteError(
            err instanceof RoutingError ? err : new RoutingError(String(err), 'unavailable'),
          );
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [engine, waypoints, settings, flags, setRoute, setRouteLoading, setRouteError]);
}
