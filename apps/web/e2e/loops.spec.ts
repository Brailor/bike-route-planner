import { expect, test, type Page } from '@playwright/test';
import { fixture, openMap, stubRouting } from './support';

type Path = {
  points: { coordinates: number[][] };
  details: { osm_way_id?: [number, number, number | null][] };
};

const roundTrip = fixture('gravel-round-trip').response as unknown as { paths: Path[] };

/**
 * Every loop request gets the recorded loop, on new way IDs each time, so no two count as the same loop. Asked to ride
 * one the other way (through its points, passing through), the engine gives the recorded loop backwards.
 */
async function stubLoops(page: Page) {
  let n = 0;
  return stubRouting(page, (body) => {
    n++;
    const [path] = roundTrip.paths;
    const ways = path!.details.osm_way_id!.map(([from, to, id]) => [from, to, n * 1e9 + (id ?? 0)]);
    const coordinates = (body as { pass_through?: boolean }).pass_through
      ? [...path!.points.coordinates].reverse()
      : path!.points.coordinates;
    return {
      paths: [
        {
          ...path,
          points: { ...path!.points, coordinates },
          details: { ...path!.details, osm_way_id: ways },
        },
      ],
    };
  });
}

const ZWO = `<workout_file><name>Tempo blocks</name><workout>
  <SteadyState Duration="420" Power="0.6"/>
  <SteadyState Duration="420" Power="0.85"/>
  <SteadyState Duration="420" Power="0.6"/>
</workout></workout_file>`;

test('find loops for a workout, compare them, export one, close', async ({ page }) => {
  const requests = await stubLoops(page);
  await openMap(page);
  await page.mouse.click(800, 350); // the start
  await expect(page.getByTestId('waypoint')).toHaveCount(1);

  await page.getByLabel('Load workout file (.zwo, .fit)').setInputFiles({
    name: 'tempo.zwo',
    mimeType: 'application/xml',
    buffer: Buffer.from(ZWO),
  });
  await page.getByRole('button', { name: 'Find loops from the start' }).click();

  const cards = page.getByTestId('loop-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.first()).toContainText('9.7 km');
  expect(requests.some((r) => (r as { algorithm?: string }).algorithm === 'round_trip')).toBe(true);
  // The tempo block, shaded on the elevation chart.
  await expect(page.getByTestId('elevation-band')).toHaveCount(1);

  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');

  // Ride it the other way: the engine is asked to pass through points along it, and the switch flips.
  const direction = page.getByRole('group', { name: 'Direction' });
  const before = (await direction.getByRole('button', { pressed: true }).textContent()) ?? '';
  await direction.getByRole('button', { pressed: false }).click();
  await expect(direction.getByRole('button', { pressed: true })).not.toHaveText(before);
  expect(requests.some((r) => (r as { pass_through?: boolean }).pass_through)).toBe(true);
  // And back, without asking the engine again.
  const asked = requests.length;
  await direction.getByRole('button', { pressed: false }).click();
  await expect(direction.getByRole('button', { pressed: true })).toHaveText(before);
  expect(requests).toHaveLength(asked);

  // The map is for picking loops now: a click elsewhere places no waypoint.
  await page.mouse.click(400, 600);
  await expect(page.getByTestId('waypoint')).toHaveCount(1);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export GPX' }).click();
  expect((await download).suggestedFilename()).toBe('tempo-blocks-loop-9-7-km.gpx');

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Flag on map' })).toBeVisible();
});

test('loops close when the workout changes', async ({ page }) => {
  await stubLoops(page);
  await openMap(page);
  await page.mouse.click(800, 350);
  const workout = page.getByRole('region', { name: 'Workout' });
  await workout.getByLabel('Ride duration (h:mm or minutes)').fill('25');
  await workout.getByRole('button', { name: 'Set' }).click();
  await workout.getByRole('button', { name: 'Find loops from the start' }).click();
  await expect(page.getByTestId('loop-card')).toHaveCount(3);
  await expect(page.getByTestId('elevation-band')).toHaveCount(0); // a plain ride has no hard intervals

  await workout.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByTestId('loop-card')).toHaveCount(0);
});
