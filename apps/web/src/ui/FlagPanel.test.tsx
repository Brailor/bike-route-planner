import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { selectionLengthM } from '../flags/selection';
import { usePlanner } from '../state/store';
import { fixtureRoute } from '../test/route';
import flaggedStart from '../routing/graphhopper/__fixtures__/gravel-flagged-start.json';
import flagged from '../routing/graphhopper/__fixtures__/gravel-flagged.json';
import { mapRouteResponse, type GhRouteResponse } from '../routing/graphhopper/response';
import type { AvoidFlag } from '../types';
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

describe('FlagPanel saving', () => {
  it('saves the selection with a reason and note, then shows the count', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Reason (optional)' }),
      'Overgrown',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Note (optional)' }), 'nettles');
    await userEvent.click(screen.getByRole('button', { name: 'Flag & reroute' }));

    expect(store().flagSelection).toBeUndefined();
    expect(store().flags).toHaveLength(1);
    expect(store().flags[0]).toMatchObject({ reason: 'overgrown', note: 'nettles' });
    expect(screen.getByTestId('flag-count')).toHaveTextContent('1 flagged section');

    // The next flag starts with an empty form.
    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    expect(screen.getByRole('combobox', { name: 'Reason (optional)' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Note (optional)' })).toHaveValue('');
  });

  it('saves without details', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    await userEvent.click(screen.getByRole('button', { name: 'Flag & reroute' }));
    expect(Object.keys(store().flags[0]!)).not.toContain('reason');
  });

  it('cannot save an empty stretch', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Flag a section' }));
    act(() => store().moveFlagHandle('b', store().flagSelection!.a));
    expect(screen.getByRole('button', { name: 'Flag & reroute' })).toBeDisabled();
  });

  it('shows the count without a route, but nothing to flag', () => {
    store().loadFlags([
      { id: 'f', geometry: fixtureRoute.geometry, createdAt: '2026-11-02T00:00:00Z' },
    ]);
    render(<FlagPanel route={undefined} />);
    expect(screen.getByTestId('flag-count')).toHaveTextContent('1 flagged section');
    expect(screen.queryByRole('button', { name: 'Flag a section' })).not.toBeInTheDocument();
  });
});

describe('FlagPanel warning', () => {
  const flags = flaggedStart.input.flags as unknown as AvoidFlag[];
  const unavoidable = mapRouteResponse(flaggedStart.response as unknown as GhRouteResponse);

  it('warns when the route still runs over a flag', () => {
    store().loadFlags(flags);
    render(<FlagPanel route={unavoidable} />);
    expect(screen.getByRole('alert')).toHaveTextContent('still uses a flagged section');
  });

  it('stays quiet when the route went around the flag', () => {
    store().loadFlags(flagged.input.flags as unknown as AvoidFlag[]);
    render(<FlagPanel route={mapRouteResponse(flagged.response as unknown as GhRouteResponse)} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
