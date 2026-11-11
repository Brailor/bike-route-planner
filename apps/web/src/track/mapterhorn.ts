// Mapterhorn's elevation tiles, read in the browser: the same tiles the hillshade draws (ADR 0009, 0011).
import { HILLSHADE_SOURCE } from '../map/layers';
import type { DemTile, ElevationTiles } from './elevation';

const TEMPLATE = HILLSHADE_SOURCE.tiles?.[0] ?? '';

export const mapterhornTiles: ElevationTiles = {
  async tile(z, x, y, signal) {
    const url = TEMPLATE.replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Elevation tile ${z}/${x}/${y}: HTTP ${res.status}`);
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas to read elevation tiles with');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width, height } satisfies DemTile;
  },
};
