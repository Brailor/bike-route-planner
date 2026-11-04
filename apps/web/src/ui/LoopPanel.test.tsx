import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoopScore } from '../loops/score';
import { predictRide } from '../speed/model';
import { usePlanner, type LoopSearch, type RankedLoop } from '../state/store';
import { fixtureRoute } from '../test/route';
import { durationWorkout, workoutFromSteps } from '../workouts/workout';
import { LoopPanel } from './LoopPanel';
import { Sidebar } from './Sidebar';
import { WorkoutPanel } from './WorkoutPanel';

const ride = predictRide(fixtureRoute, 'gravel', { weightKg: 75, powerW: 130 });
const score = (over: Partial<LoopScore> = {}): LoopScore => ({
  total: 0.84,
  time: 1,
  intervals: undefined,
  flow: 0.5,
  surface: 0.5,
  variety: 1,
  usesFlag: false,
  intervalOnDescent: false,
  ...over,
});
const ranked = (over: Partial<LoopScore> = {}): RankedLoop => ({
  loop: { source: 'round_trip', route: fixtureRoute, ride },
  score: score(over),
});

/** A workout as long as the fixture route takes, with a threshold block in its middle third. */
const third = ride.durationS / 3;
const structured = workoutFromSteps('Threshold', [
  { durationS: third, power: { pctFtp: 60 } },
  { durationS: third, power: { pctFtp: 100 }, name: 'Block' },
  { durationS: third, power: { pctFtp: 60 } },
]);

function show(loops: Partial<LoopSearch> = {}) {
  const value: LoopSearch = {
    request: { start: [16.559, 48.2004], workout: structured },
    status: 'ready',
    results: [
      ranked({ flow: 0.9 }),
      ranked({ total: 0.7, variety: 0.6 }),
      ranked({ total: 0.5, usesFlag: true }),
    ],
    selected: 0,
    error: undefined,
    ...loops,
  };
  act(() => usePlanner.setState({ loops: value }));
  return value;
}

const Panel = () => {
  const loops = usePlanner((s) => s.loops);
  return loops ? <LoopPanel loops={loops} /> : null;
};

describe('LoopPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says it’s searching, and shows errors', () => {
    show({ status: 'searching', results: [] });
    render(<Panel />);
    expect(screen.getByRole('status')).toHaveTextContent('Finding loops…');
    show({ status: 'error', results: [], error: 'No loops found from this start.' });
    expect(screen.getByRole('alert')).toHaveTextContent('No loops found from this start.');
  });

  it('shows a card per loop with its numbers and what stands out', () => {
    show();
    render(<Panel />);
    const cards = screen.getAllByTestId('loop-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');
    expect(cards[0]).toHaveTextContent('Loop 1');
    expect(cards[0]).toHaveTextContent('84% match');
    expect(cards[0]).toHaveTextContent('3.4 km');
    expect(cards[0]).toHaveTextContent('on time');
    expect(cards[0]).toHaveTextContent('Long stretches without stops');
    expect(cards[1]).toHaveTextContent('Partly out and back');
    expect(cards[2]).toHaveTextContent('Uses a flagged section');
  });

  it('shows how far each loop is from the workout’s time', () => {
    show({ request: { start: [0, 0], workout: durationWorkout('w', ride.durationS * 0.9) } });
    render(<Panel />);
    expect(screen.getAllByTestId('loop-card')[0]).toHaveTextContent('(+11%)');
    show({ request: { start: [0, 0], workout: durationWorkout('w', ride.durationS * 1.25) } });
    expect(screen.getAllByTestId('loop-card')[0]).toHaveTextContent('(−20%)');
  });

  it('selects a loop when its card is clicked', async () => {
    show();
    render(<Panel />);
    await userEvent.click(screen.getAllByTestId('loop-card')[1]!);
    expect(usePlanner.getState().loops?.selected).toBe(1);
    expect(screen.getAllByTestId('loop-card')[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('shades the hard intervals on the selected loop’s elevation chart', () => {
    show();
    render(<Panel />);
    const bands = screen.getAllByTestId('elevation-band');
    expect(bands).toHaveLength(1);
    expect(bands[0]).toHaveTextContent('Block: 100% FTP, Threshold');
    // Over the middle third of the chart.
    const x = Number(bands[0]!.getAttribute('x'));
    const width = Number(bands[0]!.getAttribute('width'));
    expect(x).toBeGreaterThan(100);
    expect(x + width).toBeLessThan(260);
  });

  it('shows the selected loop’s surfaces', () => {
    show();
    render(<Panel />);
    // The fixture route is mostly asphalt, with gravel and untagged stretches.
    expect(screen.getByTestId('surface-paved')).toBeInTheDocument();
    expect(screen.getByTestId('surface-gravel')).toBeInTheDocument();
  });

  it('has no bands for a plain ride', () => {
    show({ request: { start: [0, 0], workout: durationWorkout('w', ride.durationS) } });
    render(<Panel />);
    expect(screen.getByTestId('elevation-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('elevation-band')).not.toBeInTheDocument();
  });

  it('exports the selected loop as GPX', async () => {
    show();
    const createObjectURL = vi.fn(() => 'blob:loop');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('threshold-loop-3-4-km.gpx');
    });
    render(<Panel />);
    await userEvent.click(screen.getByRole('button', { name: 'Export GPX' }));
    expect(click).toHaveBeenCalledOnce();
  });

  it('closes', async () => {
    show();
    render(<Panel />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(usePlanner.getState().loops).toBeUndefined();
  });
});

describe('Find loops', () => {
  const button = () => screen.getByRole('button', { name: 'Find loops from the start' });

  it('needs a start point, then starts a search', async () => {
    act(() => usePlanner.getState().setWorkout(structured));
    render(<WorkoutPanel />);
    expect(button()).toBeDisabled();
    expect(
      screen.getByText('Set a start point to find loops that fit this workout.'),
    ).toBeInTheDocument();
    act(() => usePlanner.getState().addWaypoint([16.559, 48.2004]));
    await userEvent.click(button());
    expect(usePlanner.getState().loops?.status).toBe('searching');
    expect(button()).toBeDisabled(); // until it's done
  });

  it('is disabled while a flag is being marked', () => {
    act(() => {
      usePlanner.getState().setWorkout(structured);
      usePlanner.getState().addWaypoint([16.559, 48.2004]);
      usePlanner.getState().startFlagDraft();
    });
    render(<WorkoutPanel />);
    expect(button()).toBeDisabled();
  });
});

describe('Sidebar with loops', () => {
  it('shows the loops in place of the route and flags', () => {
    act(() => {
      usePlanner.getState().addWaypoint([16.559, 48.2004]);
      usePlanner.getState().addWaypoint([16.59, 48.19]);
      usePlanner.getState().setRoute(fixtureRoute);
    });
    render(<Sidebar />);
    expect(screen.getByRole('region', { name: 'Route' })).toBeInTheDocument();
    show();
    expect(screen.queryByRole('region', { name: 'Route' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Flag on map' })).not.toBeInTheDocument();
    const loops = screen.getByRole('region', { name: 'Loops' });
    expect(within(loops).getAllByTestId('loop-card')).toHaveLength(3);
  });

  it('hides hints about placing waypoints: map clicks pick loops now', () => {
    act(() => usePlanner.getState().addWaypoint([16.559, 48.2004]));
    render(<Sidebar />);
    expect(screen.getByText('Click again to set the destination.')).toBeInTheDocument();
    show();
    expect(screen.queryByText('Click again to set the destination.')).not.toBeInTheDocument();
  });
});
