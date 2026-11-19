import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { usePlanner } from '../state/store';
import { SavedRouteList, SaveRouteButton } from './SavedRoutes';

const LINE = [
  [16.37, 48.2, 180],
  [16.38, 48.2, 185],
];
const state = () => usePlanner.getState();

describe('SaveRouteButton', () => {
  it('saves under the suggested name, or one the user types', async () => {
    const user = userEvent.setup();
    render(<SaveRouteButton name="Gravel route 741 m" coordinates={LINE} elevation="file" />);
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Gravel route 741 m');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved to your routes.');

    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Wienerwald{Enter}');
    expect(state().savedRoutes.map((r) => [r.name, r.elevation])).toEqual([
      ['Gravel route 741 m', 'file'],
      ['Wienerwald', 'file'],
    ]);
  });

  it('saves nothing when cancelled or left without a name', async () => {
    const user = userEvent.setup();
    render(<SaveRouteButton name="Loop" coordinates={LINE} elevation="none" />);
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), '   {Enter}');
    expect(state().savedRoutes).toEqual([]);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('SavedRouteList', () => {
  it('shows nothing until a route is saved', () => {
    const { container } = render(<SavedRouteList />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the newest first; picking one opens it as a track', async () => {
    const user = userEvent.setup();
    state().saveRoute('Older', LINE, 'file');
    state().saveRoute('Newer', LINE, 'file');
    render(<SavedRouteList />);
    const names = screen.getAllByTitle('Open as a track').map((b) => b.textContent);
    expect(names).toEqual(['Newer · 741 m', 'Older · 741 m']);
    await user.click(screen.getByRole('button', { name: /^Older/ }));
    expect(state().track?.name).toBe('Older');
  });

  it('deletes a route only once confirmed', async () => {
    const user = userEvent.setup();
    state().saveRoute('Lobau', LINE, 'file');
    render(<SavedRouteList />);
    await user.click(screen.getByRole('button', { name: 'Delete Lobau' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(state().savedRoutes).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Delete Lobau' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(state().savedRoutes).toEqual([]);
    expect(screen.queryByRole('region', { name: 'Saved routes' })).toBeNull();
  });
});
