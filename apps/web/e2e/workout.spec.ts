import { expect, test } from '@playwright/test';
import { fitWorkout, minutes, pct } from '../src/test/fit';
import { openMap } from './support';

const ZWO = `<workout_file><name>Sweet spot 2x15</name><sportType>bike</sportType><workout>
  <Warmup Duration="600" PowerLow="0.5" PowerHigh="0.75"/>
  <IntervalsT Repeat="2" OnDuration="900" OffDuration="300" OnPower="0.9" OffPower="0.55"/>
  <Cooldown Duration="600" PowerLow="0.6" PowerHigh="0.4"/>
</workout></workout_file>`;

test('set a ride duration, then load ZWO and FIT workout files', async ({ page }) => {
  await openMap(page);
  const workout = page.getByRole('region', { name: 'Workout' });

  await workout.getByLabel('Ride duration (h:mm or minutes)').fill('1:30');
  await workout.getByRole('button', { name: 'Set' }).click();
  await expect(page.getByTestId('workout-name')).toHaveText('1 h 30 min ride');
  await workout.getByRole('button', { name: 'Remove' }).click();

  const fileInput = workout.getByLabel('Load workout file (.zwo, .fit)');
  await fileInput.setInputFiles({
    name: 'sweet-spot.zwo',
    mimeType: 'application/xml',
    buffer: Buffer.from(ZWO),
  });
  await expect(page.getByTestId('workout-name')).toHaveText('Sweet spot 2x15');
  await expect(page.getByTestId('workout-duration')).toHaveText('1 h 00 min');
  await expect(page.getByTestId('workout-profile').locator('rect')).toHaveCount(6);
  await workout.getByRole('button', { name: 'Remove' }).click();

  const fit = fitWorkout(
    [
      { ...minutes(10), ...pct(50, 70) },
      { ...minutes(20), ...pct(1240, 1260) }, // 250 W
      { durationType: 'distance', durationValue: 100_000 },
    ],
    { name: 'Garmin tempo' },
  );
  await fileInput.setInputFiles({
    name: 'tempo.fit',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(fit),
  });
  await expect(page.getByTestId('workout-name')).toHaveText('Garmin tempo');
  await expect(page.getByTestId('workout-duration')).toHaveText('30 min');
  // 250 W against the default 200 W FTP is 125%: anaerobic.
  await expect(page.getByTestId('workout-profile').locator('rect').nth(1)).toHaveAttribute(
    'data-zone',
    'anaerobic',
  );
  await expect(page.getByTestId('workout-warnings')).toContainText('it ends on distance');
});

test('explains a file that isn’t a workout', async ({ page }) => {
  await openMap(page);
  await page.getByLabel('Load workout file (.zwo, .fit)').setInputFiles({
    name: 'route.fit',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(fitWorkout([minutes(1)], { type: 'activity' })),
  });
  await expect(page.getByRole('alert')).toHaveText(
    'This FIT file isn’t a workout (it may be a recorded ride).',
  );
});
