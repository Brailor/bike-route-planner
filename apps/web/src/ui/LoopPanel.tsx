import { useMemo } from 'react';
import { downloadGpx } from '../gpx/download';
import { loopHighlights } from '../loops/explain';
import { findStops } from '../loops/features';
import { placeHardIntervals } from '../loops/placement';
import { surfaceBreakdown } from '../route/surface';
import { riderValue } from '../speed/rider';
import { usePlanner, type LoopSearch, type RankedLoop } from '../state/store';
import { ElevationChart, type ChartBand } from './ElevationChart';
import { formatDistance, formatDuration, formatElevation } from './format';
import { SurfaceBar } from './SurfaceBar';
import { ZONE_COLORS, ZONE_LABELS } from './zoneColors';

const percentOff = (actualS: number, targetS: number) => {
  const off = Math.round((actualS / targetS - 1) * 100);
  return off === 0 ? 'on time' : `${off > 0 ? '+' : '−'}${Math.abs(off)}%`;
};

function LoopCard({
  ranked,
  index,
  selected,
  targetS,
}: {
  ranked: RankedLoop;
  index: number;
  selected: boolean;
  targetS: number;
}) {
  const { loop, score } = ranked;
  const stops = useMemo(() => findStops(loop.route).length, [loop.route]);
  const { good, bad } = loopHighlights(score);
  return (
    <button
      type="button"
      className="loop-card"
      aria-pressed={selected}
      data-testid="loop-card"
      onClick={() => usePlanner.getState().selectLoop(index)}
    >
      <span className="loop-card__title">
        Loop {index + 1}
        <span className="loop-card__match">{Math.round(score.total * 100)}% match</span>
      </span>
      <span className="loop-card__stats">
        {formatDistance(loop.route.distanceM)} · {formatDuration(loop.ride.durationS)} (
        {percentOff(loop.ride.durationS, targetS)}) · {formatElevation(loop.route.ascentM)} up ·{' '}
        {stops} {stops === 1 ? 'stop' : 'stops'}
      </span>
      {(good.length > 0 || bad.length > 0) && (
        <ul className="loop-card__notes">
          {good.map((note) => (
            <li key={note} className="loop-card__good">
              {note}
            </li>
          ))}
          {bad.map((note) => (
            <li key={note} className="loop-card__bad">
              {note}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

function SelectedLoop({ loops }: { loops: LoopSearch }) {
  const ftpW = usePlanner((s) => riderValue(s.userSettings, 'ftpW'));
  const ranked = loops.results[loops.selected];
  const { workout } = loops.request;
  const bands = useMemo<ChartBand[]>(
    () =>
      ranked
        ? placeHardIntervals(workout, ranked.loop.ride, ftpW).map((p) => ({
            from: p.from,
            to: p.to,
            color: ZONE_COLORS[p.zone],
            label: `${p.name ? `${p.name}: ` : ''}${Math.round(p.pct)}% FTP, ${ZONE_LABELS[p.zone]}`,
          }))
        : [],
    [ranked, workout, ftpW],
  );
  const breakdown = useMemo(() => ranked && surfaceBreakdown(ranked.loop.route), [ranked]);
  if (!ranked || !breakdown) return null;
  const { route } = ranked.loop;
  const name = `${workout.name} loop ${formatDistance(route.distanceM)}`;
  return (
    <div className="loops__selected">
      <SurfaceBar breakdown={breakdown} />
      <ElevationChart coordinates={route.geometry.coordinates} bands={bands} />
      {bands.length > 0 && (
        <p className="hint">
          The workout’s hard intervals, where they fall on this loop: shaded on the chart, outlined
          on the map.
        </p>
      )}
      <button
        type="button"
        className="button button--primary"
        onClick={() => downloadGpx(name, route.geometry.coordinates)}
      >
        Export GPX
      </button>
    </div>
  );
}

/** The best loops for the workout (README M3: top 3), in place of the route while open. */
export function LoopPanel({ loops }: { loops: LoopSearch }) {
  const { closeLoops } = usePlanner.getState();
  const targetS = loops.request.workout.totalDurationS;
  return (
    <section className="panel-section loops" aria-label="Loops">
      <div className="loops__head">
        <strong>Loops for {loops.request.workout.name}</strong>
        <button type="button" className="button" onClick={closeLoops}>
          Close
        </button>
      </div>
      {loops.status === 'searching' && (
        <p className="status" role="status">
          Finding loops…
        </p>
      )}
      {loops.status === 'error' && (
        <p className="status status--error" role="alert">
          {loops.error}
        </p>
      )}
      {loops.status === 'ready' && (
        <>
          <ol className="loops__list">
            {loops.results.map((ranked, i) => (
              <li key={i}>
                <LoopCard
                  ranked={ranked}
                  index={i}
                  selected={i === loops.selected}
                  targetS={targetS}
                />
              </li>
            ))}
          </ol>
          <SelectedLoop loops={loops} />
        </>
      )}
    </section>
  );
}
