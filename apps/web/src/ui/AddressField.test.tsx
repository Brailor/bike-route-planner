import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GeocodingError, type Geocoder, type Place } from '../geocoding/types';
import { AddressField } from './AddressField';

const PLACES: Place[] = [
  { name: 'Graz', detail: 'Steiermark, Österreich', point: [15.44, 47.07] },
  { name: 'Graz Hauptbahnhof', detail: 'Annenstraße, 8020 Graz', point: [15.41, 47.07] },
];

/** `answer` is what the fake geocoder replies to every search. */
function renderField(props: { value?: string; answer?: Geocoder['search'] } = {}) {
  const onPick = vi.fn();
  const search = vi.fn<Geocoder['search']>(props.answer ?? (() => Promise.resolve(PLACES)));
  render(
    <AddressField
      label="Start"
      value={props.value ?? ''}
      placeholder="Search"
      onPick={onPick}
      geocoder={{ search }}
    />,
  );
  return { onPick, search, input: screen.getByRole('combobox', { name: 'Start' }) };
}

describe('AddressField', () => {
  it('suggests places as the user types and picks one by click', async () => {
    const { onPick, input } = renderField();
    await userEvent.type(input, 'graz');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'GrazSteiermark, Österreich',
      'Graz HauptbahnhofAnnenstraße, 8020 Graz',
    ]);
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(options[1]!);
    expect(onPick).toHaveBeenCalledWith(PLACES[1]);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('picks with the keyboard', async () => {
    const { onPick, input } = renderField();
    await userEvent.type(input, 'graz');
    await screen.findAllByRole('option');
    await userEvent.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]!.id);
    // Wraps both ways: down past the last goes to the first, up past the first to the last.
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(onPick).toHaveBeenCalledWith(PLACES[1]);
  });

  it('shows the current name, and puts it back when left without picking', async () => {
    const { onPick, input } = renderField({ value: 'Wien' });
    expect(input).toHaveValue('Wien');
    await userEvent.type(input, 'graz');
    await screen.findAllByRole('option');
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveValue('Wien');
    expect(onPick).not.toHaveBeenCalled();

    await userEvent.type(input, 'graz');
    await userEvent.tab();
    expect(input).toHaveValue('Wien');
  });

  it('does not search for the current name when focused', async () => {
    const { search, input } = renderField({ value: 'Wien Hauptbahnhof' });
    await userEvent.click(input);
    await new Promise((r) => setTimeout(r, 400));
    expect(search).not.toHaveBeenCalled();
  });

  it('says when nothing matches', async () => {
    const { input } = renderField({ answer: () => Promise.resolve([]) });
    await userEvent.type(input, 'qxzv');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No matches in Austria or Hungary.',
    );
  });

  it('says when the search is down', async () => {
    const { input } = renderField({
      answer: () => Promise.reject(new GeocodingError('down', 'unavailable')),
    });
    await userEvent.type(input, 'graz');
    expect(await screen.findByRole('status')).toHaveTextContent('isn’t available right now');
  });

  it('stays quiet until the query is long enough to search', async () => {
    const { search, input } = renderField();
    await userEvent.type(input, 'gr');
    await new Promise((r) => setTimeout(r, 400));
    expect(search).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
