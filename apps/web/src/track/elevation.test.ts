import { describe, expect, it, vi } from 'vitest';
import { at, east } from '../test/metres';
import {
  ELEVATION_ZOOM,
  fillGaps,
  lookUpElevation,
  MAX_TILES,
  terrariumM,
  tilePixel,
  tilesFor,
  withElevation,
  type DemTile,
  type ElevationTiles,
} from './elevation';

/** A terrarium tile `size` pixels across, its elevation given per pixel. */
function tile(metres: (x: number, y: number) => number, size = 4): DemTile {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = metres(x, y) + 32768;
      const o = (y * size + x) * 4;
      data.set([Math.floor(v / 256), Math.floor(v) % 256, Math.round((v % 1) * 256), 255], o);
    }
  return { width: size, height: size, data };
}

/** The point at pixel (px, py) of tile x/y at zoom z. */
function pointAt(z: number, x: number, y: number, px: number, py: number, size = 4) {
  const n = 2 ** z;
  const lon = ((x + px / size) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / size)) / n))) * 180) / Math.PI;
  return [lon, lat];
}

/** Elevation tiles where each pixel column is 100 m higher than the one before. */
function slope() {
  return { tile: vi.fn(() => Promise.resolve(tile((px) => 100 * px))) } satisfies ElevationTiles;
}

// The tile Vienna is on, and the one east of it.
const { x: X, y: Y } = tilePixel(at(0), ELEVATION_ZOOM, 1);

describe('terrariumM', () => {
  it('decodes metres from red, green and blue', () => {
    expect(terrariumM(128, 0, 0)).toBe(0);
    expect(terrariumM(129, 44, 128)).toBe(300.5);
    expect(terrariumM(127, 255, 0)).toBe(-1);
  });
});

describe('fillGaps', () => {
  it('interpolates along the track, by distance', () => {
    const track = [[...at(0), 100], at(100), at(400), [...at(500), 200]];
    expect(fillGaps(track)?.map((p) => p[2])).toEqual([
      100,
      expect.closeTo(120, 6),
      expect.closeTo(180, 6),
      200,
    ]);
  });

  it('takes the nearest one at either end', () => {
    const track = [at(0), at(100), [...at(200), 150], at(300)];
    expect(fillGaps(track)?.map((p) => p[2])).toEqual([150, 150, 150, 150]);
  });

  it('copes with points on top of each other', () => {
    expect(fillGaps([[...at(0), 100], at(0), [...at(0), 200]])?.map((p) => p[2])).toEqual([
      100, 100, 200,
    ]);
  });

  it('keeps known elevations, and has nothing to go on without any', () => {
    const known = [
      [...at(0), 100],
      [...at(10), 110],
    ];
    expect(fillGaps(known)).toEqual(known);
    expect(fillGaps(east(0, 100))).toBeUndefined();
  });
});

describe('tilePixel', () => {
  it('places a point in the tile grid', () => {
    expect(tilePixel([0, 0], 1, 512)).toEqual({ x: 1, y: 1, px: 0, py: 0 });
    expect(tilePixel([-90, 0], 1, 512)).toEqual({ x: 0, y: 1, px: 256, py: 0 });
    const { x, y, px, py } = tilePixel(pointAt(12, 2234, 1420, 1.5, 2.5), 12, 4);
    expect([x, y]).toEqual([2234, 1420]);
    expect(px).toBeCloseTo(1.5, 6);
    expect(py).toBeCloseTo(2.5, 6);
  });
});

describe('tilesFor', () => {
  it('reads each tile a track crosses once, at zoom 12', () => {
    expect(tilesFor(east(0, 1000))).toEqual({ z: 12, tiles: [[X, Y]] });
  });

  it('reads a long track further out, in no more than MAX_TILES tiles', () => {
    const long = east(0, 1_000_000, 1000); // 1000 km east
    const { z, tiles } = tilesFor(long);
    expect(z).toBeLessThan(12);
    expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(tilesFor(long.slice(0, 300)).z).toBe(12); // ~300 km: 49 tiles
  });
});

describe('lookUpElevation', () => {
  it('reads each point’s elevation from its tile, between the pixels around it', async () => {
    const source = slope();
    const track = [
      pointAt(12, X, Y, 1, 2),
      pointAt(12, X, Y, 2, 2),
      // Past the first or last pixel centre: that pixel.
      pointAt(12, X, Y, 0.25, 0.25),
      pointAt(12, X, Y, 3.75, 3.75),
    ];
    const looked = await lookUpElevation(track, source);
    expect(looked.map((p) => p[2])).toEqual([
      expect.closeTo(50, 6),
      expect.closeTo(150, 6),
      expect.closeTo(0, 6),
      expect.closeTo(300, 6),
    ]);
    expect(looked[0]?.slice(0, 2)).toEqual(track[0]);
    expect(source.tile).toHaveBeenCalledExactlyOnceWith(12, X, Y, undefined);
  });

  it('reads each point from its own tile', async () => {
    const source = { tile: vi.fn((_z: number, x: number) => Promise.resolve(tile(() => x - X))) };
    const track = [pointAt(12, X, Y, 2, 2), pointAt(12, X + 1, Y, 2, 2)];
    expect((await lookUpElevation(track, source)).map((p) => p[2])).toEqual([0, 1]);
  });

  it('passes on a failed tile, and the abort signal', async () => {
    const failing = { tile: vi.fn(() => Promise.reject(new Error('HTTP 503'))) };
    await expect(lookUpElevation(east(0, 100), failing)).rejects.toThrow('HTTP 503');
    const signal = new AbortController().signal;
    const source = slope();
    await lookUpElevation(east(0, 100), source, signal);
    expect(source.tile).toHaveBeenCalledWith(12, X, Y, signal);
  });
});

describe('withElevation', () => {
  it('keeps the file’s elevation, without looking anything up', async () => {
    const source = slope();
    const track = [
      [...at(0), 100],
      [...at(10), 110],
    ];
    expect(await withElevation(track, source)).toEqual({ coordinates: track, elevation: 'file' });
    expect(source.tile).not.toHaveBeenCalled();
  });

  it('looks it up for a track without', async () => {
    const { coordinates, elevation } = await withElevation(
      [pointAt(12, X, Y, 2, 2), pointAt(12, X, Y, 3, 2)],
      slope(),
    );
    expect(elevation).toBe('looked_up');
    expect(coordinates.map((p) => p[2])).toEqual([expect.closeTo(150, 6), expect.closeTo(250, 6)]);
  });

  it('opens it without elevation when there’s none to be had', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = { tile: () => Promise.reject(new Error('offline')) };
    const track = east(0, 20);
    expect(await withElevation(track, failing)).toEqual({ coordinates: track, elevation: 'none' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('passes an abort on', async () => {
    const controller = new AbortController();
    const aborting = {
      tile: () => {
        controller.abort();
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      },
    };
    await expect(withElevation(east(0, 20), aborting, controller.signal)).rejects.toThrow(
      'aborted',
    );
  });
});
