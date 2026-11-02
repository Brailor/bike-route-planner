// Engine-neutral geocoding contract (ADR 0006), like routing's (ADR 0003). The UI only ever sees these types.
import type { LonLat } from '../types';

/** Shorter queries match half the map; geocoders answer them with no places, without asking the service. */
export const MIN_QUERY_LENGTH = 3;

export interface GeocodeRequest {
  query: string;
  /** Ranks nearby places first, e.g. the map centre. */
  near?: LonLat;
}

export interface Place {
  /** First line: the place's name, or street and house number for a plain address. */
  name: string;
  /** Second line: where it is (street, postcode and town, country). May be empty. */
  detail: string;
  point: LonLat;
}

export interface Geocoder {
  /** Suggestions for a partly typed query, best first. */
  search(request: GeocodeRequest, signal?: AbortSignal): Promise<Place[]>;
}

export class GeocodingError extends Error {
  constructor(
    message: string,
    /** 'unavailable' when the service can't be reached or is overloaded. */
    readonly kind: 'unavailable' | 'bad_request',
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}
