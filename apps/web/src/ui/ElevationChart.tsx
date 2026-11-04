import { useMemo, type PointerEvent } from 'react';
import { segmentLengthsM } from '../geo';
import { elevationProfile, pointAtDistance } from '../route/elevation';
import { usePlanner } from '../state/store';
import { formatDistance, formatElevation } from './format';

const W = 320;
const H = 120;
const PAD = { top: 10, right: 6, bottom: 18, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** A shaded stretch of the chart, such as a workout interval: coordinate indices [from, to]. */
export interface ChartBand {
  from: number;
  to: number;
  color: string;
  label: string;
}

export function ElevationChart({
  coordinates,
  bands = [],
}: {
  coordinates: number[][];
  bands?: readonly ChartBand[];
}) {
  const hoverIndex = usePlanner((s) => s.hoverIndex);
  const setHoverIndex = usePlanner((s) => s.setHoverIndex);

  const chart = useMemo(() => {
    const profile = elevationProfile(coordinates);
    const last = profile.at(-1);
    if (!last || profile.length < 2) return undefined;
    const elevations = profile.map((p) => p.elevationM);
    const min = Math.min(...elevations);
    const max = Math.max(...elevations);
    // Keep at least 50 m of vertical range so flat routes don't look mountainous.
    const span = Math.max(50, max - min);
    const lo = min - (span - (max - min)) / 2;
    const x = (d: number) => PAD.left + (d / last.distanceM) * PLOT_W;
    const y = (e: number) => PAD.top + PLOT_H - ((e - lo) / span) * PLOT_H;
    const line = profile.map((p) => `${x(p.distanceM).toFixed(1)},${y(p.elevationM).toFixed(1)}`);
    const base = PAD.top + PLOT_H;
    const area = `M${x(0)},${base} L${line.join(' L')} L${x(last.distanceM)},${base} Z`;
    const along = [0];
    for (const l of segmentLengthsM(coordinates)) along.push((along.at(-1) ?? 0) + l);
    return {
      profile,
      along,
      min,
      max,
      total: last.distanceM,
      x,
      y,
      area,
      line: `M${line.join(' L')}`,
    };
  }, [coordinates]);

  if (!chart) return null;

  const hovered =
    hoverIndex === undefined ? undefined : chart.profile.find((p) => p.index === hoverIndex);

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!chart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const distance = ((svgX - PAD.left) / PLOT_W) * chart.total;
    setHoverIndex(pointAtDistance(chart.profile, distance)?.index);
  }

  return (
    <figure className="elevation">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Elevation profile, ${formatElevation(chart.min)} to ${formatElevation(chart.max)}`}
        data-testid="elevation-chart"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(undefined)}
      >
        {bands.map((band, i) => {
          const x0 = chart.x(chart.along[band.from] ?? 0);
          const x1 = chart.x(chart.along[band.to] ?? chart.total);
          return (
            <rect
              key={i}
              x={x0}
              width={Math.max(1, x1 - x0)}
              y={PAD.top}
              height={PLOT_H}
              fill={band.color}
              className="elevation__band"
              data-testid="elevation-band"
            >
              <title>{band.label}</title>
            </rect>
          );
        })}
        <path d={chart.area} className="elevation__area" />
        <path d={chart.line} className="elevation__line" />
        <text
          x={PAD.left - 4}
          y={chart.y(chart.max) + 4}
          className="elevation__label"
          textAnchor="end"
        >
          {Math.round(chart.max)}
        </text>
        <text
          x={PAD.left - 4}
          y={chart.y(chart.min) + 4}
          className="elevation__label"
          textAnchor="end"
        >
          {Math.round(chart.min)}
        </text>
        <text x={W - PAD.right} y={H - 4} className="elevation__label" textAnchor="end">
          {formatDistance(chart.total)}
        </text>
        {hovered && (
          <g className="elevation__hover">
            <line
              x1={chart.x(hovered.distanceM)}
              x2={chart.x(hovered.distanceM)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
            />
            <circle cx={chart.x(hovered.distanceM)} cy={chart.y(hovered.elevationM)} r={3} />
          </g>
        )}
      </svg>
      <figcaption className="elevation__caption">
        {hovered
          ? `${formatDistance(hovered.distanceM)} · ${formatElevation(hovered.elevationM)}`
          : 'Elevation (m)'}
      </figcaption>
    </figure>
  );
}
