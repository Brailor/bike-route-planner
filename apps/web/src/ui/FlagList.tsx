import { useState } from 'react';
import { FLAG_REASONS, flagLengthM, type FlagReason } from '../flags/flag';
import { usePlanner } from '../state/store';
import type { AvoidFlag, LonLat } from '../types';
import { FlagDetailsFields } from './FlagDetailsFields';
import { formatDistance } from './format';

const flagCount = (n: number) => (n === 1 ? '1 flagged section' : `${n} flagged sections`);

const label = (flag: AvoidFlag) => (flag.reason ? FLAG_REASONS[flag.reason] : 'Flagged section');

/** Reason and note of one flag, or deleting it (asks once more first). */
function FlagEditor({ flag }: { flag: AvoidFlag }) {
  const { updateFlag, deleteFlag, editFlag } = usePlanner.getState();
  const [reason, setReason] = useState<FlagReason | ''>(flag.reason ?? '');
  const [note, setNote] = useState(flag.note ?? '');
  const [deleting, setDeleting] = useState(false);

  if (deleting)
    return (
      <div className="flag-editor">
        <p>Delete this flag? Routes will be free to use the section again.</p>
        <div className="flag-panel__actions">
          <button
            type="button"
            className="button button--danger"
            onClick={() => deleteFlag(flag.id)}
          >
            Delete
          </button>
          <button type="button" className="button" onClick={() => setDeleting(false)}>
            Keep
          </button>
        </div>
      </div>
    );

  return (
    <div className="flag-editor">
      <FlagDetailsFields reason={reason} note={note} onReason={setReason} onNote={setNote} />
      <div className="flag-panel__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => updateFlag(flag.id, { ...(reason && { reason }), note })}
        >
          Save
        </button>
        <button type="button" className="button" onClick={() => editFlag(undefined)}>
          Cancel
        </button>
        <button type="button" className="button button--danger" onClick={() => setDeleting(true)}>
          Delete…
        </button>
      </div>
    </div>
  );
}

/** Every flag, with show/hide for the map layer. Picking one shows it on the map and opens it for editing. */
export function FlagList() {
  const flags = usePlanner((s) => s.flags);
  const visible = usePlanner((s) => s.flagsVisible);
  const editingId = usePlanner((s) => s.editingFlagId);
  const { setFlagsVisible, editFlag, showOnMap } = usePlanner.getState();

  if (!flags.length) return null;

  function open(flag: AvoidFlag) {
    if (!visible) setFlagsVisible(true);
    editFlag(flag.id);
    showOnMap(flag.geometry.coordinates.map(([lon = 0, lat = 0]): LonLat => [lon, lat]));
  }

  return (
    <div className="flag-list">
      <div className="flag-list__header">
        <span data-testid="flag-count">{flagCount(flags.length)}</span>
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setFlagsVisible(e.target.checked)}
          />
          Show on map
        </label>
      </div>
      {!visible && <p className="status">Hidden flags still apply to every route.</p>}
      <ul className="flag-list__items">
        {flags.map((flag) => (
          <li key={flag.id} className="flag-list__item" aria-current={flag.id === editingId}>
            <button type="button" className="flag-list__open" onClick={() => open(flag)}>
              <span>
                {label(flag)} · {formatDistance(flagLengthM(flag))}
              </span>
              {flag.note && <span className="flag-list__note">{flag.note}</span>}
            </button>
            {flag.id === editingId && <FlagEditor flag={flag} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
