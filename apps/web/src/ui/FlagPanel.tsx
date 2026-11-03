import { useEffect, useMemo, useState } from 'react';
import { usesFlag } from '../flags/avoid';
import { FLAG_REASONS, type FlagReason } from '../flags/flag';
import { selectionLengthM } from '../flags/selection';
import type { RouteResult } from '../routing/types';
import { usePlanner } from '../state/store';
import { formatDistance } from './format';

const REASONS = Object.entries(FLAG_REASONS) as [FlagReason, string][];

const flagCount = (n: number) => (n === 1 ? '1 flagged section' : `${n} flagged sections`);

/** Flagging a stretch of `route` (when there is one), and how many flags exist. */
export function FlagPanel({ route }: { route: RouteResult | undefined }) {
  const selection = usePlanner((s) => s.flagSelection);
  const flags = usePlanner((s) => s.flags);
  const count = flags.length;
  const start = usePlanner((s) => s.startFlagSelection);
  const cancel = usePlanner((s) => s.cancelFlagSelection);
  const confirm = usePlanner((s) => s.confirmFlag);
  const [reason, setReason] = useState<FlagReason | ''>('');
  const [note, setNote] = useState('');
  const onFlag = useMemo(() => (route ? usesFlag(route, flags) : false), [route, flags]);

  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, cancel]);

  if (!selection || !route)
    return (
      <section className="panel-section flag-panel" aria-label="Flags">
        {route && (
          <button type="button" className="button" onClick={start}>
            Flag a section
          </button>
        )}
        {onFlag && (
          <p className="status status--warning" role="alert">
            This route still uses a flagged section: there’s no way around it. Try moving a point.
          </p>
        )}
        {count > 0 && <p data-testid="flag-count">{flagCount(count)}</p>}
      </section>
    );

  const lengthM = selectionLengthM(route.geometry.coordinates, selection);

  function save() {
    confirm({ ...(reason && { reason }), note });
    setReason('');
    setNote('');
  }

  return (
    <section className="panel-section flag-panel" aria-label="Flags">
      <p className="status">Drag the two handles along the route to mark the unrideable stretch.</p>
      <p>
        Selected: <strong data-testid="flag-length">{formatDistance(lengthM)}</strong>
      </p>
      <label className="field">
        <span className="field__label">Reason (optional)</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as FlagReason | '')}>
          <option value="">No reason</option>
          {REASONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Note (optional)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flag-panel__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={save}
          disabled={lengthM === 0}
        >
          Flag & reroute
        </button>
        <button type="button" className="button" onClick={cancel} title="Cancel (Esc)">
          Cancel
        </button>
      </div>
    </section>
  );
}
