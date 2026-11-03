import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Geocoder, Place } from '../geocoding/types';
import { usePlanner } from '../state/store';
import { fixtureRoute } from '../test/route';
import { RouteEnds } from './RouteEnds';

const store = () => usePlanner.getState();

const GRAZ: Place = { name: 'Graz', detail: 'Österreich', point: [15.44, 47.07] };
const geocoder: Geocoder = { search: () => Promise.resolve([GRAZ]) };

const field = (name: 'Start' | 'Destination') => screen.getByRole('combobox', { name });

describe('RouteEnds', () => {
  it('needs a start before a destination', () => {
    render(<RouteEnds geocoder={geocoder} />);
    expect(field('Start')).toBeEnabled();
    expect(field('Destination')).toBeDisabled();
    act(() => store().addWaypoint([16.37, 48.21]));
    expect(field('Destination')).toBeEnabled();
  });

  it('fills the start from a search, and shows map-placed points as such', async () => {
    render(<RouteEnds geocoder={geocoder} />);
    await userEvent.type(field('Start'), 'graz');
    await userEvent.click(await screen.findByRole('option'));
    expect(store().waypoints).toEqual([GRAZ.point]);
    expect(field('Start')).toHaveValue('Graz');

    act(() => store().addWaypoint([16.37, 48.21]));
    expect(field('Destination')).toHaveValue('Point on map');
  });

  it('sets the destination after the start', async () => {
    store().addWaypoint([16.37, 48.21]);
    render(<RouteEnds geocoder={geocoder} />);
    await userEvent.type(field('Destination'), 'graz');
    await userEvent.click(await screen.findByRole('option'));
    expect(store().waypoints).toEqual([[16.37, 48.21], GRAZ.point]);
    expect(field('Destination')).toHaveValue('Graz');
  });

  it('is frozen while a flag is being marked on the map', () => {
    store().addWaypoint([16.37, 48.21]);
    store().startFlagDraft();
    render(<RouteEnds geocoder={geocoder} />);
    expect(field('Start')).toBeDisabled();
  });

  it('is frozen while a flag is being placed', () => {
    store().addWaypoint([16.37, 48.21]);
    store().addWaypoint([16.6, 48.2]);
    store().setRoute(fixtureRoute);
    store().startFlagSelection();
    render(<RouteEnds geocoder={geocoder} />);
    expect(field('Start')).toBeDisabled();
    expect(field('Destination')).toBeDisabled();
  });
});
