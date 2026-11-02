// @vitest-environment node
// Records Photon search responses as test fixtures, like the GraphHopper ones (ADR 0004). Queries the public API.
// Run: pnpm --filter web fixtures:record-photon
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { buildSearchParams } from '../src/geocoding/photon/request';
import type { GeocodeRequest } from '../src/geocoding/types';

const PHOTON = process.env.PHOTON_URL ?? 'https://photon.komoot.io';
const OUT = join(import.meta.dirname, '../src/geocoding/photon/__fixtures__');

// Public landmarks and towns only.
const CASES: { name: string; input: GeocodeRequest }[] = [
  // A partly typed name: stations, a square and streets, with near-duplicates.
  { name: 'stephansplatz', input: { query: 'stephansplat', near: [16.37, 48.21] } },
  // A full address: street + house number.
  { name: 'address-graz', input: { query: 'Herrengasse 16 Graz', near: [15.44, 47.07] } },
  // A Hungarian town, with no ranking point.
  { name: 'town-gyor', input: { query: 'Győr' } },
  { name: 'no-match', input: { query: 'qxzvkwjh' } },
];

it.runIf(process.env.RECORD_PHOTON_FIXTURES)('records Photon fixtures', async () => {
  mkdirSync(OUT, { recursive: true });
  for (const { name, input } of CASES) {
    const params = buildSearchParams(input).toString();
    const res = await fetch(`${PHOTON}/api?${params}`);
    const fixture = { name, input, params, status: res.status, response: await res.json() };
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify(fixture, null, 2) + '\n');
  }
});
