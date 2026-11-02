import { useId, useState, type KeyboardEvent } from 'react';
import { MIN_QUERY_LENGTH, type Geocoder, type Place } from '../geocoding/types';
import { usePlaceSearch } from '../geocoding/usePlaceSearch';
import { SUPPORTED_REGION_NAME } from '../region';

interface Props {
  label: string;
  /** Shown while the field isn't being edited: the current point's name. */
  value: string;
  placeholder: string;
  disabled?: boolean;
  onPick: (place: Place) => void;
  geocoder?: Geocoder;
}

/** A text field with address suggestions (ARIA combobox). Picking one calls `onPick`; leaving it restores `value`. */
export function AddressField({ label, value, placeholder, disabled, onPick, geocoder }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  /** What's in the box while editing; undefined when not editing, so the box shows `value`. */
  const [text, setText] = useState<string>();
  /** Only what the user typed is searched: focusing a filled field doesn't send its name. */
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { places, current, error } = usePlaceSearch(query, geocoder);

  const editing = text !== undefined;
  /** Whether there's an answer to show for what's typed (the previous one counts while the next loads). */
  const searched =
    editing && query.trim().length >= MIN_QUERY_LENGTH && (places.length > 0 || current);
  const open = searched && places.length > 0;

  function close() {
    setText(undefined);
    setQuery('');
    setActive(0);
  }

  function pick(place: Place | undefined) {
    if (!place) return;
    onPick(place);
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + places.length) % places.length);
    } else if (e.key === 'Enter') {
      if (open) pick(places[active]);
    } else if (e.key === 'Escape') {
      close();
      e.currentTarget.blur();
    }
  }

  return (
    <div className="address">
      <label htmlFor={id} className="address__label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className="address__input"
        placeholder={placeholder}
        disabled={disabled}
        value={text ?? value}
        onFocus={(e) => {
          setText(value);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setQuery(e.target.value);
          setActive(0);
        }}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        className="address__list"
        hidden={!open}
      >
        {open &&
          places.map((place, i) => (
            <li
              key={`${place.name}\n${place.detail}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="address__option"
              // On mousedown, before the input loses focus (which closes the list); kept in the input, as after Enter.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(place);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="address__name">{place.name}</span>
              {place.detail && <span className="address__detail">{place.detail}</span>}
            </li>
          ))}
      </ul>
      {searched && !open && (
        <p className={error ? 'address__note address__note--error' : 'address__note'} role="status">
          {error
            ? error.kind === 'unavailable'
              ? 'Address search isn’t available right now.'
              : 'Address search failed.'
            : `No matches in ${SUPPORTED_REGION_NAME}.`}
        </p>
      )}
    </div>
  );
}
