import { useEffect, useMemo, useState } from 'react';
import { usesFlag } from '../flags/avoid';
import type { FlagReason } from '../flags/flag';
import { selectionLengthM } from '../flags/selection';
import type { RouteResult } from '../routing/types';
import { usePlanner, type FlagDraft } from '../state/store';
import { FlagDetailsFields } from './FlagDetailsFields';
import { FlagList } from './FlagList';
import { formatDistance } from './format';

function draftHint(clicks: number) {
  return clicks === 0
    ? 'Click where the unrideable section starts.'
    : clicks === 1
      ? 'Now click where it ends.'
      : 'Drag either end to adjust.';
}

/** Where a draft stands: its length once traced, or why it isn't. */
function DraftStatus({ draft }: { draft: FlagDraft }) {
  if (draft.trace)
    return (
      <p>
        Selected: <strong data-testid="flag-length">{formatDistance(draft.trace.distanceM)}</strong>
      </p>
    );
  if (draft.error)
    return (
      <p className="status status--error" role="alert">
        {draft.error}
      </p>
    );
  if (draft.points.length >= 2) return <p className="status">Tracing…</p>;
  return null;
}

/** Flagging a stretch, on `route` (when there is one) or marked on the map, and the flags made so far. */
export function FlagPanel({ route }: { route: RouteResult | undefined }) {
  const selection = usePlanner((s) => s.flagSelection);
  const draft = usePlanner((s) => s.flagDraft);
  const flags = usePlanner((s) => s.flags);
  const {
    startFlagSelection,
    cancelFlagSelection,
    confirmFlag,
    startFlagDraft,
    cancelFlagDraft,
    confirmDraft,
  } = usePlanner.getState();
  const [reason, setReason] = useState<FlagReason | ''>('');
  const [note, setNote] = useState('');
  const onFlag = useMemo(() => (route ? usesFlag(route, flags) : false), [route, flags]);

  const marking = Boolean(draft || selection);
  useEffect(() => {
    if (!marking) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      cancelFlagSelection();
      cancelFlagDraft();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [marking, cancelFlagSelection, cancelFlagDraft]);

  function save(confirm: typeof confirmFlag) {
    confirm({ ...(reason && { reason }), note });
    setReason('');
    setNote('');
  }

  const details = (
    <FlagDetailsFields reason={reason} note={note} onReason={setReason} onNote={setNote} />
  );
  // Without a route there's nothing to reroute yet: the flag applies from the next route on.
  const confirmLabel = route ? 'Flag & reroute' : 'Save flag';

  if (draft)
    return (
      <section className="panel-section flag-panel" aria-label="Flags">
        <p className="status">{draftHint(draft.points.length)}</p>
        <DraftStatus draft={draft} />
        {details}
        <div className="flag-panel__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => save(confirmDraft)}
            disabled={!draft.trace}
          >
            {confirmLabel}
          </button>
          <button type="button" className="button" onClick={cancelFlagDraft} title="Cancel (Esc)">
            Cancel
          </button>
        </div>
      </section>
    );

  if (selection && route) {
    const lengthM = selectionLengthM(route.geometry.coordinates, selection);
    return (
      <section className="panel-section flag-panel" aria-label="Flags">
        <p className="status">
          Drag the two handles along the route to mark the unrideable stretch.
        </p>
        <p>
          Selected: <strong data-testid="flag-length">{formatDistance(lengthM)}</strong>
        </p>
        {details}
        <div className="flag-panel__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => save(confirmFlag)}
            disabled={lengthM === 0}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className="button"
            onClick={cancelFlagSelection}
            title="Cancel (Esc)"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-section flag-panel" aria-label="Flags">
      <div className="flag-panel__actions">
        {route && (
          <button type="button" className="button" onClick={startFlagSelection}>
            Flag a section
          </button>
        )}
        <button type="button" className="button" onClick={startFlagDraft}>
          Flag on map
        </button>
      </div>
      {onFlag && (
        <p className="status status--warning" role="alert">
          This route still uses a flagged section: there’s no way around it. Try moving a point.
        </p>
      )}
      <FlagList />
    </section>
  );
}
