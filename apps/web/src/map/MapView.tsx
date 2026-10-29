import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Map, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Vienna; the first target region is Austria.
const INITIAL_VIEW = { longitude: 16.37, latitude: 48.21, zoom: 9 };

export function MapView() {
  return (
    <Map
      initialViewState={INITIAL_VIEW}
      mapStyle={STYLE_URL}
      style={{ width: '100%', height: '100%' }}
      // maplibre-gl resolves its worker relative to its own module, which breaks once Vite pre-bundles (dev) or
      // bundles (build) it. Hand it the worker as a Vite-managed asset instead.
      workerUrl={workerUrl}
      // Expanded (not compact) so the OpenStreetMap attribution required by ODbL is always visible.
      attributionControl={{ compact: false }}
    >
      <NavigationControl position="top-right" />
      <ScaleControl position="bottom-left" unit="metric" />
    </Map>
  );
}
