import { describe, expect, it } from 'vitest';
import { fitSteps, fitWorkout, minutes, pct, type FitStep } from '../test/fit';
import { fitCrc, parseFitWorkout } from './fit';
import { WorkoutImportError } from './workout';

const watts = (low: number, high: number): FitStep => pct(low + 1000, high + 1000);
const repeat = (fromIndex: number, times: number): FitStep => ({
  durationType: 'repeatUntilStepsCmplt',
  durationValue: fromIndex,
  targetType: 'open',
  targetValue: times,
});

const timeline = (bytes: Uint8Array) =>
  parseFitWorkout(bytes, 'file').workout.intervals.map(({ startS, durationS, power }) => ({
    startS,
    durationS,
    power,
  }));

describe('parseFitWorkout', () => {
  it('reads a Garmin workout: % FTP and watt targets, power zones, an open target, repeats', () => {
    const bytes = fitWorkout([
      { wktStepName: 'Warm up', ...minutes(10), ...pct(50, 75), intensity: 'warmup' },
      { wktStepName: 'Threshold', ...minutes(8), ...watts(240, 260), intensity: 'active' },
      {
        wktStepName: 'Easy',
        ...minutes(4),
        targetType: 'power',
        targetValue: 1,
        intensity: 'recovery',
      },
      repeat(1, 3),
      { wktStepName: 'Cool down', ...minutes(10), targetType: 'open', intensity: 'cooldown' },
    ]);
    const { workout, warnings } = parseFitWorkout(bytes, 'file');
    expect(warnings).toEqual([]);
    expect(workout.name).toBe('Threshold 3x8');
    expect(workout.totalDurationS).toBe((10 + 3 * 12 + 10) * 60);
    expect(workout.intervals.map((i) => i.name)).toEqual([
      'Warm up',
      'Threshold',
      'Easy',
      'Threshold',
      'Easy',
      'Threshold',
      'Easy',
      'Cool down',
    ]);
    expect(timeline(bytes).slice(0, 3)).toEqual([
      { startS: 0, durationS: 600, power: { pctFtp: 62.5 } },
      { startS: 600, durationS: 480, power: { watts: 250 } },
      { startS: 1080, durationS: 240, power: { pctFtp: 45 } },
    ]);
    expect(workout.intervals.at(-1)).toEqual({ startS: 2760, durationS: 600, name: 'Cool down' });
  });

  it('expands nested repeats', () => {
    const bytes = fitWorkout([
      { ...minutes(1), ...pct(120, 120) },
      { ...minutes(1), ...pct(50, 50) },
      repeat(0, 2), // 2 × (on, off)
      { ...minutes(5), ...pct(60, 60) },
      repeat(0, 2), // the whole set again
    ]);
    expect(timeline(bytes).map((i) => i.durationS / 60)).toEqual([1, 1, 1, 1, 5, 1, 1, 1, 1, 5]);
  });

  it('orders steps by their index, not their place in the file', () => {
    const bytes = fitSteps([
      { messageIndex: 1, ...minutes(2), ...pct(90, 90) },
      { messageIndex: 0, ...minutes(1), ...pct(60, 60) },
    ]);
    expect(timeline(bytes).map((i) => i.power)).toEqual([{ pctFtp: 60 }, { pctFtp: 90 }]);
  });

  it('skips steps that don’t end after a time, and says which targets aren’t power', () => {
    const { workout, warnings } = parseFitWorkout(
      fitWorkout([
        { wktStepName: 'Warm up', durationType: 'open', targetType: 'open' },
        { ...minutes(20), targetType: 'heartRate', targetValue: 2 },
        { durationType: 'distance', durationValue: 500_000, ...pct(100, 100) },
        { ...minutes(5), targetType: 'cadence', targetValue: 0 },
        { durationType: 'repeatUntilTime', durationValue: 1, targetValue: 3_600_000 },
      ]),
      'file',
    );
    expect(workout.intervals.map((i) => [i.durationS, i.power])).toEqual([
      [1200, undefined],
      [300, undefined],
    ]);
    expect(warnings).toEqual([
      'Step 1 (Warm up) skipped: it ends at the lap button, not after a time.',
      'Step 3 skipped: it ends on distance, not after a time.',
      'Step 5: repeats until a condition rather than a count; its steps are done once.',
      '2 steps target heart rate, cadence or speed rather than power; timed at your ride power.',
    ]);
  });

  it('warns about a repeat it can’t follow, and does its steps once', () => {
    const { workout, warnings } = parseFitWorkout(
      fitWorkout([{ ...minutes(1), ...pct(60, 60) }, repeat(7, 3)]),
      'file',
    );
    expect(workout.intervals).toHaveLength(1);
    expect(warnings).toEqual(['Step 2: a repeat that can’t be read; its steps are done once.']);
    const tooMany = fitWorkout([{ ...minutes(1), ...pct(60, 60) }, repeat(0, 1000)]);
    expect(parseFitWorkout(tooMany, 'file').workout.intervals).toHaveLength(1);
  });

  it('names the workout after the file when it has no name', () => {
    const bytes = fitWorkout([{ ...minutes(1), ...pct(60, 60) }], { name: '' });
    expect(parseFitWorkout(bytes, 'garmin.fit').workout.name).toBe('garmin.fit');
  });

  it.each([
    ['a recorded ride', fitWorkout([minutes(1)], { type: 'activity' }), 'isn’t a workout'],
    ['a running workout', fitWorkout([minutes(1)], { sport: 'running' }), 'running workout'],
    ['a swimming workout', fitWorkout([minutes(1)], { sport: 'swimming' }), 'isn’t a cycling'],
    ['no timed steps', fitWorkout([{ durationType: 'open' }]), 'no timed steps'],
    [
      'a file that isn’t FIT',
      new TextEncoder().encode('<workout_file/> not fit at all'),
      'isn’t a FIT',
    ],
  ])('rejects %s', (_, bytes, message) => {
    expect(() => parseFitWorkout(bytes, 'f')).toThrow(WorkoutImportError);
    expect(() => parseFitWorkout(bytes, 'f')).toThrow(message);
  });

  it('rejects a damaged or cut-short file', () => {
    const bytes = fitWorkout([{ ...minutes(1), ...pct(60, 60) }]);
    // The last byte before the CRC is part of a value: the file still reads, but its CRC no longer matches.
    const flipped = bytes.slice();
    flipped[bytes.length - 3] = (flipped[bytes.length - 3] ?? 0) ^ 0x01;
    expect(() => parseFitWorkout(flipped, 'f')).toThrow('damaged');
    expect(() => parseFitWorkout(bytes.slice(0, -10), 'f')).toThrow('damaged');
  });
});

