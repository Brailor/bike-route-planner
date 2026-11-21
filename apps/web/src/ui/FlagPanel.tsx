import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usesFlag } from '../flags/avoid';
import type { FlagDetails, FlagReason } from '../flags/flag';
import { selectionLengthM, type FlagSelection } from '../flags/selection';
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

/** A stretch being marked: what's wrong with it, then save or cancel (Esc cancels too). */
function FlagForm({
  status,
  confirmLabel,
  canSave,
  onSave,
  onCancel,
}: {
  status: ReactNode;
  confirmLabel: string;
  canSave: boolean;
  onSave: (details: FlagDetails) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<FlagReason | ''>('');
  const [note, setNote] = useState('');
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);
  return (
    <section className="panel-section flag-panel" aria-label="Flags">
      {status}
      <FlagDetailsFields reason={reason} note={note} onReason={setReason} onNote={setNote} />
      <div className="flag-panel__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => onSave({ ...(reason && { reason }), note })}
          disabled={!canSave}
        >
          {confirmLabel}
        </button>
        <button type="button" className="button" onClick={onCancel} title="Cancel (Esc)">
          Cancel
        </button>
      </div>
    </section>
  );
}

/** The stretch between the two handles on `coordinates` (a route's, or an opened track's), to flag. */
export function SelectionForm({
  coordinates,
  selection,
  along,
  confirmLabel,
}: {
  coordinates: readonly (readonly number[])[];
  selection: FlagSelection;
  along: 'route' | 'track';
  confirmLabel: string;
}) {
  const { confirmFlag, cancelFlagSelection } = usePlanner.getState();
  const lengthM = selectionLengthM(coordinates, selection);
  return (
    <FlagForm
      status={
        <>
          <p className="status">
            Drag the two handles along the {along} to mark the unrideable stretch.
          </p>
          <p>
            Selected: <strong data-testid="flag-length">{formatDistance(lengthM)}</strong>
          </p>
        </>
      }
      confirmLabel={confirmLabel}
      canSave={lengthM > 0}
      onSave={confirmFlag}
      onCancel={cancelFlagSelection}
    />
  );
}

/** Flagging a stretch, on `route` (when there is one) or marked on the map, and the flags made so far. */
export function FlagPanel({ route }: { route: RouteResult | undefined }) {
  const selection = usePlanner((s) => s.flagSelection);
  const draft = usePlanner((s) => s.flagDraft);
  const flags = usePlanner((s) => s.flags);
  const { startFlagSelection, startFlagDraft, cancelFlagDraft, confirmDraft } =
    usePlanner.getState();
  const onFlag = useMemo(() => (route ? usesFlag(route, flags) : false), [route, flags]);
  // Without a route there's nothing to reroute yet: the flag applies from the next route on.
  const confirmLabel = route ? 'Flag & reroute' : 'Save flag';

  if (draft)
    return (
      <FlagForm
        status={
          <>
            <p className="status">{draftHint(draft.points.length)}</p>
            <DraftStatus draft={draft} />
          </>
        }
        confirmLabel={confirmLabel}
        canSave={Boolean(draft.trace)}
        onSave={confirmDraft}
        onCancel={cancelFlagDraft}
      />
    );

  if (selection && route)
    return (
      <SelectionForm
        coordinates={route.geometry.coordinates}
        selection={selection}
        along="route"
        confirmLabel={confirmLabel}
      />
    );

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
