import { useEffect, useRef, useState } from 'react';
import type { LonLat } from '../types';

/**
 * A map button that finds the user and hands their position to `onLocated`. Says so when the browser can't tell
 * (denied, no fix in time); that note goes on the next click, a click away or Escape.
 */
export function LocateButton({
  locate,
  onLocated,
}: {
  locate: () => Promise<LonLat | undefined>;
  onLocated: (position: LonLat) => void;
}) {
  const [state, setState] = useState<'idle' | 'locating' | 'failed'>('idle');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state !== 'failed') return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setState('idle');
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState('idle');
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [state]);

  async function go() {
    setState('locating');
    const position = await locate();
    setState(position ? 'idle' : 'failed');
    if (position) onLocated(position);
  }

  return (
    <div className="locate" ref={root}>
      <button
        type="button"
        className="map-button"
        aria-label="Go to my location"
        title="Go to my location"
        aria-busy={state === 'locating'}
        disabled={state === 'locating'}
        onClick={() => void go()}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="10" cy="10" r="2.2" fill="currentColor" />
          <path
            d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {state === 'failed' && (
        <p className="locate__note" role="alert">
          Couldn’t find your location. Check that this site may use it.
        </p>
      )}
    </div>
  );
}
