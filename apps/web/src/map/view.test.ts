import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW, projectToScreen } from './view';

const size = { width: 1280, height: 720 };

describe('projectToScreen', () => {
  it('puts the view centre in the middle of the screen', () => {
    expect(projectToScreen([INITIAL_VIEW.longitude, INITIAL_VIEW.latitude], size)).toEqual({
      x: 640,
      y: 360,
    });
  });

  it('maps east to the right and north up', () => {
    const p = projectToScreen([INITIAL_VIEW.longitude + 0.1, INITIAL_VIEW.latitude + 0.1], size);
    expect(p.x).toBeGreaterThan(640);
    expect(p.y).toBeLessThan(360);
  });

  it('uses 512 px tiles: one degree of longitude at zoom 9 is 512·2⁹/360 px', () => {
    const p = projectToScreen([INITIAL_VIEW.longitude + 1, INITIAL_VIEW.latitude], size);
    expect(p.x - 640).toBeCloseTo((512 * 2 ** 9) / 360, 6);
  });
});
