import { useId, useState } from 'react';

interface Props {
  label: string;
  unit: string;
  /** Undefined shows the field empty, with the default as placeholder. */
  value: number | undefined;
  placeholder: number;
  min: number;
  max: number;
  /** Called with valid numbers only; undefined when the field is emptied. */
  onChange: (value: number | undefined) => void;
}

/** A number, or undefined when empty; invalid when it isn't a number in range. Takes a decimal comma too. */
function parse(text: string, min: number, max: number): { valid: boolean; value?: number } {
  if (text.trim() === '') return { valid: true };
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= min && value <= max
    ? { valid: true, value }
    : { valid: false };
}

const format = (value: number | undefined) => (value === undefined ? '' : String(value));

/**
 * A number input that keeps what's typed, so half-typed values ("7" on the way to "72.5") aren't rejected or
 * rewritten. Only valid numbers reach `onChange`; out-of-range ones are marked invalid. A text input, because a
 * number input reports half-typed values ("-", "72,") as empty, which would reset the field to its default.
 */
export function NumberField({ label, unit, value, placeholder, min, max, onChange }: Props) {
  const [text, setText] = useState(format(value));
  const [shown, setShown] = useState(value);
  const hintId = useId();
  // A value from elsewhere (e.g. loaded from storage) replaces the text, unless the text already says it.
  if (value !== shown) {
    setShown(value);
    if (parse(text, min, max).value !== value) setText(format(value));
  }
  const { valid } = parse(text, min, max);

  return (
    <label className="field">
      <span className="field__label">
        {label} ({unit})
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder={String(placeholder)}
        value={text}
        aria-invalid={!valid}
        aria-describedby={valid ? undefined : hintId}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parse(e.target.value, min, max);
          if (parsed.valid) onChange(parsed.value);
        }}
      />
      {!valid && (
        <span id={hintId} className="field__error">
          Between {min} and {max} {unit}
        </span>
      )}
    </label>
  );
}
