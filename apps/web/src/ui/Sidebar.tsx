import { usePlanner, type RouteStatus } from '../state/store';
import { FlagPanel } from './FlagPanel';
import { LoopPanel } from './LoopPanel';
import { ProfilePanel } from './ProfilePanel';
import { RiderPanel } from './RiderPanel';
import { RouteEnds } from './RouteEnds';
import { RouteSummary } from './RouteSummary';
import { WorkoutPanel } from './WorkoutPanel';

function StatusMessage({
  status,
  waypointCount,
  marking,
}: {
  status: RouteStatus;
  waypointCount: number;
  /** Map clicks don't place waypoints right now (marking a flag, or loops on show): their hints would mislead. */
  marking: boolean;
}) {
  if (status.state === 'error') {
    const text =
      status.kind === 'unavailable'
        ? 'Can’t reach the routing engine. Start it with “pnpm routing:start”.'
        : status.kind === 'no_route'
          ? 'No route between these points. Try moving a point onto a road or path.'
          : `Routing failed: ${status.message}`;
    return (
      <p className="status status--error" role="alert">
        {text}
      </p>
    );
  }
  if (status.state === 'loading')
    return (
      <p className="status" role="status">
        Routing…
      </p>
    );
  if (marking) return null;
  if (waypointCount === 0) return <p className="status">Click the map to set a start point.</p>;
  if (waypointCount === 1) return <p className="status">Click again to set the destination.</p>;
  return null;
}

export function Sidebar() {
  const waypoints = usePlanner((s) => s.waypoints);
  const route = usePlanner((s) => s.route);
  const status = usePlanner((s) => s.status);
  const marking = usePlanner((s) => s.flagDraft !== undefined);
  const loops = usePlanner((s) => s.loops);
  const clearWaypoints = usePlanner((s) => s.clearWaypoints);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);

  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <h1>Route planner</h1>
        <div className="sidebar__actions">
          <button
            type="button"
            className="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z / ⌘Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z / ⌘⇧Z / Ctrl+Y)"
          >
            Redo
          </button>
          {waypoints.length > 0 && (
            <button type="button" className="button" onClick={clearWaypoints}>
              Clear
            </button>
          )}
        </div>
      </header>
      <RouteEnds />
      <ProfilePanel />
      <RiderPanel />
      <WorkoutPanel />
      <StatusMessage
        status={status}
        waypointCount={waypoints.length}
        marking={marking || loops !== undefined}
      />
      {loops ? (
        // Loops take the route's place until closed.
        <LoopPanel loops={loops} />
      ) : (
        <>
          {route && waypoints.length >= 2 && <RouteSummary route={route} />}
          <FlagPanel route={waypoints.length >= 2 ? route : undefined} />
        </>
      )}
    </aside>
  );
}
