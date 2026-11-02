import {
  GeocodingError,
  MIN_QUERY_LENGTH,
  type GeocodeRequest,
  type Geocoder,
  type Place,
} from '../types';
import { buildSearchParams } from './request';
import { mapSearchResponse, type PhotonResponse } from './response';

export class PhotonGeocoder implements Geocoder {
  /** `baseUrl` defaults to the Vite dev proxy (`/geo` → photon.komoot.io). */
  constructor(
    private readonly baseUrl = '/geo',
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  async search(request: GeocodeRequest, signal?: AbortSignal): Promise<Place[]> {
    if (request.query.trim().length < MIN_QUERY_LENGTH) return [];

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/api?${buildSearchParams(request)}`, { signal });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new GeocodingError('The address search is not reachable', 'unavailable');
    }

    // 429 is Photon's rate limit: the service is fine, but not for us right now.
    if (!res.ok) {
      const kind = res.status >= 500 || res.status === 429 ? 'unavailable' : 'bad_request';
      throw new GeocodingError(`Address search failed (HTTP ${res.status})`, kind);
    }
    const json = (await res.json().catch(() => undefined)) as PhotonResponse | undefined;
    if (!json?.features)
      throw new GeocodingError('Address search sent an unreadable answer', 'unavailable');
    return mapSearchResponse(json);
  }
}
