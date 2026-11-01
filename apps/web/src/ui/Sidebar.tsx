import { usePlanner, type RouteStatus } from '../state/store';
import { FlagPanel } from './FlagPanel';
import { ProfilePanel } from './ProfilePanel';
import { RouteSummary } from './RouteSummary';

function StatusMessage({ status, waypointCount }: { status: RouteStatus; waypointCount: number }) {
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
  if (waypointCount === 0) return <p className="status">Click the map to set a start point.</p>;
  if (waypointCount === 1) return <p className="status">Click again to set the destination.</p>;
  return null;
}

export function Sidebar() {
  const waypoints = usePlanner((s) => s.waypoints);
  const route = usePlanner((s) => s.route);
  const status = usePlanner((s) => s.status);
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
      <ProfilePanel />
      <StatusMessage status={status} waypointCount={waypoints.length} />
      {route && waypoints.length >= 2 && (
        <>
          <RouteSummary route={route} />
          <FlagPanel route={route} />
        </>
      )}
    </aside>
  );
}
