# 0009: Map backgrounds and hillshade, layered over the street map

- Status: accepted
- Date: 2026-11-04

## Context

The user asked for different map layers: a cycling map, a topographic map and satellite photos to pick from, and
hillshade over any of them. All of them have to be free to use from a web app without a contract, and credit their
sources on the map. The app's own layers (route, loops, flags, direction arrows) must stay on top of whichever
background is shown.

## Decision

- **Backgrounds**, in `apps/web/src/map/layers.ts`:
  - **Map**: the OpenFreeMap Liberty style, as before.
  - **Cycling**: CyclOSM raster tiles, hosted by OSM France under fair use (CC BY-SA, data ODbL).
  - **Topo**: OpenTopoMap raster tiles, fair use (CC BY-SA; tiles to zoom 17, stretched beyond).
  - **Satellite**: Esri World Imagery (`ibasemaps-api.arcgis.com`). Esri's terms require an ArcGIS Location Platform
    account and an API key; the free tier covers 2 million tiles a month. The key comes from `VITE_ESRI_API_KEY`.
    Without it there is no satellite option. The keyless legacy endpoint still answers, but its terms don't cover
    an app like this.
- **Hillshade**: drawn by maplibre from Mapterhorn's open elevation tiles (terrarium WebP). In Austria they come from
  government lidar, to zoom 16; in Hungary from the 30 m Copernicus model, to zoom 12. Past its last zoom, maplibre
  stretches the parent tile, so a zoomed-in map in Hungary logs 404s for the missing tiles and still shows hillshade.
- **One style, layers over it.** Liberty stays the map style. A background is a raster source and layer, and the
  hillshade a raster-dem source and layer, inserted beneath the app's lowest layer (`route-casing`). Liberty's layers
  are hidden beneath a raster background. Over satellite, Liberty's labels stay visible and the photos go beneath
  them. Hillshade goes beneath Liberty's labels wherever they are shown. The base layers are read from the style
  once it has loaded.
  Switching `mapStyle` instead was rejected: react-map-gl replaces the style, which strips every layer the app has
  added. They are re-added from React in the order their sources first mounted, so later additions (the arrows,
  hillshade) can end up above or below the wrong layers. The arrow image would also need adding again.
- The choice is kept with the user's settings in IndexedDB (`UserSettings.mapBackground`, `hillshade`).

## Consequences

- Every background loads tiles from its own server, which learns which area the map shows, as OpenFreeMap already
  does. Nothing else is sent; the Esri key is a public browser key and should be restricted to the app's referrer.
- CyclOSM, OpenTopoMap and Mapterhorn are community-run and fair use, with no availability guarantee. A public
  deployment with real traffic should ask them first, or self-host.
- Hidden Liberty layers load no tiles, so a raster background costs no vector tiles, except over satellite, where the
  labels need them.
- The e2e suite answers tile requests itself, so it never loads tiles from the fair-use servers.
