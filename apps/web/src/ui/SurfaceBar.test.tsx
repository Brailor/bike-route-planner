import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SurfaceBreakdown } from '../route/surface';
import { SurfaceBar } from './SurfaceBar';

const breakdown = (
  values: Partial<Record<keyof SurfaceBreakdown, [meters: number, inferred?: number]>>,
): SurfaceBreakdown => ({
  paved: { meters: values.paved?.[0] ?? 0, inferredMeters: values.paved?.[1] ?? 0 },
  gravel: { meters: values.gravel?.[0] ?? 0, inferredMeters: values.gravel?.[1] ?? 0 },
  ground: { meters: values.ground?.[0] ?? 0, inferredMeters: values.ground?.[1] ?? 0 },
  unknown: { meters: values.unknown?.[0] ?? 0, inferredMeters: values.unknown?.[1] ?? 0 },
});

describe('SurfaceBar', () => {
  it('lists only the categories present, with their share', () => {
    render(<SurfaceBar breakdown={breakdown({ paved: [750], gravel: [250] })} />);
    expect(screen.getByTestId('surface-paved')).toHaveTextContent('Paved 75%');
    expect(screen.getByTestId('surface-gravel')).toHaveTextContent('Gravel 25%');
    expect(screen.queryByTestId('surface-ground')).not.toBeInTheDocument();
    expect(screen.queryByTestId('surface-unknown')).not.toBeInTheDocument();
  });

  it('says how much is estimated from missing tags', () => {
    render(<SurfaceBar breakdown={breakdown({ paved: [600, 300], gravel: [400, 100] })} />);
    expect(screen.getByText(/40% has no surface tag/)).toBeInTheDocument();
  });

  it('says nothing about estimates when every surface is tagged', () => {
    render(<SurfaceBar breakdown={breakdown({ paved: [1000] })} />);
    expect(screen.queryByText(/no surface tag/)).not.toBeInTheDocument();
  });

  it('sizes the bar segments by distance', () => {
    const { container } = render(
      <SurfaceBar breakdown={breakdown({ paved: [750], ground: [250] })} />,
    );
    const segments = container.querySelectorAll<HTMLElement>('.surface__bar > span');
    expect([...segments].map((s) => s.style.flexGrow)).toEqual(['750', '250']);
  });
});
