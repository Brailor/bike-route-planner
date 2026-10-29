import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { selectSettings, usePlanner } from '../state/store';
import { ProfilePanel } from './ProfilePanel';

const settings = () => selectSettings(usePlanner.getState());

describe('ProfilePanel', () => {
  it('marks the active profile', () => {
    render(<ProfilePanel />);
    expect(screen.getByRole('button', { name: 'Gravel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Road' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches profile', async () => {
    render(<ProfilePanel />);
    await userEvent.click(screen.getByRole('button', { name: 'MTB' }));
    expect(usePlanner.getState().profile).toBe('mtb');
    expect(screen.getByRole('button', { name: 'MTB' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the off-road slider for gravel/MTB only', async () => {
    render(<ProfilePanel />);
    expect(screen.getByRole('slider')).toHaveValue('80');
    await userEvent.click(screen.getByRole('button', { name: 'Road' }));
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('updates the off-road preference of the active profile only', () => {
    render(<ProfilePanel />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '35' } });
    expect(settings().offroadPreference).toBe(35);
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(usePlanner.getState().settingsByProfile.mtb.offroadPreference).toBe(60);
  });

  it('toggles avoid main roads', async () => {
    render(<ProfilePanel />);
    const checkbox = screen.getByRole('checkbox', { name: 'Avoid main roads' });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(settings().avoidMainRoads).toBe(true);
    expect(checkbox).toBeChecked();
  });

  it('keeps each profile’s settings when switching back and forth', async () => {
    render(<ProfilePanel />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '100' } });
    await userEvent.click(screen.getByRole('button', { name: 'Road' }));
    await userEvent.click(screen.getByRole('button', { name: 'Gravel' }));
    expect(screen.getByRole('slider')).toHaveValue('100');
  });
});
