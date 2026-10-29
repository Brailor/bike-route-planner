import type { SurfaceCategory } from '../route/surface';

export const SURFACE_COLORS: Record<SurfaceCategory, string> = {
  paved: '#3f4a5a',
  gravel: '#c27c0e',
  ground: '#2f7d4f',
  unknown: '#9aa5b1',
};

export const SURFACE_LABELS: Record<SurfaceCategory, string> = {
  paved: 'Paved',
  gravel: 'Gravel',
  ground: 'Ground',
  unknown: 'Unknown',
};
