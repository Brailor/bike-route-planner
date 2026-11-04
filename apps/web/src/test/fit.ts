// FIT workout files for tests, written by Garmin's own SDK (a dev dependency only: it isn't shipped, ADR 0008).
import {
  Encoder,
  Profile,
  type FileIdMesg,
  type WorkoutMesg,
  type WorkoutStepMesg,
} from '@garmin/fitsdk';

const { FILE_ID = 0, WORKOUT = 26, WORKOUT_STEP = 27 } = Profile.MesgNum;

export type FitStep = WorkoutStepMesg;

/** A workout file with these steps, as Garmin writes it; message indices follow the order given. */
export function fitWorkout(
  steps: FitStep[],
  {
    type = 'workout',
    sport = 'cycling',
    name = 'Threshold 3x8',
  }: { type?: FileIdMesg['type']; sport?: WorkoutMesg['sport']; name?: string } = {},
) {
  const fileId: FileIdMesg = {
    type,
    manufacturer: 'development',
    product: 1,
    serialNumber: 1234,
    timeCreated: new Date('2026-11-04T08:00:00Z'),
  };
  const workout: WorkoutMesg = { wktName: name, sport, numValidSteps: steps.length };
  const encoder = new Encoder().onMesg(FILE_ID, fileId).onMesg(WORKOUT, workout);
  steps.forEach((step, i) => {
    const indexed: WorkoutStepMesg = { ...step, messageIndex: i };
    encoder.onMesg(WORKOUT_STEP, indexed);
  });
  // A copy on a plain ArrayBuffer, so it can also go into a File.
  return new Uint8Array(encoder.close());
}

/** Steps given with their own message indices, in the order given. */
export function fitSteps(steps: FitStep[]) {
  const fileId: FileIdMesg = { type: 'workout', manufacturer: 'development' };
  const encoder = new Encoder().onMesg(FILE_ID, fileId);
  for (const step of steps) encoder.onMesg(WORKOUT_STEP, step);
  return new Uint8Array(encoder.close());
}

export const minutes = (n: number): FitStep => ({
  durationType: 'time',
  durationValue: n * 60_000,
});

/** A custom power target: % of FTP, or watts + 1000. */
export const pct = (low: number, high: number): FitStep => ({
  targetType: 'power',
  targetValue: 0,
  customTargetValueLow: low,
  customTargetValueHigh: high,
});
