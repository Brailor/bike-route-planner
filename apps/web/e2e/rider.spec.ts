import { expect, test } from '@playwright/test';
import { fixture, openMap, stubRouting } from './support';

const gravel = fixture('gravel-offroad-80');

test('rider settings change the ride time and are kept after a reload', async ({ page }) => {
  await stubRouting(page, () => gravel.response);
  await openMap(page);
  await page.mouse.click(800, 350);
  await page.mouse.click(950, 500);
  const time = page.getByTestId('stat-time');
  await expect(time).toHaveText('8 min'); // defaults: 200 W FTP, 65% → 130 W

  await page.getByTestId('rider-summary').click();
  await page.getByLabel('FTP (W)').fill('100');
  await page.getByLabel('Weight (kg)').fill('68,5');
  await expect(time).toHaveText('11 min');
  await expect(page.getByTestId('rider-summary')).toHaveText('Rider: 100 W FTP · 68.5 kg');

  await page.getByLabel('FTP (W)').fill('5');
  await expect(page.getByLabel('FTP (W)')).toHaveAttribute('aria-invalid', 'true');
  await expect(time).toHaveText('11 min'); // the last valid FTP still applies

  await page.getByLabel('FTP (W)').fill('100');
  await page.reload();
  await expect(page.getByTestId('rider-summary')).toHaveText('Rider: 100 W FTP · 68.5 kg');
  await page.getByTestId('rider-summary').click();
  await expect(page.getByLabel('Weight (kg)')).toHaveValue('68.5');
});
