// Kept free of React/maplibre imports so e2e tests can use it to place clicks at known coordinates.

/** Vienna; the first target region is Austria. */
export const INITIAL_VIEW = { longitude: 16.37, latitude: 48.21, zoom: 9 };

/** maplibre-gl vector tiles are 512 px, so the world is 512 · 2^zoom px wide. */
const TILE_SIZE = 512;

/**
 * Screen position of [lon, lat] for a map of the given size centred on `view` (Web Mercator, no rotation or pitch).
 */
export function projectToScreen(
  [lon, lat]: [number, number],
  size: { width: number; height: number },
  view: { longitude: number; latitude: number; zoom: number } = INITIAL_VIEW,
): { x: number; y: number } {
  const worldSize = TILE_SIZE * 2 ** view.zoom;
  const mercator = (lo: number, la: number) => {
    const sin = Math.sin((la * Math.PI) / 180);
    return {
      x: ((lo + 180) / 360) * worldSize,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize,
    };
  };
  const p = mercator(lon, lat);
  const c = mercator(view.longitude, view.latitude);
  return { x: size.width / 2 + p.x - c.x, y: size.height / 2 + p.y - c.y };
}
