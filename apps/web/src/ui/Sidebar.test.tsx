import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoutingError } from '../routing/types';
import { usePlanner } from '../state/store';
import { fixtureRoute } from '../test/route';
import { Sidebar } from './Sidebar';

const store = () => usePlanner.getState();

function withTwoWaypoints() {
  store().addWaypoint([16.5, 48.2]);
  store().addWaypoint([16.6, 48.2]);
}

describe('Sidebar', () => {
  it('guides through placing the first two points', () => {
    render(<Sidebar />);
    expect(screen.getByText('Click the map to set a start point.')).toBeInTheDocument();
    act(() => store().addWaypoint([16.5, 48.2]));
    expect(screen.getByText('Click again to set the destination.')).toBeInTheDocument();
  });

  it('shows progress while routing', () => {
    withTwoWaypoints();
    store().setRouteLoading();
    render(<Sidebar />);
    // Not getByRole('status'): the slider's <output> also has that role.
    expect(screen.getByText('Routing…')).toHaveAttribute('role', 'status');
  });

  it.each([
    ['unavailable', 'pnpm routing:start'],
    ['no_route', 'No route between these points'],
    ['bad_request', 'Routing failed: details'],
  ] as const)('explains %s errors', (kind, text) => {
    withTwoWaypoints();
    store().setRouteError(new RoutingError('details', kind));
    render(<Sidebar />);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('shows the route summary once routed', () => {
    withTwoWaypoints();
    store().setRoute(fixtureRoute);
    render(<Sidebar />);
    expect(screen.getByTestId('stat-distance')).toHaveTextContent('3.4 km');
    expect(screen.queryByText('Routing…')).not.toBeInTheDocument();
  });

  it('enables undo/redo only when there is something to undo/redo', async () => {
    render(<Sidebar />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    act(() => store().addWaypoint([16.5, 48.2]));
    expect(undo).toBeEnabled();
    await userEvent.click(undo);
    expect(store().waypoints).toEqual([]);
    expect(redo).toBeEnabled();
    await userEvent.click(redo);
    expect(store().waypoints).toEqual([[16.5, 48.2]]);
  });

  it('clears all waypoints, undoably', async () => {
    withTwoWaypoints();
    render(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(store().waypoints).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(store().waypoints).toHaveLength(2);
  });
});
