import { describe, expect, it } from 'vitest';
import type { RouteResult } from '../routing/types';
import { flagFromSelection, flagLengthM, selectionWayIds, withDetails } from './flag';

const coordinates = [0, 1, 2, 3, 4, 5, 6].map((i) => [16 + i / 1000, 48, 200]);

/** Segments 0–1 on way 10, 2–3 on an unknown way, 4–5 on way 11. */
const route: RouteResult = {
  geometry: { type: 'LineString', coordinates },
  distanceM: 450,
  ascentM: 0,
  descentM: 0,
  durationS: 100,
  attributes: {
    surface: [],
    roadClass: [],
    trackType: [],
    osmWayId: [
      { from: 0, to: 2, value: 10 },
      { from: 2, to: 4, value: null },
      { from: 4, to: 6, value: 11 },
    ],
    crossing: [],
  },
};

const created = new Date('2026-11-02T12:00:00Z');

describe('selectionWayIds', () => {
  it('lists the ways under the selected segments once each, in route order', () => {
    expect(selectionWayIds(route, { a: 5, b: 1 })).toEqual([10, 11]);
  });

  it('counts a way only when a selected segment runs on it, not when the stretch just touches it', () => {
    // Points 2..4 cover segments 2 and 3: the unknown way only, although point 2 ends way 10 and 4 starts way 11.
    expect(selectionWayIds(route, { a: 2, b: 4 })).toEqual([]);
    expect(selectionWayIds(route, { a: 3, b: 5 })).toEqual([11]);
  });
});

describe('flagFromSelection', () => {
  it('keeps the selected stretch, its ways and the details', () => {
    const flag = flagFromSelection(
      route,
      { a: 1, b: 3 },
      { reason: 'overgrown', note: '  nettles  ' },
      'f1',
      created,
    );
    expect(flag).toEqual({
      id: 'f1',
      geometry: { type: 'LineString', coordinates: coordinates.slice(1, 4) },
      osmWayIds: [10],
      reason: 'overgrown',
      note: 'nettles',
      createdAt: '2026-11-02T12:00:00.000Z',
    });
  });

  it('leaves out what is unknown or empty', () => {
    const flag = flagFromSelection(route, { a: 2, b: 4 }, { note: '   ' }, 'f2', created);
    expect(Object.keys(flag).sort()).toEqual(['createdAt', 'geometry', 'id']);
  });
});

describe('withDetails', () => {
  const base = flagFromSelection(
    route,
    { a: 1, b: 3 },
    { reason: 'private', note: 'gate' },
    'f',
    created,
  );

  it('replaces the reason and note, keeping the stretch', () => {
    const edited = withDetails(base, { reason: 'too_steep', note: ' walked ' });
    expect(edited).toEqual({ ...base, reason: 'too_steep', note: 'walked' });
    expect(edited).not.toBe(base);
  });

  it('drops a cleared reason or blank note', () => {
    const edited = withDetails(base, { note: '  ' });
    expect(edited).not.toHaveProperty('reason');
    expect(edited).not.toHaveProperty('note');
    expect(edited.geometry).toBe(base.geometry);
  });
});

describe('flagLengthM', () => {
  it('measures the stretch', () => {
    // Points 1..3 are 0.002° of longitude apart at 48° N: ~149 m.
    const flag = flagFromSelection(route, { a: 1, b: 3 }, {}, 'f', created);
    expect(flagLengthM(flag)).toBeCloseTo(148.8, 0);
  });
});
