import { useMemo } from 'react';
import { downloadGpx } from '../gpx/download';
import { PROFILE_LABELS } from '../profiles/defaults';
import { surfaceBreakdown } from '../route/surface';
import type { RouteResult } from '../routing/types';
import { predictRide } from '../speed/model';
import { riderFrom } from '../speed/rider';
import { usePlanner } from '../state/store';
import { ElevationChart } from './ElevationChart';
import { formatDistance, formatDuration, formatElevation } from './format';
import { SurfaceBar } from './SurfaceBar';

export function RouteSummary({ route }: { route: RouteResult }) {
  const profile = usePlanner((s) => s.profile);
  const userSettings = usePlanner((s) => s.userSettings);
  const breakdown = useMemo(() => surfaceBreakdown(route), [route]);
  const rider = useMemo(() => riderFrom(userSettings), [userSettings]);
  // The speed model's time, not the engine's: it knows the rider's power and weight (README M3).
  const ride = useMemo(() => predictRide(route, profile, rider), [route, profile, rider]);

  function exportGpx() {
    const name = `${PROFILE_LABELS[profile]} route ${formatDistance(route.distanceM)}`;
    downloadGpx(name, route.geometry.coordinates);
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
          <dd data-testid="stat-time" title={`At a steady ${Math.round(rider.powerW)} W`}>
            {formatDuration(ride.durationS)}
          </dd>
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
