// UI settings → per-request GraphHopper custom model (ADR 0002).
// LM constraint: every multiply_by must be within [0, 1]; the server-side profile is the most permissive variant,
// so settings only ever penalise. Expressions follow docs/spikes/2026-10-29-gravel.md.
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { avoidArea } from '../../flags/avoid';
import type { AvoidFlag, ProfileSettings } from '../../types';

export interface CustomModelStatement {
  if?: string;
  else_if?: string;
  multiply_by: string;
}

export interface CustomModel {
  /** Named areas for conditions: a feature with id `x` is tested as `in_x`. */
  areas?: FeatureCollection<Polygon | MultiPolygon>;
  priority?: CustomModelStatement[];
  speed?: CustomModelStatement[];
}

const PAVED =
  'surface == ASPHALT || surface == CONCRETE || surface == PAVED || surface == PAVING_STONES';
const UNPAVED =
  'surface == UNPAVED || surface == COMPACTED || surface == FINE_GRAVEL || surface == GRAVEL || ' +
  'surface == GROUND || surface == DIRT || surface == GRASS || surface == SAND || surface == WOOD';
const OFFROAD_CLASS = '(road_class == TRACK || road_class == PATH || road_class == BRIDLEWAY)';

// OSM surface tags are often missing. Untagged ordinary roads are almost always paved in Austria/Hungary, and so are
// grade1 tracks; untagged tracks/paths of other grades are most likely not. Penalising only *tagged* paved surfaces
// pushes routes onto untagged (paved) roads instead of gravel (gravel spike, finding 2).
export const LIKELY_PAVED =
  `${PAVED} || (surface == MISSING && !${OFFROAD_CLASS})` +
  ' || (surface == MISSING && road_class == TRACK && track_type == GRADE1)';
export const LIKELY_UNPAVED = `${UNPAVED} || (surface == MISSING && ${OFFROAD_CLASS} && track_type != GRADE1)`;

/** Strongest penalty the off-road slider applies at either end. */
const MIN_SURFACE_FACTOR = 0.3;
/** Cancels bike_priority's boost (up to 1.5×) for signed cycle routes on paved roads (gravel spike, finding 3). */
const CYCLE_NETWORK_CANCEL = 0.67;

export const OFFROAD_NEUTRAL = 50;

/**
 * Priority on a flagged stretch. Strong, not a block (0), so a route still exists when there's no way around: a
 * flagged edge then costs as much as one 100 times longer (ADR 0007).
 */
export const FLAG_FACTOR = '0.01';

const factor = (value: number) => String(Math.round(Math.min(1, Math.max(0, value)) * 100) / 100);

/** 1 at the neutral point, falling linearly to MIN_SURFACE_FACTOR at the end of the slider (0 or 100). */
function slope(distanceFromNeutral: number): number {
  return 1 - (distanceFromNeutral / OFFROAD_NEUTRAL) * (1 - MIN_SURFACE_FACTOR);
}

/** Each flag as an area, penalised only on the OSM ways it was drawn on, so crossing roads stay usable. */
function flagRules(
  flags: readonly AvoidFlag[],
): Pick<CustomModel, 'areas'> & { priority: CustomModelStatement[] } {
  const areaId = (i: number) => `flag_${i}`;
  return {
    areas: {
      type: 'FeatureCollection',
      features: flags.map((flag, i) => ({
        type: 'Feature',
        id: areaId(i),
        properties: {},
        geometry: avoidArea(flag),
      })),
    },
    priority: flags.map((flag, i) => {
      const ways = flag.osmWayIds?.map((id) => `osm_way_id == ${id}`).join(' || ');
      return {
        if: ways ? `in_${areaId(i)} && (${ways})` : `in_${areaId(i)}`,
        multiply_by: FLAG_FACTOR,
      };
    }),
  };
}

export function buildCustomModel(
  settings: ProfileSettings,
  flags: readonly AvoidFlag[] = [],
): CustomModel | undefined {
  const priority: CustomModelStatement[] = [];

  const offroad = settings.profile === 'road' ? undefined : settings.offroadPreference;
  if (offroad !== undefined) {
    const p = Math.min(100, Math.max(0, offroad));
    if (p > OFFROAD_NEUTRAL) {
      priority.push({ if: LIKELY_PAVED, multiply_by: factor(slope(p - OFFROAD_NEUTRAL)) });
      priority.push({
        if: `bike_network != MISSING && (${LIKELY_PAVED})`,
        multiply_by: factor(CYCLE_NETWORK_CANCEL),
      });
    } else if (p < OFFROAD_NEUTRAL) {
      priority.push({ if: LIKELY_UNPAVED, multiply_by: factor(slope(OFFROAD_NEUTRAL - p)) });
    }
  }

  if (settings.avoidMainRoads) {
    priority.push({ if: 'road_class == TRUNK || road_class == PRIMARY', multiply_by: '0.2' });
    priority.push({ if: 'road_class == SECONDARY', multiply_by: '0.5' });
  }

  if (flags.length) {
    const rules = flagRules(flags);
    return { areas: rules.areas, priority: [...priority, ...rules.priority] };
  }
  return priority.length ? { priority } : undefined;
}
