import { useEffect } from 'react';
import { selectionLengthM } from '../flags/selection';
import type { RouteResult } from '../routing/types';
import { usePlanner } from '../state/store';
import { formatDistance } from './format';

export function FlagPanel({ route }: { route: RouteResult }) {
  const selection = usePlanner((s) => s.flagSelection);
  const start = usePlanner((s) => s.startFlagSelection);
  const cancel = usePlanner((s) => s.cancelFlagSelection);

  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, cancel]);

  if (!selection)
    return (
      <section className="panel-section" aria-label="Flags">
        <button type="button" className="button" onClick={start}>
          Flag a section
        </button>
      </section>
    );

  return (
    <section className="panel-section flag-panel" aria-label="Flags">
      <p className="status">Drag the two handles along the route to mark the unrideable stretch.</p>
      <p>
        Selected:{' '}
        <strong data-testid="flag-length">
          {formatDistance(selectionLengthM(route.geometry.coordinates, selection))}
        </strong>
      </p>
      <button type="button" className="button" onClick={cancel} title="Cancel (Esc)">
        Cancel
      </button>
    </section>
  );
}
