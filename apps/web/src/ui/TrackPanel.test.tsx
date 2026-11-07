import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import { at, east, flagOn } from '../test/metres';
import { spliceDetour } from '../track/sections';
import { Sidebar } from './Sidebar';

vi.mock('../gpx/download', () => ({ downloadGpx: vi.fn() }));
const { downloadGpx } = await import('../gpx/download');

const state = () => usePlanner.getState();
const TRACK = east(0, 1000);
const FLAGS = [
  { ...flagOn('first', east(200, 300, 50)), reason: 'overgrown' as const, note: 'nettles' },
  flagOn('second', east(700, 800, 50)),
];

const gpx = (points: number[][]) =>
  new File(
    [
      `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Sunday ride</name><trkseg>${points
        .map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`)
        .join('')}</trkseg></trk></gpx>`,
    ],
    'ride.gpx',
  );

async function openTrack(points = TRACK) {
  const user = userEvent.setup();
  state().loadFlags(FLAGS);
  render(<Sidebar />);
  await user.upload(screen.getByLabelText('Open GPX'), gpx(points));
  await screen.findByRole('region', { name: 'Opened track' });
  return user;
}

const question = () => screen.getByRole('group', { name: 'Flagged section' });

describe('opening a GPX track', () => {
  it('shows the track in place of the route, and asks about the first flagged section', async () => {
    await openTrack();
    expect(screen.getByTestId('track-name')).toHaveTextContent('Sunday ride');
    expect(screen.getByTestId('track-distance')).toHaveTextContent('1.0 km');
    expect(screen.getByTestId('track-flag-count')).toHaveTextContent(
      'Runs along 2 flagged sections.',
    );
    const sections = screen.getAllByTestId('track-section');
    expect(sections.map((s) => s.textContent)).toEqual(['1. Overgrown“nettles”', '2. Flagged']);
    expect(sections[0]).toHaveAttribute('aria-current', 'true');
    expect(question()).toHaveTextContent('Section 1 of 2 (Overgrown): reroute around it');
    expect(within(question()).getByRole('button', { name: 'Reroute all 2' })).toBeEnabled();
    expect(screen.queryByRole('region', { name: 'Flags' })).not.toBeInTheDocument();
  });

  it('hides the hint about clicking the map, which doesn’t take waypoints meanwhile', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    expect(screen.getByText('Click the map to set a start point.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Open GPX'), gpx(TRACK));
    await screen.findByRole('region', { name: 'Opened track' });
    expect(screen.queryByText('Click the map to set a start point.')).toBeNull();
  });

  it('says so when the track runs along no flag', async () => {
    await openTrack(east(0, 1000, 10, 200));
    expect(
      screen.getByText('This track doesn’t run along any of your flagged sections.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Flagged section' })).not.toBeInTheDocument();
  });

  it('shows why a file can’t be opened', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.upload(screen.getByLabelText('Open GPX'), new File(['<workout_file/>'], 'a.gpx'));
    expect(await screen.findByRole('alert')).toHaveTextContent('This isn’t a GPX file.');
    expect(state().track).toBeUndefined();
  });

  it('keeps a section, and offers the last one without “all”', async () => {
    const user = await openTrack();
    await user.click(within(question()).getByRole('button', { name: 'Keep it' }));
    expect(screen.getAllByTestId('track-section')[0]).toHaveTextContent('Kept');
    expect(question()).toHaveTextContent('Section 2 of 2');
    expect(within(question()).queryByRole('button', { name: /Reroute all/ })).toBeNull();
    await user.click(within(question()).getByRole('button', { name: 'Keep it' }));
    expect(screen.getByText('Every section answered.')).toBeInTheDocument();
  });

  it('asks the store to reroute one section, or all, and shows the answers', async () => {
    const user = await openTrack();
    await user.click(within(question()).getByRole('button', { name: 'Reroute around it' }));
    expect(state().track?.rerouting).toBe('one');
    expect(within(question()).getByRole('status')).toHaveTextContent('Finding a way around…');
    expect(screen.getByRole('button', { name: 'Export GPX' })).toBeDisabled();

    const track = state().track;
    const section = track?.sections[0];
    if (!track || !section) throw new Error('no section');
    const splice = spliceDetour(
      track.coordinates,
      section,
      { min: 0, max: 50 },
      [14, 36],
      [at(140, 100), at(360, 100)],
    );
    act(() => state().setSectionResult(track.id, 0, { outcome: 'rerouted', splice }));
    expect(screen.getAllByTestId('track-section')[0]).toHaveTextContent('Rerouted, +200 m');

    await user.click(within(question()).getByRole('button', { name: 'Reroute around it' }));
    act(() => state().setSectionResult(track.id, 1, { outcome: 'no_way_around' }));
    expect(screen.getAllByTestId('track-section')[1]).toHaveTextContent('No way around, kept');
  });

  it('shows why rerouting failed, and lets the user try again', async () => {
    const user = await openTrack();
    await user.click(within(question()).getByRole('button', { name: 'Reroute all 2' }));
    expect(state().track?.rerouting).toBe('all');
    const id = state().track?.id ?? '';
    act(() => state().setSectionResult(id, 0, { outcome: 'failed', error: 'Engine down' }));
    expect(within(question()).getByRole('alert')).toHaveTextContent('Engine down');
    await user.click(within(question()).getByRole('button', { name: 'Reroute around it' }));
    expect(within(question()).queryByRole('alert')).toBeNull();
  });

  it('shows a section on the map when picked', async () => {
    const user = await openTrack();
    const second = state().track?.sections[1];
    await user.click(screen.getAllByTestId('track-section')[1]!.querySelector('button')!);
    expect(state().mapFocus?.points).toEqual(
      TRACK.slice(second?.from, (second?.to ?? 0) + 1).map(([lon, lat]) => [lon, lat]),
    );
  });

  it('exports the track as it now is, and closes', async () => {
    const user = await openTrack();
    await user.click(screen.getByRole('button', { name: 'Export GPX' }));
    expect(downloadGpx).toHaveBeenCalledWith('Sunday ride', state().track?.coordinates);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(state().track).toBeUndefined());
    expect(screen.queryByRole('region', { name: 'Opened track' })).not.toBeInTheDocument();
  });

  it('Clear in the header removes the track, even with no route', async () => {
    const user = await openTrack();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(state().track).toBeUndefined();
    expect(screen.queryByRole('region', { name: 'Opened track' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });
});
