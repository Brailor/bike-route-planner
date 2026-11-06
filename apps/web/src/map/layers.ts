// Map backgrounds and the hillshade overlay (ADR 0009). The street map is the base style and stays loaded; the other
// backgrounds are raster layers drawn over it, beneath everything the app draws, with the base style's layers hidden
// (all of them, or all but its labels). Switching the map style instead would strip the app's own layers and
// re-add them in no particular order.
import type {
  LayerSpecification,
  RasterDEMSourceSpecification,
  RasterSourceSpecification,
  VisibilitySpecification,
} from 'maplibre-gl';
import type { MapBackground } from '../types';

const OSM_CREDIT =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>';

export interface Background {
  id: MapBackground;
  label: string;
  /** Tiles drawn over the base style; none for the street map, which is the base style itself. */
  source?: RasterSourceSpecification;
  /** Keep the base style's labels on top, for tiles that have none of their own (aerial photos). */
  labels?: boolean;
}

/**
 * The backgrounds on offer. Satellite needs an ArcGIS Location Platform API key (Esri's terms), so it is offered only
 * when one is configured.
 */
export function backgrounds(esriKey: string | undefined): Background[] {
  return [
    { id: 'map', label: 'Map' },
    {
      id: 'cycling',
      label: 'Cycling',
      source: {
        type: 'raster',
        tiles: ['a', 'b', 'c'].map(
          (s) => `https://${s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`,
        ),
        tileSize: 256,
        maxzoom: 20,
        attribution: `<a href="https://www.cyclosm.org" target="_blank">CyclOSM</a> hosted by <a href="https://openstreetmap.fr" target="_blank">OSM France</a> | Map data ${OSM_CREDIT}`,
      },
    },
    {
      id: 'topo',
      label: 'Topo',
      source: {
        type: 'raster',
        tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        tileSize: 256,
        maxzoom: 17,
        attribution: `Map data ${OSM_CREDIT}, SRTM | Map style © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank">CC-BY-SA</a>)`,
      },
    },
    ...(esriKey
      ? [
          {
            id: 'satellite' as const,
            label: 'Satellite',
            labels: true,
            source: {
              type: 'raster' as const,
              tiles: [
                `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(esriKey)}`,
              ],
              tileSize: 256,
              maxzoom: 19,
              attribution:
                'Powered by <a href="https://www.esri.com" target="_blank">Esri</a> | Esri, Maxar, Earthstar Geographics, and the GIS User Community',
            },
          },
        ]
      : []),
  ];
}

/** The chosen background, or the street map when the choice isn't on offer (e.g. no satellite key any more). */
export function chosenBackground(
  offered: readonly Background[],
  choice: MapBackground | undefined,
): Background {
  return offered.find((b) => b.id === choice) ?? offered[0] ?? { id: 'map', label: 'Map' };
}

/**
 * Open elevation tiles (Mapterhorn: 0.5–1 m lidar in Austria, the 30 m Copernicus model elsewhere), shaded by the map
 * itself. Hungary has tiles to zoom 12 and Austria to 16; past that the map stretches the last zoom it has.
 */
export const HILLSHADE_SOURCE: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
  encoding: 'terrarium',
  tileSize: 512,
  attribution: '<a href="https://mapterhorn.com/attribution" target="_blank">© Mapterhorn</a>',
};

export const HILLSHADE_LAYER = 'hillshade';

/** A layer of the base style, as the map had it when it loaded. */
export interface BaseLayer {
  id: string;
  label: boolean;
  visibility: VisibilitySpecification;
}

/**
 * The base style's layers, read once the style has loaded: every layer except the app's own, which all draw GeoJSON.
 * (Background and hillshade layers are only added after this.)
 */
export function baseLayers(
  layers: readonly LayerSpecification[],
  sourceType: (source: string) => string | undefined,
): BaseLayer[] {
  return layers
    .filter((l) => !('source' in l && sourceType(l.source) === 'geojson'))
    .map((l) => ({
      id: l.id,
      label: l.type === 'symbol',
      visibility: l.layout?.visibility ?? 'visible',
    }));
}

export interface LayerPlan {
  /** Visibility for each base style layer. */
  visibility: Record<string, VisibilitySpecification>;
  /** The layers the background and hillshade layers go beneath. */
  backgroundBefore: string;
  hillshadeBefore: string;
}

/**
 * Where the background and hillshade go, and which base layers stay visible. Both go beneath `firstOwnLayer`, the
 * lowest layer the app draws, and beneath the base style's labels wherever those stay visible, so names are never
 * shaded or covered. Hillshade sits on top of the background.
 */
export function layerPlan(
  background: Background,
  hillshade: boolean,
  base: readonly BaseLayer[],
  firstOwnLayer: string,
): LayerPlan {
  const keepLabels = !background.source || background.labels === true;
  const visibility: Record<string, VisibilitySpecification> = {};
  for (const l of base)
    visibility[l.id] = !background.source || (keepLabels && l.label) ? l.visibility : 'none';
  const firstLabel = keepLabels ? base.find((l) => l.label)?.id : undefined;
  const hillshadeBefore = firstLabel ?? firstOwnLayer;
  return {
    visibility,
    hillshadeBefore,
    backgroundBefore: hillshade ? HILLSHADE_LAYER : hillshadeBefore,
  };
}
