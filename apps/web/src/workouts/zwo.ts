// Zwift workout files (.zwo): what MyWhoosh imports, and what Intervals.icu and Zwift export. XML, with power as a
// fraction of FTP. Ramps (warm-up, cool-down) become their average power: enough for timing a ride.
import type { PowerTarget } from '../types';
import {
  WorkoutImportError,
  workoutFromSteps,
  type ImportedWorkout,
  type WorkoutStep,
} from './workout';

/** A step that can't be used; the rest of the workout still can. */
class StepError extends Error {}

/** Taken for all-out efforts (MaxEffort), which have no target. */
const MAX_EFFORT_PCT = 150;
/** Fractions of FTP above this are mistakes (or watts), not targets. */
const MAX_FRACTION = 5;

/** Attribute by name, ignoring case: files from other tools don't all match Zwift's capitalisation. */
function attr(el: Element, name: string): number | undefined {
  const found = [...el.attributes].find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (found === undefined) return undefined;
  const value = Number(found.value);
  return Number.isFinite(value) ? value : undefined;
}

function duration(el: Element, name = 'Duration'): number {
  const value = attr(el, name);
  if (value === undefined || value <= 0) throw new StepError(`no valid ${name}`);
  return value;
}

/** A fraction of FTP given directly, or as the middle of a low–high range. */
function power(el: Element, name: string, low: string, high: string): PowerTarget {
  const lo = attr(el, low);
  const hi = attr(el, high);
  const fraction =
    attr(el, name) ?? (lo !== undefined && hi !== undefined ? (lo + hi) / 2 : undefined);
  if (fraction === undefined || fraction < 0 || fraction > MAX_FRACTION)
    throw new StepError(`no valid ${name}`);
  return { pctFtp: Math.round(fraction * 1000) / 10 };
}

function stepsOf(el: Element): WorkoutStep[] {
  switch (el.localName.toLowerCase()) {
    case 'steadystate':
    case 'warmup':
    case 'cooldown':
    case 'ramp':
      return [{ durationS: duration(el), power: power(el, 'Power', 'PowerLow', 'PowerHigh') }];
    case 'intervalst': {
      const repeat = attr(el, 'Repeat') ?? 1;
      if (!Number.isInteger(repeat) || repeat < 1) throw new StepError('no valid Repeat');
      const on = {
        durationS: duration(el, 'OnDuration'),
        power: power(el, 'OnPower', 'PowerOnLow', 'PowerOnHigh'),
      };
      const off = {
        durationS: duration(el, 'OffDuration'),
        power: power(el, 'OffPower', 'PowerOffLow', 'PowerOffHigh'),
      };
      return Array.from({ length: repeat }, () => [on, off]).flat();
    }
    case 'freeride':
      return [{ durationS: duration(el) }];
    case 'maxeffort':
      return [{ durationS: duration(el), power: { pctFtp: MAX_EFFORT_PCT } }];
    default:
      throw new StepError('not a step type this app knows');
  }
}

export function parseZwo(xml: string, fallbackName: string): ImportedWorkout {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (doc.getElementsByTagName('parsererror').length > 0 || root.localName !== 'workout_file')
    throw new WorkoutImportError('This isn’t a Zwift workout (.zwo) file.');
  const child = (name: string) => [...root.children].find((c) => c.localName === name);
  const sport = child('sportType')?.textContent?.trim().toLowerCase();
  if (sport && sport !== 'bike')
    throw new WorkoutImportError(`This is a ${sport} workout, not a cycling one.`);
  const body = child('workout');
  if (!body) throw new WorkoutImportError('This .zwo file has no workout in it.');

  const steps: WorkoutStep[] = [];
  const warnings: string[] = [];
  [...body.children].forEach((el, i) => {
    try {
      steps.push(...stepsOf(el));
    } catch (err) {
      if (!(err instanceof StepError)) throw err;
      warnings.push(`Step ${i + 1} (${el.localName}) skipped: ${err.message}.`);
    }
  });
  if (steps.length === 0)
    throw new WorkoutImportError('This workout has no steps that can be used.');
  const name = child('name')?.textContent?.trim() || fallbackName;
  return { workout: workoutFromSteps(name, steps), warnings };
}
