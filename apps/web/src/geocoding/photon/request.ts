import { SUPPORTED_BOUNDS } from '../../region';
import type { GeocodeRequest } from '../types';

/** Suggestions asked for. Photon returns near-duplicates that get merged, so a few more than a list shows. */
export const PHOTON_LIMIT = 8;

/** Decimals kept of the `near` point: ~1 km is plenty for ranking, and the public API learns no more than that. */
const NEAR_DECIMALS = 2;

/** Query for Photon's `/api` search: limited to the supported region, nearby places first. */
export function buildSearchParams({ query, near }: GeocodeRequest): URLSearchParams {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(PHOTON_LIMIT),
    bbox: SUPPORTED_BOUNDS.join(','),
  });
  if (near) {
    params.set('lon', near[0].toFixed(NEAR_DECIMALS));
    params.set('lat', near[1].toFixed(NEAR_DECIMALS));
  }
  return params;
}
