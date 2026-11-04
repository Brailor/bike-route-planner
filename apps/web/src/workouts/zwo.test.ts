import { describe, expect, it } from 'vitest';
import { WorkoutImportError } from './workout';
import { parseZwo } from './zwo';

const zwo = (steps: string, head = '<name>Sweet spot 2x10</name><sportType>bike</sportType>') =>
  `<?xml version="1.0" encoding="UTF-8"?><workout_file><author>intervals.icu</author>${head}<workout>${steps}</workout></workout_file>`;

/** Intervals without their names, for comparing timings and targets. */
const timeline = (xml: string) =>
  parseZwo(xml, 'file').workout.intervals.map(({ startS, durationS, power }) => ({
    startS,
    durationS,
    power,
  }));

describe('parseZwo', () => {
  it('reads a structured workout: ramps averaged, steady blocks, repeated on/off intervals', () => {
    const xml = zwo(`
      <Warmup Duration="600" PowerLow="0.50" PowerHigh="0.75" pace="0">
        <textevent timeoffset="0" message="Easy start"/>
      </Warmup>
      <IntervalsT Repeat="2" OnDuration="600" OffDuration="300" OnPower="0.9" OffPower="0.55"/>
      <SteadyState Duration="300" Power="0.65"/>
      <Cooldown Duration="300" PowerLow="0.6" PowerHigh="0.4"/>`);
    const { workout, warnings } = parseZwo(xml, 'file');
    expect(warnings).toEqual([]);
    expect(workout.name).toBe('Sweet spot 2x10');
    expect(workout.totalDurationS).toBe(600 + 2 * 900 + 300 + 300);
    expect(timeline(xml)).toEqual([
      { startS: 0, durationS: 600, power: { pctFtp: 62.5 } },
      { startS: 600, durationS: 600, power: { pctFtp: 90 } },
      { startS: 1200, durationS: 300, power: { pctFtp: 55 } },
      { startS: 1500, durationS: 600, power: { pctFtp: 90 } },
      { startS: 2100, durationS: 300, power: { pctFtp: 55 } },
      { startS: 2400, durationS: 300, power: { pctFtp: 65 } },
      { startS: 2700, durationS: 300, power: { pctFtp: 50 } },
    ]);
  });

  it('reads ranged steady and interval targets, free rides and max efforts', () => {
    expect(
      timeline(
        zwo(`
          <SteadyState Duration="60" PowerLow="0.8" PowerHigh="0.9"/>
          <IntervalsT Repeat="1" OnDuration="30" OffDuration="30"
            PowerOnLow="1.1" PowerOnHigh="1.3" PowerOffLow="0.4" PowerOffHigh="0.6"/>
          <FreeRide Duration="600" FlatRoad="1"/>
          <MaxEffort Duration="20"/>`),
      ),
    ).toEqual([
      { startS: 0, durationS: 60, power: { pctFtp: 85 } },
      { startS: 60, durationS: 30, power: { pctFtp: 120 } },
      { startS: 90, durationS: 30, power: { pctFtp: 50 } },
      { startS: 120, durationS: 600, power: undefined },
      { startS: 720, durationS: 20, power: { pctFtp: 150 } },
    ]);
  });

  it('ignores the case of element and attribute names', () => {
    expect(timeline(zwo('<steadystate duration="120" power="0.7"/>'))).toEqual([
      { startS: 0, durationS: 120, power: { pctFtp: 70 } },
    ]);
  });

  it('skips steps it can’t use, saying which and why', () => {
    const { workout, warnings } = parseZwo(
      zwo(`
        <SteadyState Duration="300" Power="0.7"/>
        <SteadyState Power="0.8"/>
        <SteadyState Duration="300" Power="250"/>
        <IntervalsT Repeat="0" OnDuration="30" OffDuration="30" OnPower="1" OffPower="0.5"/>
        <Teleport Duration="5"/>`),
      'file',
    );
    expect(workout.totalDurationS).toBe(300);
    expect(warnings).toEqual([
      'Step 2 (SteadyState) skipped: no valid Duration.',
      'Step 3 (SteadyState) skipped: no valid Power.',
      'Step 4 (IntervalsT) skipped: no valid Repeat.',
      'Step 5 (Teleport) skipped: not a step type this app knows.',
    ]);
  });

  it('names the workout after the file when it has no name', () => {
    const xml = zwo('<SteadyState Duration="60" Power="0.6"/>', '<name> </name>');
    expect(parseZwo(xml, 'tuesday.zwo').workout.name).toBe('tuesday.zwo');
  });

  it.each([
    ['not XML', 'not a workout <'],
    ['another XML file', '<gpx><trk/></gpx>'],
    [
      'a running workout',
      zwo('<SteadyState Duration="60" Power="0.6"/>', '<sportType>run</sportType>'),
    ],
    ['no workout element', '<workout_file><name>x</name></workout_file>'],
    ['no usable steps', zwo('<SteadyState Power="0.6"/>')],
  ])('rejects %s', (_, xml) => {
    expect(() => parseZwo(xml, 'file')).toThrow(WorkoutImportError);
  });

  it('explains a running workout', () => {
    expect(() =>
      parseZwo(zwo('<SteadyState Duration="60" Power="0.6"/>', '<sportType>run</sportType>'), 'f'),
    ).toThrow('This is a run workout, not a cycling one.');
  });
});
