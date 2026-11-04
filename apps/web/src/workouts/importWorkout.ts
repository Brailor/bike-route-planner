import { parseFitWorkout } from './fit';
import { WorkoutImportError, type ImportedWorkout } from './workout';
import { parseZwo } from './zwo';

/** Workout files are a few kB; anything this big is something else. */
const MAX_BYTES = 2_000_000;

/** A workout file the user picked: FIT (Garmin, Intervals.icu) or ZWO (MyWhoosh, Intervals.icu, Zwift). */
export async function importWorkout(file: File): Promise<ImportedWorkout> {
  if (file.size > MAX_BYTES) throw new WorkoutImportError('This file is too big to be a workout.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.replace(/\.(zwo|fit)$/i, '');
  // By content first: the ".FIT" signature is reliable; extensions get lost or changed in downloads.
  if (new TextDecoder().decode(bytes.subarray(8, 12)) === '.FIT')
    return parseFitWorkout(bytes, name);
  if (
    /\.zwo$/i.test(file.name) ||
    new TextDecoder().decode(bytes.subarray(0, 100)).trimStart().startsWith('<')
  )
    return parseZwo(new TextDecoder().decode(bytes), name);
  throw new WorkoutImportError('Choose a .zwo or .fit workout file.');
}

/** Shortest and longest ride accepted as a plain duration (s). */
export const DURATION_LIMITS = { min: 10 * 60, max: 12 * 3600 };

/** "1:30" (hours:minutes) or "90" (minutes) to seconds; undefined when it isn't one of those, or out of range. */
export function parseRideDuration(text: string): number | undefined {
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(text.trim());
  const minutes = /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
  const s = hm
    ? (Number(hm[1]) * 60 + Number(hm[2])) * 60
    : minutes !== undefined
      ? minutes * 60
      : undefined;
  return s !== undefined && s >= DURATION_LIMITS.min && s <= DURATION_LIMITS.max ? s : undefined;
}
