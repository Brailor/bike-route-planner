import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_NAME_CHARS, MAX_ROUTE_POINTS, parseRoute } from './routes.ts';

const route = {
  id: 'r1',
  name: 'Wienerwald gravel',
  geometry: {
    type: 'LineString',
    coordinates: [
      [16.37, 48.2, 180],
      [16.38, 48.21, 185.5],
    ],
  },
  distanceM: 1320.4,
  elevation: 'file',
  createdAt: '2026-11-18T09:00:00.000Z',
};
const line = (coordinates: unknown) => ({
  ...route,
  geometry: { type: 'LineString', coordinates },
});
const points = (n: number) => Array.from({ length: n }, () => [16, 48]);

test('parseRoute keeps a valid route, trims its name and drops fields the app doesn’t use', () => {
  assert.deepEqual(parseRoute({ ...route, waypoints: [[1, 2]] }), route);
  assert.deepEqual(parseRoute({ ...route, name: '  Lobau  ' }), { ...route, name: 'Lobau' });
  const flat = { ...line(points(2)), elevation: 'none' };
  assert.deepEqual(parseRoute(flat), flat);
  assert.ok(parseRoute(line(points(MAX_ROUTE_POINTS))));
  assert.ok(parseRoute({ ...route, name: 'x'.repeat(MAX_NAME_CHARS) }));
});

test('parseRoute refuses anything that isn’t a saved route', () => {
  for (const bad of [
    undefined,
    [],
    { ...route, id: 'a/b' },
    { ...route, createdAt: 'soon' },
    { ...route, name: '   ' },
    { ...route, name: 5 },
    { ...route, name: 'x'.repeat(MAX_NAME_CHARS + 1) },
    { ...route, distanceM: -1 },
    { ...route, distanceM: '12' },
    { ...route, distanceM: Infinity },
    { ...route, elevation: 'guessed' },
    { ...route, geometry: undefined },
    line([[16, 48]]),
    line(points(MAX_ROUTE_POINTS + 1)),
  ])
    assert.equal(parseRoute(bad), undefined, JSON.stringify(bad)?.slice(0, 80));
});
