import { SURFACE_CATEGORIES, type SurfaceBreakdown } from '../route/surface';
import { formatPercent } from './format';
import { SURFACE_COLORS, SURFACE_LABELS } from './surfaceColors';

export function SurfaceBar({ breakdown }: { breakdown: SurfaceBreakdown }) {
  const total = SURFACE_CATEGORIES.reduce((sum, c) => sum + breakdown[c].meters, 0) || 1;
  const present = SURFACE_CATEGORIES.filter((c) => breakdown[c].meters > 0);
  const inferred = SURFACE_CATEGORIES.reduce((sum, c) => sum + breakdown[c].inferredMeters, 0);

  return (
    <div className="surface" aria-label="Surface breakdown">
      <div className="surface__bar">
        {present.map((c) => (
          <span
            key={c}
            style={{ flexGrow: breakdown[c].meters, background: SURFACE_COLORS[c] }}
            title={`${SURFACE_LABELS[c]} ${formatPercent(breakdown[c].meters / total)}`}
          />
        ))}
      </div>
      <ul className="surface__legend">
        {present.map((c) => (
          <li key={c} data-testid={`surface-${c}`}>
            <span className="swatch" style={{ background: SURFACE_COLORS[c] }} />
            {SURFACE_LABELS[c]} {formatPercent(breakdown[c].meters / total)}
          </li>
        ))}
      </ul>
      {inferred > 0 && (
        <p className="hint">
          {formatPercent(inferred / total)} has no surface tag in OpenStreetMap and is estimated
          from the road type (dashed on the map).
        </p>
      )}
    </div>
  );
}
