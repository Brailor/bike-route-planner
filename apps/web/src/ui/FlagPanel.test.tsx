import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { selectionLengthM } from '../flags/selection';
import { usePlanner } from '../state/store';
import { fixtureRoute } from '../test/route';
import { FlagPanel } from './FlagPanel';
import { formatDistance } from './format';

const store = () => usePlanner.getState();

function renderPanel() {
  store().setRoute(fixtureRoute);
  render(<FlagPanel route={fixtureRoute} />);
}

describe('FlagPanel', () => {
  it('starts a selection on the route', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    expect(store().flagSelection).toBeDefined();
    expect(screen.getByText(/Drag the two handles/)).toBeInTheDocument();
  });

  it('shows the selected length as the handles move', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    const coordinates = fixtureRoute.geometry.coordinates;
    expect(screen.getByTestId('flag-length')).toHaveTextContent(
      formatDistance(selectionLengthM(coordinates, store().flagSelection!)),
    );

    act(() => {
      store().moveFlagHandle('a', 0);
      store().moveFlagHandle('b', coordinates.length - 1);
    });
    // The whole route.
    expect(screen.getByTestId('flag-length')).toHaveTextContent('3.4 km');
  });

  it('cancels with the button or Esc', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store().flagSelection).toBeUndefined();

    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    await userEvent.keyboard('{Escape}');
    expect(store().flagSelection).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Flag a section' })).toBeInTheDocument();
  });
});
