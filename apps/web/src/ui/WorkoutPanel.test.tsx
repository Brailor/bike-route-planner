import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import { workoutFromSteps } from '../workouts/workout';
import { WorkoutPanel } from './WorkoutPanel';
import { WorkoutProfile } from './WorkoutProfile';

const workout = () => usePlanner.getState().workout;
// Without this, user-event drops files that don't match the input's accept list before they reach the app.
const user = () => userEvent.setup({ applyAccept: false });
const fileInput = () => screen.getByLabelText('Load workout file (.zwo, .fit)');

const ZWO = `<workout_file><name>Over-unders</name><workout>
  <Warmup Duration="600" PowerLow="0.5" PowerHigh="0.7"/>
  <IntervalsT Repeat="3" OnDuration="120" OffDuration="120" OnPower="1.05" OffPower="0.9"/>
  <Teleport Duration="5"/>
</workout></workout_file>`;

describe('WorkoutPanel', () => {
  it('sets a plain ride from a duration', async () => {
    render(<WorkoutPanel />);
    const field = screen.getByLabelText('Ride duration (h:mm or minutes)');
    const set = screen.getByRole('button', { name: 'Set' });
    expect(set).toBeDisabled();

    await user().type(field, '1:3');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await user().type(field, '0{Enter}');
    expect(workout()).toMatchObject({ name: '1 h 30 min ride', totalDurationS: 5400 });
    expect(screen.getByTestId('workout-name')).toHaveTextContent('1 h 30 min ride');
    expect(screen.queryByTestId('workout-profile')).not.toBeInTheDocument(); // one step: nothing to chart
  });

  it('loads a workout file, charts it and lists what was skipped', async () => {
    render(<WorkoutPanel />);
    await user().upload(fileInput(), new File([ZWO], 'over-unders.zwo'));
    await waitFor(() =>
      expect(screen.getByTestId('workout-name')).toHaveTextContent('Over-unders'),
    );
    expect(screen.getByTestId('workout-duration')).toHaveTextContent('22 min');
    expect(workout()?.intervals).toHaveLength(7);
    expect(screen.getByTestId('workout-profile')).toBeInTheDocument();
    expect(screen.getByTestId('workout-warnings')).toHaveTextContent(
      'Step 3 (Teleport) skipped: not a step type this app knows.',
    );
  });

  it('explains a file it can’t use, and keeps the inputs', async () => {
    render(<WorkoutPanel />);
    await user().upload(fileInput(), new File(['hello'], 'notes.txt'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a .zwo or .fit workout file.',
    );
    expect(workout()).toBeUndefined();
    expect(fileInput()).toHaveValue(''); // so picking the same file again (once fixed) loads it
  });

  it('reports unexpected read failures without the details', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const file = new File([ZWO], 'w.zwo');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('disk'));
    render(<WorkoutPanel />);
    await user().upload(fileInput(), file);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t read this file.');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('removes the workout, with its warnings', async () => {
    render(<WorkoutPanel />);
    await user().upload(fileInput(), new File([ZWO], 'w.zwo'));
    await user().click(await screen.findByRole('button', { name: 'Remove' }));
    expect(workout()).toBeUndefined();
    expect(fileInput()).toBeInTheDocument();

    await user().type(screen.getByLabelText('Ride duration (h:mm or minutes)'), '45{Enter}');
    expect(screen.queryByTestId('workout-warnings')).not.toBeInTheDocument();
  });
});

describe('WorkoutProfile', () => {
  const bars = () => [...screen.getByTestId('workout-profile').querySelectorAll('rect')];

  it('draws each step as tall as its power, coloured by zone; watts are read against FTP', () => {
    const w = workoutFromSteps('w', [
      { durationS: 600, power: { pctFtp: 50 } },
      { durationS: 300, power: { watts: 300 } },
      { durationS: 600 },
    ]);
    render(<WorkoutProfile workout={w} ftpW={250} ridePowerPct={65} />);
    expect(bars().map((b) => b.dataset.zone)).toEqual(['recovery', 'vo2', 'none']);
    expect(bars().map((b) => b.getAttribute('x'))).toEqual(['0', '600', '900']);
    // 120% is under the 130% minimum top; steps without a target are drawn at ride power.
    expect(bars().map((b) => Math.round(Number(b.getAttribute('height'))))).toEqual([38, 92, 50]);
    expect(bars()[1]).toHaveTextContent('5 min, 120% FTP, VO₂max');
    expect(bars()[2]).toHaveTextContent('10 min, no power target');
  });

  it('scales to the hardest step when it’s above the minimum top', () => {
    const w = workoutFromSteps('w', [
      { durationS: 30, power: { pctFtp: 200 } },
      { durationS: 30, power: { pctFtp: 100 } },
    ]);
    render(<WorkoutProfile workout={w} ftpW={250} ridePowerPct={65} />);
    expect(bars().map((b) => Number(b.getAttribute('height')))).toEqual([100, 50]);
    expect(bars()[0]).toHaveTextContent('30 s, 200% FTP, Anaerobic');
  });
});
