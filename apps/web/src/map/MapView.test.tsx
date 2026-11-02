import { act, render, screen } from '@testing-library/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import type { LonLat } from '../types';
import { currentPosition } from './locate';
import { MapView } from './MapView';

const map = vi.hoisted(() => ({ jumpTo: vi.fn() }));
/** Lets a test pan the map like a user would. */
const gestures = vi.hoisted(() => ({ moveStart: () => {} }));

vi.mock('./locate', () => ({ currentPosition: vi.fn(() => Promise.resolve(undefined)) }));

// jsdom has no WebGL, so stand in for the map and expose the props we care about.
vi.mock('react-map-gl/maplibre', () => ({
  Map: (props: {
    mapStyle: string;
    workerUrl: string;
    attributionControl: { compact: boolean };
    onLoad: (e: { target: typeof map }) => void;
    onMoveStart: () => void;
    children: ReactNode;
  }) => {
    const { onLoad, onMoveStart } = props;
    gestures.moveStart = onMoveStart;
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
  Layer: () => null,
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
