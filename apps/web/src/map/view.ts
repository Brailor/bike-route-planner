// Kept free of React/maplibre imports so e2e tests can use it to place clicks at known coordinates.

/** Vienna. Where the map opens unless the user's location is known and inside the supported region. */
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

/**
 * Margins (px) when fitting points into view, keeping them clear of the side panel: 320 px wide plus its 12 px
 * inset on wide screens, a bottom sheet of up to half the height on narrow ones (index.css).
 */
export function focusPadding(width: number, height: number) {
  return width > 640
    ? { top: 60, right: 60, bottom: 60, left: 332 + 60 }
    : { top: 40, right: 40, bottom: height / 2 + 40, left: 40 };
}
