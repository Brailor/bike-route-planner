import { useEffect, useId, useRef, useState } from 'react';
import type { Background } from '../map/layers';
import type { MapBackground } from '../types';

/** A map button that opens the choice of background, and the hillshade overlay. Closes on Escape or a click away. */
export function LayerSwitcher({
  offered,
  background,
  hillshade,
  onBackground,
  onHillshade,
}: {
  offered: readonly Background[];
  background: MapBackground;
  hillshade: boolean;
  onBackground: (id: MapBackground) => void;
  onHillshade: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="layers" ref={root}>
      <button
        type="button"
        className="layers__toggle"
        aria-label="Map layers"
        title="Map layers"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M10 3 2 7.5l8 4.5 8-4.5z" fill="currentColor" />
          <path
            d="m3.5 11 6.5 3.7 6.5-3.7M3.5 14 10 17.7l6.5-3.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="layers__panel" id={panelId}>
          <fieldset className="layers__group">
            <legend>Background</legend>
            {offered.map((b) => (
              <label key={b.id} className="field field--inline">
                <input
                  type="radio"
                  name={`${panelId}-background`}
                  checked={b.id === background}
                  onChange={() => onBackground(b.id)}
                />
                {b.label}
              </label>
            ))}
          </fieldset>
          <label className="field field--inline">
            <input
              type="checkbox"
              checked={hillshade}
              onChange={(e) => onHillshade(e.target.checked)}
            />
            Hillshade
          </label>
        </div>
      )}
    </div>
  );
}
