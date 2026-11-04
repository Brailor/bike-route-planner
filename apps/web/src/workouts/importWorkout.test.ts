import { describe, expect, it } from 'vitest';
import { fitWorkout, minutes } from '../test/fit';
import { importWorkout, parseRideDuration } from './importWorkout';

const fitBytes = () => fitWorkout([minutes(10)], { name: '' });

const ZWO =
  '<workout_file><workout><SteadyState Duration="900" Power="0.7"/></workout></workout_file>';

describe('importWorkout', () => {
  it('reads FIT files by their signature, whatever the name', async () => {
    const { workout } = await importWorkout(new File([fitBytes()], 'download (1)'));
    expect(workout).toMatchObject({ name: 'download (1)', totalDurationS: 600 });
  });

  it('reads ZWO files, by extension or by content', async () => {
    const byName = await importWorkout(new File([ZWO], 'Tempo.ZWO'));
    expect(byName.workout).toMatchObject({ name: 'Tempo', totalDurationS: 900 });
    const byContent = await importWorkout(new File([`\n  ${ZWO}`], 'tempo.xml'));
    expect(byContent.workout.totalDurationS).toBe(900);
  });

  it('reads a .zwo file as ZWO even when it doesn’t look like XML, to say what’s wrong with it', async () => {
    await expect(importWorkout(new File(['garbage'], 'w.zwo'))).rejects.toThrow(
      'This isn’t a Zwift workout (.zwo) file.',
    );
  });

  it('turns away other files', async () => {
    await expect(importWorkout(new File(['hello'], 'notes.txt'))).rejects.toThrow(
      'Choose a .zwo or .fit workout file.',
    );
    await expect(importWorkout(new File([new Uint8Array(2_000_001)], 'big.fit'))).rejects.toThrow(
      'too big',
    );
  });
});

describe('parseRideDuration', () => {
  it.each([
    ['1:30', 5400],
    [' 2:05 ', 7500],
    ['90', 5400],
    ['10', 600],
    ['12:00', 43200],
  ])('reads %s as %i s', (text, seconds) => {
    expect(parseRideDuration(text)).toBe(seconds);
  });

  it.each(['', '1:3', '1:60', 'abc', '9', '12:01', '1.5', '-30'])('rejects %j', (text) => {
    expect(parseRideDuration(text)).toBeUndefined();
  });
});
