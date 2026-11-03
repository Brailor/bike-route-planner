import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { usePlanner } from '../state/store';
import { fixtureRoute } from '../test/route';
import { FlagList } from './FlagList';

const store = () => usePlanner.getState();

/** Two flags on the fixture route: a private one with a note, and one without details. */
function withFlags() {
  store().setRoute(fixtureRoute);
  store().startFlagSelection();
  store().confirmFlag({ reason: 'private', note: 'gate locked' });
  store().startFlagSelection();
  store().confirmFlag({});
  render(<FlagList />);
  return store().flags.map((f) => f.id) as [string, string];
}

const item = (name: RegExp) => screen.getByRole('button', { name });

describe('FlagList', () => {
  it('shows nothing without flags', () => {
    const { container } = render(<FlagList />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each flag with its reason, length and note', () => {
    withFlags();
    expect(screen.getByTestId('flag-count')).toHaveTextContent('2 flagged sections');
    expect(item(/^Private · \d/)).toHaveTextContent('gate locked');
    expect(item(/^Flagged section · \d/)).toBeInTheDocument();
  });

  it('opens a flag for editing and shows it on the map', async () => {
    const [a] = withFlags();
    await userEvent.click(item(/^Private/));
    expect(store().editingFlagId).toBe(a);
    expect(store().mapFocus?.points).toHaveLength(store().flags[0]!.geometry.coordinates.length);
    expect(screen.getByRole('combobox', { name: 'Reason (optional)' })).toHaveValue('private');
    expect(screen.getByRole('textbox', { name: 'Note (optional)' })).toHaveValue('gate locked');
  });

  it('saves edited details', async () => {
    const [a] = withFlags();
    await userEvent.click(item(/^Private/));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Reason (optional)' }),
      'Too steep',
    );
    await userEvent.clear(screen.getByRole('textbox', { name: 'Note (optional)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(store().flags.find((f) => f.id === a)).toMatchObject({ reason: 'too_steep' });
    expect(store().flags.find((f) => f.id === a)).not.toHaveProperty('note');
    expect(item(/^Too steep/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('starts the form from the flag that was opened', async () => {
    withFlags();
    await userEvent.click(item(/^Private/));
    await userEvent.click(item(/^Flagged section/));
    expect(screen.getByRole('combobox', { name: 'Reason (optional)' })).toHaveValue('');
  });

  it('asks before deleting, and can keep the flag', async () => {
    const [a, b] = withFlags();
    await userEvent.click(item(/^Private/));
    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(store().flags).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store().flags.map((f) => f.id)).toEqual([b]);
    expect(screen.getByTestId('flag-count')).toHaveTextContent('1 flagged section');
    expect(a).not.toBe(b);
  });

  it('hides and shows the layer, noting that hidden flags still apply', async () => {
    withFlags();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show on map' }));
    expect(store().flagsVisible).toBe(false);
    expect(screen.getByText('Hidden flags still apply to every route.')).toBeInTheDocument();

    // Opening a flag shows the layer again: it's highlighted there.
    await userEvent.click(item(/^Private/));
    expect(store().flagsVisible).toBe(true);
  });

  it('follows a flag opened from the map', () => {
    const [, b] = withFlags();
    act(() => store().editFlag(b));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(item(/^Flagged section/).closest('li')).toHaveAttribute('aria-current', 'true');
  });
});
