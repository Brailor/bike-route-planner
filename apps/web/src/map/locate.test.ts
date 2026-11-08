import { describe, expect, it, vi } from 'vitest';
import { currentPosition } from './locate';

const geolocation = (
  answer: (success: PositionCallback, error: PositionErrorCallback) => void,
): Geolocation => ({
  getCurrentPosition: (success, error) => answer(success, error ?? (() => undefined)),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
});

describe('currentPosition', () => {
  it('returns [lon, lat]', async () => {
    const located = geolocation((success) =>
      success({ coords: { longitude: 15.44, latitude: 47.07 } } as GeolocationPosition),
    );
    expect(await currentPosition(located)).toEqual([15.44, 47.07]);
  });

  it('passes the timeout and accepts a recent cached fix', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { longitude: 0, latitude: 0 } } as GeolocationPosition),
    );
    const located = { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() };
    await currentPosition(located, { timeoutMs: 1234 });
    expect(getCurrentPosition).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        timeout: 1234,
        maximumAge: 600_000,
      },
    );
    await currentPosition(located, { maxAgeMs: 0 });
    expect(getCurrentPosition).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        timeout: 10_000,
        maximumAge: 0,
      },
    );
  });

  it('gives up quietly when denied, unavailable or timed out', async () => {
    const denied = geolocation((_, error) =>
      error({ code: 1, message: 'denied' } as GeolocationPositionError),
    );
    expect(await currentPosition(denied)).toBeUndefined();
  });

  it('copes with browsers without geolocation', async () => {
    expect(await currentPosition(undefined)).toBeUndefined();
  });
});
