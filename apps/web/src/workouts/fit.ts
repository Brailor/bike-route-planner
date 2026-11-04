// Garmin FIT workout files: what Garmin devices, Garmin Connect and Intervals.icu export. A small reader of our own for
// the few messages a workout needs (ADR 0008): Garmin's SDK may not be passed on, which shipping it in a web app does.
// Garmin's SDK is a dev dependency only, to write real files for the tests.
import type { PowerTarget } from '../types';
import {
  WorkoutImportError,
  workoutFromSteps,
  type ImportedWorkout,
  type WorkoutStep,
} from './workout';

// --- Container: header, definition and data messages, CRC (FIT protocol) ---

/** Field values by field number; invalid ("not set") values are left out. */
export interface FitMessage {
  global: number;
  fields: Map<number, number | string>;
}

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}

interface Definition {
  global: number;
  littleEndian: boolean;
  fields: FieldDef[];
  /** Developer fields aren't needed; their bytes are skipped. */
  devBytes: number;
}

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401,
  0x5000, 0x9c01, 0x8801, 0x4400,
];

export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0;
  const nibble = (value: number) => {
    const tmp = CRC_TABLE[crc & 0xf] ?? 0;
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ (CRC_TABLE[value & 0xf] ?? 0);
  };
  for (let i = start; i < end; i++) {
    const byte = bytes[i] ?? 0;
    nibble(byte);
    nibble(byte >> 4);
  }
  return crc;
}

const NOT_FIT = 'This isn’t a FIT file.';
const DAMAGED = 'This FIT file is damaged or incomplete.';

/** Reads one field value; undefined for the base type's "invalid" value, and for types a workout doesn't use. */
function readValue(view: DataView, pos: number, field: FieldDef, le: boolean) {
  const type = field.baseType & 0x1f;
  if (type === 7) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + pos, field.size);
    const end = bytes.indexOf(0);
    const text = new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
    return text || undefined;
  }
  // [size, read, invalid value]; arrays (size a multiple of the type's) are read as their first element.
  const numeric: Record<number, [number, () => number, number]> = {
    0: [1, () => view.getUint8(pos), 0xff], // enum
    1: [1, () => view.getInt8(pos), 0x7f],
    2: [1, () => view.getUint8(pos), 0xff],
    3: [2, () => view.getInt16(pos, le), 0x7fff],
    4: [2, () => view.getUint16(pos, le), 0xffff],
    5: [4, () => view.getInt32(pos, le), 0x7fffffff],
    6: [4, () => view.getUint32(pos, le), 0xffffffff],
    10: [1, () => view.getUint8(pos), 0], // uint8z
    11: [2, () => view.getUint16(pos, le), 0],
    12: [4, () => view.getUint32(pos, le), 0],
  };
  const spec = numeric[type];
  if (!spec || field.size < spec[0]) return undefined;
  const value = spec[1]();
  return value === spec[2] ? undefined : value;
}

/** All data messages in the file, in order. Checks the header and the file's CRC. */
export function readFitMessages(bytes: Uint8Array): FitMessage[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = bytes[0];
  if (bytes.length < 12 || (headerSize !== 12 && headerSize !== 14))
    throw new WorkoutImportError(NOT_FIT);
  if (new TextDecoder().decode(bytes.subarray(8, 12)) !== '.FIT')
    throw new WorkoutImportError(NOT_FIT);
  const end = headerSize + view.getUint32(4, true);
  if (end + 2 > bytes.length || fitCrc(bytes, 0, end) !== view.getUint16(end, true))
    throw new WorkoutImportError(DAMAGED);

  const definitions = new Map<number, Definition>();
  const messages: FitMessage[] = [];
  let pos = headerSize;
  const take = (n: number) => {
    if (pos + n > end) throw new WorkoutImportError(DAMAGED);
    const at = pos;
    pos += n;
    return at;
  };

  while (pos < end) {
    const header = view.getUint8(take(1));
    const compressedTimestamp = (header & 0x80) !== 0;
    if (!compressedTimestamp && (header & 0x40) !== 0) {
      take(1); // reserved
      const littleEndian = view.getUint8(take(1)) === 0;
      const global = view.getUint16(take(2), littleEndian);
      const fields = Array.from({ length: view.getUint8(take(1)) }, () => {
        const at = take(3);
        return {
          num: view.getUint8(at),
          size: view.getUint8(at + 1),
          baseType: view.getUint8(at + 2),
        };
      });
      let devBytes = 0;
      if ((header & 0x20) !== 0)
        for (let n = view.getUint8(take(1)); n > 0; n--) devBytes += view.getUint8(take(3) + 1);
      definitions.set(header & 0x0f, { global, littleEndian, fields, devBytes });
      continue;
    }
    const definition = definitions.get(compressedTimestamp ? (header >> 5) & 0x03 : header & 0x0f);
    if (!definition) throw new WorkoutImportError(DAMAGED);
    const fields = new Map<number, number | string>();
    for (const field of definition.fields) {
      const value = readValue(view, take(field.size), field, definition.littleEndian);
      if (value !== undefined) fields.set(field.num, value);
    }
    take(definition.devBytes);
    messages.push({ global: definition.global, fields });
  }
  return messages;
}

// --- Workout messages (FIT profile: file_id, workout, workout_step) ---

