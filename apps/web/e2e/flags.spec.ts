import { expect, test } from '@playwright/test';
import { openMap, straightRoute, stubRouting } from './support';

// Stored fields are covered by the flag store's unit tests; here the point is that the app reloads them.
test('a saved flag is kept across reloads', async ({ page }) => {
  await stubRouting(page, straightRoute);
  await openMap(page);
  await page.mouse.click(600, 300);
  await page.mouse.click(1000, 460);
  await expect(page.getByTestId('stat-distance')).toBeVisible();

  await page.getByRole('button', { name: 'Flag a section' }).click();
  await page.getByRole('combobox', { name: 'Reason (optional)' }).selectOption('Too steep');
  await page.getByRole('textbox', { name: 'Note (optional)' }).fill('walked it');
  await page.getByRole('button', { name: 'Save flag' }).click();
  await expect(page.getByTestId('flag-handle')).toHaveCount(0);
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');

  await page.reload();
  await expect(page.getByTestId('flag-count')).toHaveText('1 flagged section');
});
