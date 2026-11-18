import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setPassword } from './accounts.ts';
import { openDb } from './db.ts';
import { listFlags, MAX_NOTE_CHARS, MAX_POINTS, parseFlag, removeFlag, saveFlag } from './flags.ts';

const flag = {
  id: 'a1b2-c3',
  geometry: {
    type: 'LineString',
    coordinates: [
      [16.37, 48.2],
      [16.38, 48.21, 180],
    ],
  },
  reason: 'private',
  note: 'Gate locked',
  createdAt: '2026-11-18T09:00:00.000Z',
};

test('parseFlag keeps a valid flag and drops fields the app doesn’t use', () => {
  assert.deepEqual(parseFlag({ ...flag, extra: 'x'.repeat(100) }), flag);
  assert.deepEqual(parseFlag({ ...flag, osmWayIds: [12, 34] }), { ...flag, osmWayIds: [12, 34] });
  const bare = { id: flag.id, geometry: flag.geometry, createdAt: flag.createdAt };
  assert.deepEqual(parseFlag(bare), bare);
});

test('parseFlag refuses anything that isn’t a flag', () => {
  const line = (coordinates: unknown) => ({
    ...flag,
    geometry: { type: 'LineString', coordinates },
  });
  for (const bad of [
    undefined,
    'flag',
    { ...flag, id: '' },
    { ...flag, id: '../x' },
    { ...flag, id: 'x'.repeat(65) },
    { ...flag, createdAt: 'yesterday' },
    { ...flag, geometry: { type: 'MultiPoint', coordinates: flag.geometry.coordinates } },
    line([[16, 48]]),
    line([
      [16, 48],
      [16, '48'],
    ]),
    line([
      [16, 48],
      [16, Infinity],
    ]),
    line([[16, 48], [16]]),
    line(Array.from({ length: MAX_POINTS + 1 }, () => [16, 48])),
    { ...flag, osmWayIds: [1.5] },
    { ...flag, reason: 'muddy' },
    { ...flag, note: 7 },
    { ...flag, note: 'x'.repeat(MAX_NOTE_CHARS + 1) },
  ])
    assert.equal(parseFlag(bad), undefined, JSON.stringify(bad)?.slice(0, 80));
  assert.ok(parseFlag(line(Array.from({ length: MAX_POINTS }, () => [16, 48]))));
});

test('each user lists, replaces and removes only their own flags, oldest first', async () => {
  const db = openDb(':memory:');
  await setPassword(db, 'anna');
  await setPassword(db, 'ben');
  const [anna, ben] = [1, 2];
  const at = (id: string, day: number) => ({
    ...parseFlag(flag)!,
    id,
    createdAt: `2026-11-0${day}T00:00:00.000Z`,
  });
  // Saved in neither date nor id order.
  const older = at('older', 1);
  saveFlag(db, anna, at('m-newest', 3));
  saveFlag(db, anna, older);
  saveFlag(db, anna, at('a-middle', 2));
  saveFlag(db, ben, { ...older, note: 'Ben’s' });
  assert.deepEqual(
    listFlags(db, anna).map((f) => f.id),
    ['older', 'a-middle', 'm-newest'],
  );

  saveFlag(db, anna, { ...older, note: 'Changed' });
  assert.equal(listFlags(db, anna)[0]?.note, 'Changed');
  assert.equal(listFlags(db, ben)[0]?.note, 'Ben’s');

  removeFlag(db, ben, 'older');
  assert.deepEqual(listFlags(db, ben), []);
  assert.equal(listFlags(db, anna).length, 3);
});
