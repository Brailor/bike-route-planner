import { useEffect, useState } from 'react';
import { usePlanner } from '../state/store';
import { PhotonGeocoder } from './photon/PhotonGeocoder';
import { GeocodingError, MIN_QUERY_LENGTH, type Geocoder, type Place } from './types';

const defaultGeocoder = new PhotonGeocoder();

/** Typing pauses longer than this between words, so most words cost one request; still feels immediate. */
const DEBOUNCE_MS = 250;

export interface PlaceSearch {
  /** The latest answer; kept while the next one loads, so the list doesn't flicker as the user types. */
  places: Place[];
  /** Whether `places` answers the current query, rather than an earlier one. */
  current: boolean;
  error: GeocodingError | undefined;
}

const EMPTY: PlaceSearch = { places: [], current: true, error: undefined };

interface Answer {
  query: string;
  places: Place[];
  error: GeocodingError | undefined;
}

/** Suggestions for `query`, ranked near the map centre; stale requests are aborted. */
export function usePlaceSearch(query: string, geocoder: Geocoder = defaultGeocoder): PlaceSearch {
  const [answer, setAnswer] = useState<Answer>({ query: '', places: [], error: undefined });
  const tooShort = query.trim().length < MIN_QUERY_LENGTH;

  useEffect(() => {
    if (tooShort) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Read when sent, not a dependency: panning the map shouldn't re-run the search.
      const near = usePlanner.getState().mapCentre;
      geocoder.search({ query, near }, controller.signal).then(
        (places) => setAnswer({ query, places, error: undefined }),
        (err: unknown) => {
          if (controller.signal.aborted) return;
          const error =
            err instanceof GeocodingError ? err : new GeocodingError(String(err), 'unavailable');
          setAnswer({ query, places: [], error });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [geocoder, query, tooShort]);

  if (tooShort) return EMPTY;
  const current = answer.query === query;
  return { places: answer.places, current, error: current ? answer.error : undefined };
}
