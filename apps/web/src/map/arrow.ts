// The direction arrow drawn along routes and loops: a chevron pointing right (the line's direction once maplibre
// rotates it), dark with a white outline so it reads on every surface colour. Drawn as pixels here, as the map style
// has no arrow icon.

export const ARROW_IMAGE = 'direction-arrow';

const DARK = [31, 41, 51]; // --fg
const WHITE = [255, 255, 255];

/** Distance from (px, py) to the segment a–b. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** RGBA pixels of a `size`×`size` chevron ">", for `map.addImage`. Edges are softened over a pixel. */
export function arrowImage(size: number): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  const tip = [0.72 * size, 0.5 * size] as const;
  const top = [0.32 * size, 0.14 * size] as const;
  const bottom = [0.32 * size, 0.86 * size] as const;
  const stroke = 0.07 * size; // half the dark line's width
  const outline = stroke + 0.07 * size; // half the white outline's width
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.min(toSegment(px, py, ...top, ...tip), toSegment(px, py, ...tip, ...bottom));
      const alpha = Math.max(0, Math.min(1, outline - d + 0.5));
      if (alpha === 0) continue;
      // Dark inside the stroke, blending to white across its edge.
      const dark = Math.max(0, Math.min(1, stroke - d + 0.5));
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++)
        data[i + c] = Math.round((DARK[c] ?? 0) * dark + (WHITE[c] ?? 0) * (1 - dark));
      data[i + 3] = Math.round(alpha * 255);
    }
  return { width: size, height: size, data };
}
