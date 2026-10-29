import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlanner } from '../state/store';
import { fixtureRoute } from '../test/route';
import { RouteSummary } from './RouteSummary';

describe('RouteSummary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows distance, ascent and time', () => {
    render(<RouteSummary route={fixtureRoute} />);
    expect(screen.getByTestId('stat-distance')).toHaveTextContent('3.4 km');
    expect(screen.getByTestId('stat-ascent')).toHaveTextContent('8 m');
    expect(screen.getByTestId('stat-time')).toHaveTextContent('17 min');
  });

  it('shows the surface breakdown and elevation chart', () => {
    render(<RouteSummary route={fixtureRoute} />);
    expect(screen.getByTestId('surface-paved')).toBeInTheDocument();
    expect(screen.getByTestId('elevation-chart')).toBeInTheDocument();
  });

  it('downloads the route as GPX named after profile and distance', async () => {
    usePlanner.getState().setProfile('mtb');
    let blob: Blob | undefined;
    const createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:route';
    });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('mtb-route-3-4-km.gpx');
      expect(this.href).toBe('blob:route');
    });

    render(<RouteSummary route={fixtureRoute} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export GPX' }));

    expect(click).toHaveBeenCalledOnce();
    const gpx = await blob?.text();
    expect(gpx).toContain('<name>MTB route 3.4 km</name>');
    expect(gpx?.match(/<trkpt /g)).toHaveLength(fixtureRoute.geometry.coordinates.length);
  });
});
