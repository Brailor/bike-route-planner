import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useMemo, useState } from 'react';
import {
  Layer,
  Map,
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  type MapLayerMouseEvent,
  type MarkerDragEvent,
} from 'react-map-gl/maplibre';
import { distanceM } from '../geo';
import { usePlanner } from '../state/store';
import type { LonLat } from '../types';
import { SURFACE_COLORS } from '../ui/surfaceColors';
import { insertionIndex, nearestIndex, surfaceRuns } from './routeGeometry';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Vienna; the first target region is Austria.
const INITIAL_VIEW = { longitude: 16.37, latitude: 48.21, zoom: 9 };

/** Wide invisible line on top of the route, so it is easy to hover and grab. */
const ROUTE_HIT_LAYER = 'route-hit';

/** Half the waypoint marker's size incl. border (see .waypoint in index.css). */
const MARKER_RADIUS_PX = 14;

/** A drag shorter than this (metres) counts as a click on the line, not an insert. */
const MIN_DRAG_M = 5;

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

const PASSIVE = { pointerEvents: 'none' } as const;

/** DOM click events already handled by a waypoint marker; the map ignores them. */
const markerClicks = new WeakSet<Event>();

const surfaceColor: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  'paved',
  SURFACE_COLORS.paved,
  'gravel',
  SURFACE_COLORS.gravel,
  'ground',
  SURFACE_COLORS.ground,
  SURFACE_COLORS.unknown,
];

const toLonLat = (e: { lngLat: { lng: number; lat: number } }): LonLat => [
  e.lngLat.lng,
  e.lngLat.lat,
];

function waypointLabel(index: number, count: number) {
  if (index === 0) return { text: 'S', kind: 'start' };
  if (index === count - 1) return { text: 'E', kind: 'end' };
  return { text: String(index), kind: 'via' };
}

export function MapView() {
  const waypoints = usePlanner((s) => s.waypoints);
  const route = usePlanner((s) => s.route);
  const hoverIndex = usePlanner((s) => s.hoverIndex);
  const { addWaypoint, insertWaypoint, moveWaypoint, removeWaypoint, setHoverIndex } =
    usePlanner.getState();

  const runs = useMemo(() => (route ? surfaceRuns(route) : EMPTY), [route]);
  const coordinates = route?.geometry.coordinates;
  const hovered = hoverIndex === undefined ? undefined : coordinates?.[hoverIndex];

  const [lineDrag, setLineDrag] = useState<{ from: LonLat; routeIndex: number; to: LonLat }>();
  const [overRoute, setOverRoute] = useState(false);

  const onRouteFeature = (e: MapLayerMouseEvent) => Boolean(e.features?.length);
  // Markers live inside the map's canvas container, so pressing, clicking or dragging one also reaches the map,
  // which would otherwise add a waypoint or start a line drag underneath the marker. Two checks, because each
  // misses a case: a click a marker already handled is recognised by its event (by the time the map sees it, the
  // marker may be removed and unmounted), and a press is recognised by position (the DOM target isn't reliable
  // while markers re-render under the pointer).
  const onMarker = (e: MapLayerMouseEvent) =>
    markerClicks.has(e.originalEvent) ||
    waypoints.some((w) => {
      const p = e.target.project(w);
      return Math.hypot(p.x - e.point.x, p.y - e.point.y) <= MARKER_RADIUS_PX;
    });

  function handleClick(e: MapLayerMouseEvent) {
    if (onRouteFeature(e) || onMarker(e)) return; // clicks on the line or a marker don't add waypoints
    addWaypoint(toLonLat(e));
  }

  function handleMouseDown(e: MapLayerMouseEvent) {
    if (!coordinates || !onRouteFeature(e) || onMarker(e)) return;
    e.preventDefault(); // stops the map from panning while a waypoint is dragged out of the line
    const point = toLonLat(e);
    setLineDrag({ from: point, to: point, routeIndex: nearestIndex(coordinates, point) });
  }

  function handleMouseMove(e: MapLayerMouseEvent) {
    if (lineDrag) {
      setLineDrag({ ...lineDrag, to: toLonLat(e) });
      return;
    }
    const over = Boolean(coordinates) && onRouteFeature(e);
    setOverRoute(over);
    setHoverIndex(over && coordinates ? nearestIndex(coordinates, toLonLat(e)) : undefined);
  }

  function handleMouseUp() {
    if (!lineDrag || !coordinates) return;
    if (distanceM(lineDrag.from, lineDrag.to) >= MIN_DRAG_M) {
      insertWaypoint(insertionIndex(coordinates, waypoints, lineDrag.routeIndex), lineDrag.to);
    }
    setLineDrag(undefined);
  }

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
      interactiveLayerIds={coordinates ? [ROUTE_HIT_LAYER] : []}
      cursor={lineDrag ? 'grabbing' : overRoute ? 'grab' : 'crosshair'}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseOut={() => setHoverIndex(undefined)}
    >
      <NavigationControl position="top-right" />
      <ScaleControl position="bottom-right" unit="metric" />

      <Source id="route" type="geojson" data={runs}>
        <Layer
          id="route-casing"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': '#ffffff', 'line-width': 9 }}
        />
        <Layer
          id="route-line"
          type="line"
          filter={['==', ['get', 'inferred'], false]}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': surfaceColor, 'line-width': 5 }}
        />
        {/* Dashed where the surface tag was missing and the category is inferred. */}
        <Layer
          id="route-line-inferred"
          type="line"
          filter={['==', ['get', 'inferred'], true]}
          layout={{ 'line-join': 'round' }}
          paint={{ 'line-color': surfaceColor, 'line-width': 5, 'line-dasharray': [1.2, 0.8] }}
        />
        <Layer
          id={ROUTE_HIT_LAYER}
          type="line"
          paint={{ 'line-color': '#000000', 'line-opacity': 0, 'line-width': 18 }}
        />
      </Source>

      {/* Display-only markers: their wrappers must not catch the pointer, or they block the waypoints beneath. */}
      {hovered && !lineDrag && (
        <Marker longitude={hovered[0] ?? 0} latitude={hovered[1] ?? 0} style={PASSIVE}>
          <div className="hover-dot" data-testid="hover-dot" />
        </Marker>
      )}

      {lineDrag && (
        <Marker longitude={lineDrag.to[0]} latitude={lineDrag.to[1]} style={PASSIVE}>
          <div className="waypoint waypoint--via waypoint--ghost">+</div>
        </Marker>
      )}

      {waypoints.map(([lon, lat], i) => {
        const label = waypointLabel(i, waypoints.length);
        return (
          <Marker
            key={i}
            longitude={lon}
            latitude={lat}
            draggable
            onDragEnd={(e: MarkerDragEvent) => moveWaypoint(i, toLonLat(e))}
            onClick={(e) => {
              markerClicks.add(e.originalEvent);
              removeWaypoint(i);
            }}
          >
            <div
              className={`waypoint waypoint--${label.kind}`}
              data-testid="waypoint"
              title="Drag to move, click to remove"
            >
              {label.text}
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}
