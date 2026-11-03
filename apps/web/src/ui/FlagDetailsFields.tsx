import { FLAG_REASONS, type FlagReason } from '../flags/flag';

const REASONS = Object.entries(FLAG_REASONS) as [FlagReason, string][];

interface Props {
  reason: FlagReason | '';
  note: string;
  onReason: (reason: FlagReason | '') => void;
  onNote: (note: string) => void;
}

/** A flag's optional reason and note, wherever they're entered: a new flag or an existing one. */
export function FlagDetailsFields({ reason, note, onReason, onNote }: Props) {
  return (
    <>
      <label className="field">
        <span className="field__label">Reason (optional)</span>
        <select value={reason} onChange={(e) => onReason(e.target.value as FlagReason | '')}>
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
        <input type="text" value={note} onChange={(e) => onNote(e.target.value)} />
      </label>
    </>
  );
}
