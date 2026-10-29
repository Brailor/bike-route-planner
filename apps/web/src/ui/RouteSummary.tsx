import { useMemo } from 'react';
import { gpxFileName, toGpx } from '../gpx/exportGpx';
import { PROFILE_LABELS } from '../profiles/defaults';
import { surfaceBreakdown } from '../route/surface';
import type { RouteResult } from '../routing/types';
import { usePlanner } from '../state/store';
import { ElevationChart } from './ElevationChart';
import { formatDistance, formatDuration, formatElevation } from './format';
import { SurfaceBar } from './SurfaceBar';

function download(fileName: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/gpx+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function RouteSummary({ route }: { route: RouteResult }) {
  const profile = usePlanner((s) => s.profile);
  const breakdown = useMemo(() => surfaceBreakdown(route), [route]);

  function exportGpx() {
    const name = `${PROFILE_LABELS[profile]} route ${formatDistance(route.distanceM)}`;
    download(gpxFileName(name), toGpx({ name, coordinates: route.geometry.coordinates }));
  }

  return (
    <section className="panel-section" aria-label="Route">
      <dl className="stats">
        <div>
          <dt>Distance</dt>
          <dd data-testid="stat-distance">{formatDistance(route.distanceM)}</dd>
        </div>
        <div>
          <dt>Ascent</dt>
          <dd data-testid="stat-ascent">{formatElevation(route.ascentM)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd data-testid="stat-time">{formatDuration(route.durationS)}</dd>
        </div>
      </dl>
      <SurfaceBar breakdown={breakdown} />
      <ElevationChart coordinates={route.geometry.coordinates} />
      <button type="button" className="button button--primary" onClick={exportGpx}>
        Export GPX
      </button>
    </section>
  );
}
