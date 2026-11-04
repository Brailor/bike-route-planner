import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { usePlanner } from '../state/store';
import { RiderPanel } from './RiderPanel';

const settings = () => usePlanner.getState().userSettings;

async function open() {
  render(<RiderPanel />);
  await userEvent.click(screen.getByTestId('rider-summary'));
}

describe('RiderPanel', () => {
  it('shows the defaults until the rider enters their own', async () => {
    await open();
    expect(screen.getByTestId('rider-summary')).toHaveTextContent('Rider: 200 W FTP · 75 kg');
    expect(screen.getByLabelText('FTP (W)')).toHaveValue('');
    expect(screen.getByLabelText('FTP (W)')).toHaveAttribute('placeholder', '200');
    expect(screen.getByTestId('ride-power')).toHaveTextContent('steady 130 W');
  });

  it('stores what is typed, accepting a decimal comma', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('FTP (W)'), '280');
    await userEvent.type(screen.getByLabelText('Weight (kg)'), '72,5');
    await userEvent.type(screen.getByLabelText('Ride power (% of FTP)'), '70');
    expect(settings()).toEqual({ ftpW: 280, weightKg: 72.5, ridePowerPct: 70 });
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue('72,5'); // not rewritten while typing
    expect(screen.getByTestId('rider-summary')).toHaveTextContent('280 W FTP · 72.5 kg');
    expect(screen.getByTestId('ride-power')).toHaveTextContent('steady 196 W');
  });

  it('marks out-of-range values invalid and keeps the last valid one', async () => {
    await open();
    const ftp = screen.getByLabelText('FTP (W)');
    await userEvent.type(ftp, '250');
    await userEvent.type(ftp, '0');
    expect(ftp).toHaveAttribute('aria-invalid', 'true');
    expect(ftp).toHaveAccessibleDescription('Between 50 and 600 W');
    expect(settings().ftpW).toBe(250);

    await userEvent.clear(ftp);
    await userEvent.type(ftp, 'abc');
    expect(ftp).toHaveAttribute('aria-invalid', 'true');
    expect(settings().ftpW).toBeUndefined(); // clearing on the way set it back to the default
  });

  it('clears a field back to its default', async () => {
    await open();
    const weight = screen.getByLabelText('Weight (kg)');
    await userEvent.type(weight, '68');
    await userEvent.clear(weight);
    expect(weight).toHaveAttribute('aria-invalid', 'false');
    expect(settings().weightKg).toBeUndefined();
    expect(screen.getByTestId('rider-summary')).toHaveTextContent('75 kg');
  });

  it('shows settings loaded from storage', async () => {
    await open();
    act(() => usePlanner.getState().loadUserSettings({ ftpW: 310 }));
    expect(screen.getByLabelText('FTP (W)')).toHaveValue('310');
  });
});
