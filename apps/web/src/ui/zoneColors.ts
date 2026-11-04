import type { Zone } from '../workouts/workout';

/** Training zones, cool to hot, as most training apps colour them. */
export const ZONE_COLORS: Record<Zone, string> = {
  recovery: '#9aa5b1',
  endurance: '#3b82c4',
  tempo: '#2f9e5b',
  threshold: '#e0a10b',
  vo2: '#e0661b',
  anaerobic: '#c4322b',
};

/** Steps without a power target (free riding, heart-rate targets). */
export const NO_TARGET_COLOR = '#d9e2ec';

export const ZONE_LABELS: Record<Zone, string> = {
  recovery: 'Recovery',
  endurance: 'Endurance',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2: 'VO₂max',
  anaerobic: 'Anaerobic',
};
