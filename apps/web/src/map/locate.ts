import type { LonLat } from '../types';

/** A fix up to this old is good enough to centre the map on when it opens. */
const MAX_AGE_MS = 10 * 60_000;

/**
 * The browser's idea of where the user is. Resolves `undefined` when it's denied, unavailable or slower than
 * `timeoutMs`; never rejects. The position stays in the browser: nothing here sends it anywhere.
 */
export function currentPosition(
  geolocation: Geolocation | undefined = navigator.geolocation,
  { timeoutMs = 10_000, maxAgeMs = MAX_AGE_MS }: { timeoutMs?: number; maxAgeMs?: number } = {},
): Promise<LonLat | undefined> {
  return new Promise((resolve) => {
    if (!geolocation) {
      resolve(undefined);
      return;
    }
    geolocation.getCurrentPosition(
      ({ coords }) => resolve([coords.longitude, coords.latitude]),
      () => resolve(undefined),
      { timeout: timeoutMs, maximumAge: maxAgeMs },
    );
  });
}
