import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import { east, flagOn } from '../test/metres';
import { fixtureRoute } from '../test/route';
import type { LonLat } from '../types';
import { ARROW_IMAGE } from './arrow';
import { currentPosition } from './locate';
import { MapView } from './MapView';

const map = vi.hoisted(() => ({
  jumpTo: vi.fn(),
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: () => 9,
  getContainer: () => ({ clientWidth: 1280, clientHeight: 720 }),
  hasImage: vi.fn(() => false),
  addImage: vi.fn(),
  getMap: () => map,
  // The base style's layers, then one of the app's (GeoJSON) layers.
  getStyle: vi.fn(() => ({
    layers: [
      { id: 'water', type: 'fill', source: 'openmaptiles' },
      { id: 'place', type: 'symbol', source: 'openmaptiles' },
      { id: 'route-casing', type: 'line', source: 'route' },
    ] as { id: string; type: string; source: string }[],
  })),
  getSource: (id: string) => ({ type: id === 'route' ? 'geojson' : 'vector' }),
  setLayoutProperty: vi.fn(),
}));
/** Lets a test pan the map like a user would. */
interface Gestures {
  moveStart: () => void;
  moveEnd: (centre: { longitude: number; latitude: number }) => void;
  /** maplibre's 'styledata': fired again whenever a layer or source is added. */
  styleData: () => void;
  /** Whether the map's tiles finish loading ('load'); the style always does. */
  tilesLoad: boolean;
}
const gestures: Gestures = vi.hoisted(() => ({
  moveStart: () => {},
  moveEnd: () => {},
  styleData: () => {},
  tilesLoad: true,
}));

vi.mock('./locate', () => ({ currentPosition: vi.fn(() => Promise.resolve(undefined)) }));

