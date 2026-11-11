// Elevation for an opened track whose file has little or none (ADR 0011): gaps filled in from the neighbours, and a
// track with none at all looked up in elevation tiles (terrarium encoding, as the hillshade uses).
import { cumulativeM } from './sections';

type Coordinates = readonly (readonly number[])[];

/** Tiles are read at this zoom: ~13 m a pixel at 48° N, and the deepest zoom the tiles reach everywhere we route. */
export const ELEVATION_ZOOM = 12;
/** At most this many tiles for one track; a longer one is read a zoom or more further out. */
export const MAX_TILES = 64;

/** An elevation tile's pixels: RGBA, row by row. */
export interface DemTile {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Where elevation tiles come from. */
export interface ElevationTiles {
  tile(z: number, x: number, y: number, signal?: AbortSignal): Promise<DemTile>;
}

/** Metres, from a terrarium pixel. */
export const terrariumM = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/**
 * The track with an elevation on every point: missing ones interpolated along the track from the points either side,
 * or the nearest one at the ends. `undefined` when no point has one.
 */
export function fillGaps(track: Coordinates): number[][] | undefined {
  const known = track.flatMap((p, i) => (p[2] === undefined ? [] : [i]));
  if (known.length === 0) return undefined;
  const along = cumulativeM(track);
  let next = 0; // index into `known` of the first known point at or after i
  return track.map((p, i) => {
    const [lon = 0, lat = 0, ele] = p;
    if (ele !== undefined) return [lon, lat, ele];
    while ((known[next] ?? Infinity) < i) next++;
    const b = known[next];
    const a = known[next - 1];
    const eleAt = (k: number) => track[k]?.[2] ?? 0;
    if (a === undefined) return [lon, lat, eleAt(b ?? 0)];
    if (b === undefined) return [lon, lat, eleAt(a)];
    const span = (along[b] ?? 0) - (along[a] ?? 0);
    const t = span > 0 ? ((along[i] ?? 0) - (along[a] ?? 0)) / span : 0;
    return [lon, lat, eleAt(a) + (eleAt(b) - eleAt(a)) * t];
  });
}

/** Where a point falls in the tile grid at a zoom, for tiles `size` pixels across: the tile, and the pixel in it. */
export function tilePixel([lon = 0, lat = 0]: readonly number[], z: number, size: number) {
  const scale = 2 ** z * size;
  const sin = Math.sin((lat * Math.PI) / 180);
  const worldX = ((lon + 180) / 360) * scale;
  const worldY = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  const x = Math.floor(worldX / size);
  const y = Math.floor(worldY / size);
  return { x, y, px: worldX - x * size, py: worldY - y * size };
}

/** The deepest zoom up to ELEVATION_ZOOM at which the track touches no more than MAX_TILES tiles, and those tiles. */
export function tilesFor(track: Coordinates): { z: number; tiles: [x: number, y: number][] } {
  for (let z = ELEVATION_ZOOM; ; z--) {
    const keys = new Set(track.map((p) => tileKey(tilePixel(p, z, 1))));
    if (keys.size <= MAX_TILES || z === 0)
      return { z, tiles: [...keys].map((k) => k.split('/').map(Number) as [number, number]) };
  }
}

const tileKey = ({ x, y }: { x: number; y: number }) => `${x}/${y}`;

/** The elevation at a point in a tile, interpolated between the four pixel centres around it. */
function sample(tile: DemTile, px: number, py: number): number {
  const at = (x: number, y: number) => {
    const cx = Math.min(tile.width - 1, Math.max(0, x));
    const cy = Math.min(tile.height - 1, Math.max(0, y));
    const o = (cy * tile.width + cx) * 4;
    return terrariumM(tile.data[o] ?? 0, tile.data[o + 1] ?? 0, tile.data[o + 2] ?? 0);
  };
  const x = px - 0.5;
  const y = py - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** The track with elevations looked up in the tiles. Throws when a tile can't be loaded. */
export async function lookUpElevation(
  track: Coordinates,
  source: ElevationTiles,
  signal?: AbortSignal,
): Promise<number[][]> {
  const { z, tiles } = tilesFor(track);
  const loaded = new Map(
    await Promise.all(
      tiles.map(async ([x, y]) => [tileKey({ x, y }), await source.tile(z, x, y, signal)] as const),
    ),
  );
  return track.map((p) => {
    const [lon = 0, lat = 0] = p;
    const tile = loaded.get(tileKey(tilePixel(p, z, 1)));
    if (!tile) throw new Error('A tile was not loaded'); // can't happen: tilesFor covers every point
    const { px, py } = tilePixel(p, z, tile.width);
    return [lon, lat, sample(tile, px, py)];
  });
}

/** Where an opened track's elevation came from: the file, the elevation tiles, or nowhere (no chart then). */
export type TrackElevation = 'file' | 'looked_up' | 'none';

/**
 * An opened track's coordinates with elevation: the file's own, or, when it has none, looked up. When that fails
 * (offline, the tile server down), the track opens without elevation; only an abort is passed on.
 */
export async function withElevation(
  track: Coordinates,
  source: ElevationTiles,
  signal?: AbortSignal,
): Promise<{ coordinates: number[][]; elevation: TrackElevation }> {
  const flat = () => track.map(([lon = 0, lat = 0]) => [lon, lat]);
  if (track.every((p) => p[2] !== undefined))
    return { coordinates: track.map((p) => [...p]), elevation: 'file' };
  try {
    return { coordinates: await lookUpElevation(track, source, signal), elevation: 'looked_up' };
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn('Could not look up elevation:', err);
    return { coordinates: flat(), elevation: 'none' };
  }
}
