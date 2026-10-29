import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlanner } from '../state/store';
import { ElevationChart } from './ElevationChart';

// Three points ~740 m apart along a parallel, climbing 100 m then dropping 50 m.
const coordinates = [
  [16.0, 48.0, 200],
  [16.01, 48.0, 300],
  [16.02, 48.0, 250],
];

function renderChart() {
  render(<ElevationChart coordinates={coordinates} />);
  const svg = screen.getByTestId('elevation-chart');
  // jsdom doesn't lay out SVG; give it the viewBox size so pointer maths is 1:1.
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 120 }) as DOMRect;
  return svg;
}

describe('ElevationChart', () => {
  it('labels the elevation range and total distance', () => {
    renderChart();
    expect(screen.getByRole('img')).toHaveAccessibleName('Elevation profile, 200 m to 300 m');
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('1.5 km')).toBeInTheDocument();
  });

  it('renders nothing for a route without elevation', () => {
    const { container } = render(<ElevationChart coordinates={[[16, 48]]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('publishes the hovered point so the map can show it', () => {
    const svg = renderChart();
    // Plot spans x 34..314; the far right is the last point.
    fireEvent.pointerMove(svg, { clientX: 314 });
    expect(usePlanner.getState().hoverIndex).toBe(2);
    fireEvent.pointerMove(svg, { clientX: 34 });
    expect(usePlanner.getState().hoverIndex).toBe(0);
    fireEvent.pointerLeave(svg);
    expect(usePlanner.getState().hoverIndex).toBeUndefined();
  });

  it('shows distance and elevation for a point hovered on the map', () => {
    renderChart();
    expect(screen.getByText('Elevation (m)')).toBeInTheDocument();
    act(() => usePlanner.getState().setHoverIndex(1));
    expect(screen.getByText(/^7\d\d m · 300 m$/)).toBeInTheDocument();
  });
});
