import { useState, type FormEvent } from 'react';
import { usePlanner } from '../state/store';
import type { SavedRoute, TrackElevation } from '../types';
import { formatDistance } from './format';

/** As the server allows (services/api/src/routes.ts). */
const MAX_NAME_CHARS = 200;

/** Saves the line on show (a route, a loop, an opened track) under a name, starting from `name`. */
export function SaveRouteButton({
  name,
  coordinates,
  elevation,
  disabled,
}: {
  name: string;
  coordinates: number[][];
  elevation: TrackElevation;
  disabled?: boolean;
}) {
  const [naming, setNaming] = useState<string>();
  const [saved, setSaved] = useState(false);

  function save(event: FormEvent) {
    event.preventDefault();
    if (!naming?.trim()) return;
    usePlanner.getState().saveRoute(naming.trim(), coordinates, elevation);
    setNaming(undefined);
    setSaved(true);
  }

  if (naming !== undefined)
    return (
      <form className="save-route" onSubmit={save}>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            value={naming}
            maxLength={MAX_NAME_CHARS}
            required
            autoFocus
            onChange={(e) => setNaming(e.target.value)}
          />
        </label>
        <div className="flag-panel__actions">
          <button type="submit" className="button button--primary">
            Save
          </button>
          <button type="button" className="button" onClick={() => setNaming(undefined)}>
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <>
      <button
        type="button"
        className="button"
        disabled={disabled}
        onClick={() => {
          setSaved(false);
          setNaming(name);
        }}
      >
        Save route
      </button>
      {saved && (
        <p className="status" role="status">
          Saved to your routes.
        </p>
      )}
    </>
  );
}

function SavedRouteItem({ route }: { route: SavedRoute }) {
  const { openSavedRoute, deleteSavedRoute } = usePlanner.getState();
  const [deleting, setDeleting] = useState(false);
  return (
    <li className="flag-list__item saved-routes__item">
      <div className="saved-routes__row">
        <button
          type="button"
          className="flag-list__open"
          title="Open as a track"
          onClick={() => openSavedRoute(route.id)}
        >
          {route.name} · {formatDistance(route.distanceM)}
        </button>
        {!deleting && (
          <button
            type="button"
            className="button"
            aria-label={`Delete ${route.name}`}
            onClick={() => setDeleting(true)}
          >
            Delete…
          </button>
        )}
      </div>
      {deleting && (
        <div className="flag-editor">
          <p>Delete “{route.name}”?</p>
          <div className="flag-panel__actions">
            <button
              type="button"
              className="button button--danger"
              onClick={() => deleteSavedRoute(route.id)}
            >
              Delete
            </button>
            <button type="button" className="button" onClick={() => setDeleting(false)}>
              Keep
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** The user's saved routes, newest first; one opens as a track (ADR 0016). */
export function SavedRouteList() {
  const routes = usePlanner((s) => s.savedRoutes);
  if (!routes.length) return null;
  return (
    <section className="panel-section" aria-label="Saved routes">
      <strong>Saved routes</strong>
      <ul className="flag-list__items">
        {routes.toReversed().map((route) => (
          <SavedRouteItem key={route.id} route={route} />
        ))}
      </ul>
    </section>
  );
}