// jsdom has no WebGL, so stand in for the map and expose the props we care about.
vi.mock('react-map-gl/maplibre', () => ({
  Map: (props: {
    mapStyle: string;
    workerUrl: string;
    attributionControl: { compact: boolean };
    onLoad: (e: { target: typeof map }) => void;
    onStyleData: (e: { target: typeof map }) => void;
    onMoveStart: () => void;
    onMoveEnd: (e: { viewState: { longitude: number; latitude: number } }) => void;
    ref: Ref<typeof map>;
    children: ReactNode;
  }) => {
    const { onLoad, onStyleData, onMoveStart, onMoveEnd } = props;
    gestures.moveStart = onMoveStart;
    gestures.moveEnd = (viewState) => onMoveEnd({ viewState });
    gestures.styleData = () => onStyleData({ target: map });
    useImperativeHandle(props.ref, () => map);
    // maplibre fires 'load' once per map, not once per render.
    const loaded = useRef(false);
    useEffect(() => {
      if (loaded.current) return;
      loaded.current = true;
      onStyleData({ target: map }); // the style loads before its tiles do
      if (gestures.tilesLoad) onLoad({ target: map });
    });
    return (
      <div
        data-testid="map"
        data-style={props.mapStyle}
        data-worker-url={props.workerUrl}
        data-attribution-compact={String(props.attributionControl.compact)}
      >
        {props.children}
      </div>
    );
  },
  NavigationControl: () => null,
  ScaleControl: () => null,
  Source: ({ id, data, children }: { id: string; data?: unknown; children: ReactNode }) => (
    <div data-testid="source" data-id={id} data-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Layer: ({
    id,
    beforeId,
    layout,
  }: {
    id: string;
    beforeId?: string;
    layout?: { visibility?: string };
  }) => (
    <span
      data-testid="layer"
      data-id={id}
      data-before={beforeId}
      data-visibility={layout?.visibility}
    />
  ),
  // A control's element goes where maplibre would put it: into the map.
  useControl: (make: () => { onAdd: () => HTMLElement; onRemove: () => void }) => {
    const control = useRef(make());
    useEffect(() => {
      const { onAdd, onRemove } = control.current;
      document.body.append(onAdd());
      return onRemove;
    }, []);
  },
  Marker: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('MapView', () => {
  it('uses the OpenFreeMap Liberty style', () => {
    render(<MapView />);
    expect(screen.getByTestId('map')).toHaveAttribute(
      'data-style',
      'https://tiles.openfreemap.org/styles/liberty',
    );
  });

  it('keeps the OSM attribution expanded (ODbL)', () => {
    render(<MapView />);
    expect(screen.getByTestId('map')).toHaveAttribute('data-attribution-compact', 'false');
  });

  it('adds the direction arrow once the map has loaded, then draws arrows along routes and loops', () => {
    map.addImage.mockClear();
    render(<MapView />);
    expect(map.addImage).toHaveBeenCalledExactlyOnceWith(
      ARROW_IMAGE,
      expect.objectContaining({ width: 32, height: 32 }),
      { pixelRatio: 2 },
    );
    const layers = screen.getAllByTestId('layer').map((l) => l.dataset.id);
    expect(layers).toEqual(expect.arrayContaining(['route-arrows', 'loop-arrows']));
  });

  it('doesn’t add the arrow again when the map already has it', () => {
    map.addImage.mockClear();
    map.hasImage.mockReturnValueOnce(true);
    render(<MapView />);
    expect(map.addImage).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('layer').map((l) => l.dataset.id)).toContain('route-arrows');
  });

  it('switches the background from the map layers control, beneath the route', async () => {
    map.setLayoutProperty.mockClear();
    render(<MapView />);
    const layer = (prefix: string) =>
      screen.queryAllByTestId('layer').find((l) => l.dataset.id?.startsWith(prefix));
    expect(layer('background-')).toBeUndefined(); // the street map is the base style itself

    await userEvent.click(screen.getByRole('button', { name: 'Map layers' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Topo' }));
    expect(usePlanner.getState().userSettings.mapBackground).toBe('topo');
    expect(layer('background-')).toHaveAttribute('data-id', 'background-topo');
    expect(layer('background-')).toHaveAttribute('data-before', 'route-casing');
    // Topo has its own labels, so the whole base style is hidden.
    expect(map.setLayoutProperty).toHaveBeenCalledWith('water', 'visibility', 'none');
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith('place', 'visibility', 'none');
  });

  it('adds hillshade beneath the base style’s labels when it is switched on', async () => {
    render(<MapView />);
    expect(screen.queryAllByTestId('layer').map((l) => l.dataset.id)).not.toContain('hillshade');
    await userEvent.click(screen.getByRole('button', { name: 'Map layers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hillshade' }));
    expect(usePlanner.getState().userSettings.hillshade).toBe(true);
    const hillshade = screen.getAllByTestId('layer').find((l) => l.dataset.id === 'hillshade');
    expect(hillshade).toHaveAttribute('data-before', 'place');
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith('place', 'visibility', 'visible');
  });

  it('opens with the saved background', () => {
    usePlanner.setState({ userSettings: { mapBackground: 'cycling', hillshade: true } });
    render(<MapView />);
    const ids = screen.getAllByTestId('layer').map((l) => l.dataset.id);
    expect(ids).toEqual(expect.arrayContaining(['background-cycling', 'hillshade']));
    const background = screen
      .getAllByTestId('layer')
      .find((l) => l.dataset.id === 'background-cycling');
    expect(background).toHaveAttribute('data-before', 'hillshade');
  });

  it('shows the saved background as soon as the style has loaded, before its tiles', () => {
    gestures.tilesLoad = false;
    usePlanner.setState({ userSettings: { mapBackground: 'topo' } });
    render(<MapView />);
    gestures.tilesLoad = true;
    expect(screen.getAllByTestId('layer').map((l) => l.dataset.id)).toContain('background-topo');
  });

  it('reads the base style once: later style changes are the app’s own layers', async () => {
    map.setLayoutProperty.mockClear();
    render(<MapView />);
    // As maplibre reports it once the app has added a background: never one of the base layers to hide.
    const { layers } = map.getStyle();
    map.getStyle.mockReturnValueOnce({
      layers: [...layers, { id: 'background-topo', type: 'raster', source: 'background-topo' }],
    });
    act(() => gestures.styleData());
    await userEvent.click(screen.getByRole('button', { name: 'Map layers' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Topo' }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('water', 'visibility', 'none');
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith(
      'background-topo',
      expect.anything(),
      expect.anything(),
    );
  });

  it('hands maplibre an explicit worker URL', () => {
    render(<MapView />);
    expect(screen.getByTestId('map').dataset.workerUrl).toMatch(/maplibre-gl-worker\.mjs/);
  });
});

describe('MapView opening position', () => {
  /** Renders the map with the location fix held back until the returned function is called. */
  function renderWithLocation(position: LonLat | undefined) {
    let answer: (p: LonLat | undefined) => void = () => {};
    vi.mocked(currentPosition).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    render(<MapView />);
    return () =>
      act(async () => {
        answer(position);
        await Promise.resolve(); // let MapView's .then run inside act
      });
  }

  beforeEach(() => {
    map.jumpTo.mockClear();
  });

  it('opens on the user when they are inside the supported region', async () => {
    await renderWithLocation([15.44, 47.07])(); // Graz
    expect(map.jumpTo).toHaveBeenCalledExactlyOnceWith({ center: [15.44, 47.07], zoom: 12 });
    expect(screen.getByTestId('user-location')).toBeInTheDocument();
  });

  it('stays on Vienna when the user is outside it, but still marks them', async () => {
    await renderWithLocation([13.4, 52.52])(); // Berlin
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(screen.getByTestId('user-location')).toBeInTheDocument();
  });

  it('stays put without a location', async () => {
    await renderWithLocation(undefined)();
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('user-location')).not.toBeInTheDocument();
  });

  it('does not move a map the user has already panned', async () => {
    const locate = renderWithLocation([15.44, 47.07]);
    gestures.moveStart();
    await locate();
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it('does not move away from waypoints the user has already placed', async () => {
    const locate = renderWithLocation([15.44, 47.07]);
    act(() => usePlanner.getState().addWaypoint([16.4, 48.2]));
    await locate();
    expect(map.jumpTo).not.toHaveBeenCalled();
  });
});

describe('MapView going to the user', () => {
  it('flies to a new fix from the map’s button, and marks the user there, wherever they are', async () => {
    map.flyTo.mockClear();
    render(<MapView />);
    vi.mocked(currentPosition).mockClear().mockResolvedValueOnce([13.4, 52.52]); // Berlin
    await userEvent.click(screen.getByRole('button', { name: 'Go to my location' }));
    expect(currentPosition).toHaveBeenCalledExactlyOnceWith(undefined, { maxAgeMs: 0 });
    expect(map.flyTo).toHaveBeenCalledExactlyOnceWith({ center: [13.4, 52.52], zoom: 14 });
    expect(screen.getByTestId('user-location')).toBeInTheDocument();
  });
});

describe('MapView following address search', () => {
  beforeEach(() => {
    map.flyTo.mockClear();
    map.fitBounds.mockClear();
  });

  it('flies to a lone searched place, at street level', () => {
    render(<MapView />);
    act(() => usePlanner.getState().setStart({ name: 'Graz', point: [15.44, 47.07] }));
    expect(map.flyTo).toHaveBeenCalledExactlyOnceWith({ center: [15.44, 47.07], zoom: 14 });
  });

  it('fits start and destination, clear of the side panel', () => {
    render(<MapView />);
    act(() => {
      usePlanner.getState().setStart({ name: 'Graz', point: [15.44, 47.07] });
      usePlanner.getState().setDestination({ name: 'Győr', point: [17.63, 47.68] });
    });
    expect(map.fitBounds).toHaveBeenCalledWith([15.44, 47.07, 17.63, 47.68], {
      padding: { top: 60, right: 60, bottom: 60, left: 392 },
      maxZoom: 14,
    });
  });

  it('leaves the map alone for edits made on it', () => {
    render(<MapView />);
    act(() => usePlanner.getState().addWaypoint([16.4, 48.2]));
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('reports where the map stopped, to rank suggestions nearby', () => {
    render(<MapView />);
    act(() => gestures.moveEnd({ longitude: 19.04, latitude: 47.5 }));
    expect(usePlanner.getState().mapCentre).toEqual([19.04, 47.5]);
  });

  describe('an opened track', () => {
    /** The lines drawn by a source, as lists of coordinates. */
    const lines = (id: string) => {
      const source = screen.getAllByTestId('source').find((el) => el.dataset.id === id);
      const data = JSON.parse(source?.dataset.data ?? 'null') as {
        features: { geometry: { coordinates: number[][] } }[];
      };
      return data.features.map((f) => f.geometry.coordinates);
    };
    const TRACK = east(0, 1000);

    it('takes the route’s place, with arrows along it, and puts the waypoints away', () => {
      usePlanner.setState({
        waypoints: [
          [16.4, 48.2],
          [16.45, 48.2],
        ],
        route: fixtureRoute,
      });
      render(<MapView />);
      expect(lines('route')).not.toEqual([]);
      expect(screen.getAllByTestId('waypoint')).toHaveLength(2);

      act(() => usePlanner.getState().openTrack('Sunday ride', TRACK, 'none'));
      expect(lines('route')).toEqual([]);
      expect(lines('track')).toEqual([TRACK]);
      expect(lines('route-direction')).toEqual([TRACK]);
      expect(screen.queryAllByTestId('waypoint')).toHaveLength(0);

      act(() => usePlanner.getState().closeTrack());
      expect(lines('track')).toEqual([]);
      expect(lines('route-direction')).toEqual([fixtureRoute.geometry.coordinates]);
      expect(screen.getAllByTestId('waypoint')).toHaveLength(2);
    });

    it('draws it in surface colours once its roads are known, in place of its one colour', () => {
      render(<MapView />);
      act(() => usePlanner.getState().openTrack('Sunday ride', TRACK, 'none'));
      const trackLine = () =>
        screen.getAllByTestId('layer').find((el) => el.dataset.id === 'track-line');
      expect(lines('track-surface')).toEqual([]);
      expect(trackLine()).toHaveAttribute('data-visibility', 'visible');

      const { track } = usePlanner.getState();
      const half = (TRACK.length - 1) / 2;
      act(() =>
        usePlanner.getState().setTrackRoads(track!.id, track!.coordinates, {
          roads: {
            surface: [
              { from: 0, to: half, value: 'asphalt' },
              { from: half, to: TRACK.length - 1, value: 'gravel' },
            ],
            roadClass: [],
            trackType: [],
            osmWayId: [],
            crossing: [],
          },
        }),
      );
      const source = screen
        .getAllByTestId('source')
        .find((el) => el.dataset.id === 'track-surface');
      const runs = JSON.parse(source?.dataset.data ?? 'null') as {
        features: { properties: { category: string }; geometry: { coordinates: number[][] } }[];
      };
      expect(runs.features.map((f) => f.properties.category)).toEqual(['paved', 'gravel']);
      expect(runs.features.flatMap((f) => f.geometry.coordinates)).toHaveLength(TRACK.length + 1);
      expect(trackLine()).toHaveAttribute('data-visibility', 'none');
    });

    it('marks the flagged section being asked about', () => {
      render(<MapView />);
      act(() => {
        usePlanner.getState().loadFlags([flagOn('f', east(400, 600, 50))]);
        usePlanner.getState().openTrack('Sunday ride', TRACK, 'none');
      });
      const section = usePlanner.getState().track?.sections[0];
      expect(lines('flag-selection')).toEqual([TRACK.slice(section?.from, (section?.to ?? 0) + 1)]);
      act(() => usePlanner.getState().keepSection());
      expect(lines('flag-selection')).toEqual([]);
    });

    it('shows the point hovered on the track’s elevation chart', () => {
      render(<MapView />);
      act(() => {
        usePlanner.getState().openTrack('Sunday ride', TRACK, 'none');
        usePlanner.getState().setHoverIndex(50);
      });
      expect(screen.getByTestId('hover-dot')).toBeInTheDocument();
    });
  });
});