const MESG = { fileId: 0, workout: 26, workoutStep: 27 } as const;
const FILE_TYPE_WORKOUT = 5;
const SPORT = { generic: 0, running: 1, cycling: 2 } as const;
/** workout_step field numbers. */
const STEP = {
  messageIndex: 254,
  name: 0,
  durationType: 1,
  durationValue: 2,
  targetType: 3,
  targetValue: 4,
  customLow: 5,
  customHigh: 6,
} as const;
/** wkt_step_duration values. */
const DURATION = { time: 0, distance: 1, open: 5, repeatSteps: 6, timeOnly: 31 } as const;
/** Repeats until a condition (time, distance, heart rate, power, TSS) rather than a count. */
const REPEAT_UNTIL_CONDITION = new Set([7, 8, 9, 10, 11, 12, 13, 17, 18, 27]);
/** wkt_step_target values: open, and the power targets (power, 3 s / 10 s / 30 s / lap average power). */
const TARGET_OPEN = 2;
const POWER_TARGETS = new Set([4, 7, 8, 9, 10]);
/** Custom power targets up to this are % of FTP; above it, watts + this. */
const WATTS_OFFSET = 1000;
/**
 * Power zone targets (1–7) as % of FTP: middle of Coggan's zones. A device's own zones may differ, but they're
 * usually set from FTP the same way.
 */
const POWER_ZONE_PCT: Record<number, number> = {
  1: 45,
  2: 65,
  3: 83,
  4: 98,
  5: 113,
  6: 135,
  7: 160,
};
/** Repeat counts above this are taken as mistakes. */
const MAX_REPEATS = 100;

const num = (m: FitMessage, field: number) => {
  const v = m.fields.get(field);
  return typeof v === 'number' ? v : undefined;
};

/** The step's power target; undefined for no target, null for a target that isn't power. */
function powerTarget(step: FitMessage): PowerTarget | undefined | null {
  const type = num(step, STEP.targetType);
  if (type === undefined || type === TARGET_OPEN) return undefined;
  if (!POWER_TARGETS.has(type)) return null;
  const zone = num(step, STEP.targetValue);
  if (zone) return { pctFtp: POWER_ZONE_PCT[zone] ?? 100 };
  const low = num(step, STEP.customLow);
  const high = num(step, STEP.customHigh);
  if (low === undefined || high === undefined) return undefined;
  const middle = (low + high) / 2;
  return low > WATTS_OFFSET && high > WATTS_OFFSET
    ? { watts: middle - WATTS_OFFSET }
    : { pctFtp: middle };
}

export function parseFitWorkout(bytes: Uint8Array, fallbackName: string): ImportedWorkout {
  const messages = readFitMessages(bytes);
  const fileType = messages.find((m) => m.global === MESG.fileId)?.fields.get(0);
  if (fileType !== FILE_TYPE_WORKOUT)
    throw new WorkoutImportError('This FIT file isn’t a workout (it may be a recorded ride).');
  const header = messages.find((m) => m.global === MESG.workout);
  const sport = header && num(header, 4);
  if (sport !== undefined && sport !== SPORT.generic && sport !== SPORT.cycling)
    throw new WorkoutImportError(
      sport === SPORT.running
        ? 'This is a running workout, not a cycling one.'
        : 'This isn’t a cycling workout.',
    );

  // Steps are in message_index order; repeats refer back to a step by its index.
  const fitSteps = messages
    .filter((m) => m.global === MESG.workoutStep)
    .map((m, i) => ({ m, index: num(m, STEP.messageIndex) ?? i }))
    .sort((a, b) => a.index - b.index);

  const steps: WorkoutStep[] = [];
  /** Where each FIT step's expansion begins in `steps`, by message index. */
  const startOf = new Map<number, number>();
  const warnings: string[] = [];
  let notPower = 0;
  for (const [i, { m, index }] of fitSteps.entries()) {
    startOf.set(index, steps.length);
    const name = m.fields.get(STEP.name);
    const label = `Step ${i + 1}${typeof name === 'string' ? ` (${name})` : ''}`;
    const type = num(m, STEP.durationType);
    const value = num(m, STEP.durationValue);

    if (type === DURATION.repeatSteps) {
      const from = value === undefined ? undefined : startOf.get(value);
      const times = num(m, STEP.targetValue);
      if (from === undefined || times === undefined || times < 1 || times > MAX_REPEATS) {
        warnings.push(`${label}: a repeat that can’t be read; its steps are done once.`);
        continue;
      }
      // The repeated steps are already in once (nested repeats expanded); `times` is the total count.
      const block = steps.slice(from);
      for (let n = 1; n < times; n++) steps.push(...block);
    } else if (type !== undefined && REPEAT_UNTIL_CONDITION.has(type)) {
      warnings.push(
        `${label}: repeats until a condition rather than a count; its steps are done once.`,
      );
    } else if ((type === DURATION.time || type === DURATION.timeOnly) && value) {
      const power = powerTarget(m);
      if (power === null) notPower++;
      steps.push({
        durationS: value / 1000,
        ...(power && { power }),
        ...(typeof name === 'string' && { name }),
      });
    } else {
      const ends =
        type === DURATION.distance
          ? 'on distance'
          : type === DURATION.open
            ? 'at the lap button'
            : 'on a condition';
      warnings.push(`${label} skipped: it ends ${ends}, not after a time.`);
    }
  }
  if (notPower > 0)
    warnings.push(
      `${notPower} ${notPower === 1 ? 'step targets' : 'steps target'} heart rate, cadence or speed rather than power; timed at your ride power.`,
    );
  if (steps.length === 0)
    throw new WorkoutImportError('This workout has no timed steps that can be used.');
  const wktName = header?.fields.get(8);
  const name = typeof wktName === 'string' && wktName.trim() ? wktName.trim() : fallbackName;
  return { workout: workoutFromSteps(name, steps), warnings };
}
