import { act, render, screen } from '@testing-library/react';
import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
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
}));
/** Lets a test pan the map like a user would. */
interface Gestures {
  moveStart: () => void;
  moveEnd: (centre: { longitude: number; latitude: number }) => void;
}
const gestures: Gestures = vi.hoisted(() => ({ moveStart: () => {}, moveEnd: () => {} }));

vi.mock('./locate', () => ({ currentPosition: vi.fn(() => Promise.resolve(undefined)) }));

// jsdom has no WebGL, so stand in for the map and expose the props we care about.
vi.mock('react-map-gl/maplibre', () => ({
  Map: (props: {
    mapStyle: string;
    workerUrl: string;
    attributionControl: { compact: boolean };
    onLoad: (e: { target: typeof map }) => void;
    onMoveStart: () => void;
    onMoveEnd: (e: { viewState: { longitude: number; latitude: number } }) => void;
    ref: Ref<typeof map>;
    children: ReactNode;
  }) => {
    const { onLoad, onMoveStart, onMoveEnd } = props;
    gestures.moveStart = onMoveStart;
    gestures.moveEnd = (viewState) => onMoveEnd({ viewState });
    useImperativeHandle(props.ref, () => map);
    // maplibre fires 'load' once per map, not once per render.
    const loaded = useRef(false);
    useEffect(() => {
      if (loaded.current) return;
      loaded.current = true;
      onLoad({ target: map });
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
  Source: ({ children }: { children: ReactNode }) => <>{children}</>,
  Layer: ({ id }: { id: string }) => <span data-testid="layer" data-id={id} />,
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
});