describe('FIT container', () => {
  /** A file with a 12-byte header (no header CRC) around the given records. */
  function rawFit(records: number[]) {
    const size = records.length;
    const body = [12, 0x20, 0, 0, size & 0xff, (size >> 8) & 0xff, 0, 0, ...'.FIT'].map((b) =>
      typeof b === 'string' ? b.charCodeAt(0) : b,
    );
    body.push(...records);
    const crc = fitCrc(Uint8Array.from(body));
    return Uint8Array.from([...body, crc & 0xff, crc >> 8]);
  }

  // file_id, big-endian, one enum field: type = workout (5)
  // prettier-ignore
  const FILE_ID = [
    0x40, 0, 1, 0, 0, 1, 0, 1, 0x00,
    0x00, 5,
  ];

  it('reads big-endian fields, skips developer fields, and follows compressed-timestamp headers', () => {
    // prettier-ignore
    const bytes = rawFit([
      ...FILE_ID,
      // workout_step, big-endian, with one 2-byte developer field: duration_type (enum), duration_value (uint32)
      0x61, 0, 1, 0, 27, 2, 1, 1, 0x00, 2, 4, 0x86, 1, 0, 2, 0,
      0x01, 0, 0x00, 0x04, 0x93, 0xe0, 0xaa, 0xbb, // time, 300 000 ms
      // The same message type again under a compressed-timestamp header (local type 1, offset 3)
      0xa3, 0, 0x00, 0x01, 0xd4, 0xc0, 0xcc, 0xdd, // time, 120 000 ms
    ]);
    expect(timeline(bytes).map((i) => i.durationS)).toEqual([300, 120]);
  });

  it('treats "not set" values and fields too short for their type as missing', () => {
    // prettier-ignore
    const bytes = rawFit([
      ...FILE_ID,
      // workout_step, little-endian: duration_type (enum), duration_value (uint32), target_type (uint32 in 2 bytes!)
      0x41, 0, 0, 27, 0, 3, 1, 1, 0x00, 2, 4, 0x86, 3, 2, 0x86,
      0x01, 0, 0xff, 0xff, 0xff, 0xff, 4, 0, // time, duration not set
      0x01, 0, 0x60, 0xea, 0x00, 0x00, 4, 0, // time, 60 000 ms
    ]);
    const { workout, warnings } = parseFitWorkout(bytes, 'f');
    expect(workout.intervals).toEqual([{ startS: 0, durationS: 60 }]); // no target read from the short field
    expect(warnings).toEqual(['Step 1 skipped: it ends on a condition, not after a time.']);
  });

  it('rejects data for a message type that was never defined', () => {
    expect(() => parseFitWorkout(rawFit([0x02, 0, 5]), 'f')).toThrow('damaged');
  });

  it('rejects a message that runs past the end of the data', () => {
    // prettier-ignore
    const bytes = rawFit([
      ...FILE_ID,
      0x41, 0, 0, 27, 0, 1, 2, 4, 0x86,
      0x01, 0x60, 0xea, // two of the four bytes
    ]);
    expect(() => parseFitWorkout(bytes, 'f')).toThrow('damaged');
  });
});
