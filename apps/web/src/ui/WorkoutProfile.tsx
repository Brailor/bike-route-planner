import type { Workout } from '../types';
import { pctFtp, zoneOf } from '../workouts/workout';
import { formatDuration } from './format';
import { NO_TARGET_COLOR, ZONE_COLORS, ZONE_LABELS } from './zoneColors';

const HEIGHT = 100;
/** The chart's top is at least this (% FTP), so easy workouts don't look like sprints. */
const MIN_TOP_PCT = 130;

const stepDuration = (s: number) => (s < 120 ? `${Math.round(s)} s` : formatDuration(s));

interface Props {
  workout: Workout;
  ftpW: number;
  /** Steps without a target are drawn at the rider's ride power. */
  ridePowerPct: number;
}

/** Bars over time, as tall as each step's power and coloured by zone. */
export function WorkoutProfile({ workout, ftpW, ridePowerPct }: Props) {
  const bars = workout.intervals.map((interval) => ({
    ...interval,
    pct: interval.power && pctFtp(interval.power, ftpW),
  }));
  const top = Math.max(MIN_TOP_PCT, ...bars.map((b) => b.pct ?? 0));

  return (
    <svg
      className="workout-profile"
      viewBox={`0 0 ${workout.totalDurationS} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Workout power profile"
      data-testid="workout-profile"
    >
      {bars.map((bar, i) => {
        const zone = bar.pct === undefined ? undefined : zoneOf(bar.pct);
        const height = ((bar.pct ?? ridePowerPct) / top) * HEIGHT;
        const target =
          bar.pct === undefined
            ? 'no power target'
            : `${Math.round(bar.pct)}% FTP${zone ? `, ${ZONE_LABELS[zone]}` : ''}`;
        return (
          <rect
            key={i}
            x={bar.startS}
            width={bar.durationS}
            y={HEIGHT - height}
            height={height}
            fill={zone ? ZONE_COLORS[zone] : NO_TARGET_COLOR}
            data-zone={zone ?? 'none'}
          >
            <title>{`${bar.name ? `${bar.name}: ` : ''}${stepDuration(bar.durationS)}, ${target}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
