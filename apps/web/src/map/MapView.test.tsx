import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MapView } from './MapView';

// jsdom has no WebGL, so stand in for the map and expose the props we care about.
vi.mock('react-map-gl/maplibre', () => ({
  Map: (props: {
    mapStyle: string;
    workerUrl: string;
    attributionControl: { compact: boolean };
    children: ReactNode;
  }) => (
    <div
      data-testid="map"
      data-style={props.mapStyle}
      data-worker-url={props.workerUrl}
      data-attribution-compact={String(props.attributionControl.compact)}
    >
      {props.children}
    </div>
  ),
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
