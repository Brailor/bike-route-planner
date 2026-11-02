import { describe, expect, it, vi } from 'vitest';
import { GeocodingError, MIN_QUERY_LENGTH, type GeocodeRequest } from '../types';
import addressFixture from './__fixtures__/address-graz.json';
import noMatchFixture from './__fixtures__/no-match.json';
import stephansplatzFixture from './__fixtures__/stephansplatz.json';
import townFixture from './__fixtures__/town-gyor.json';
import { PhotonGeocoder } from './PhotonGeocoder';
import { buildSearchParams } from './request';
import { mapSearchResponse, placeLabel, type PhotonResponse } from './response';

const asResponse = (json: unknown) => json as PhotonResponse;

describe('buildSearchParams', () => {
  // Fixtures are recorded from these exact queries; if this fails, re-record (pnpm --filter web fixtures:record-photon).
  it.each([stephansplatzFixture, addressFixture, townFixture, noMatchFixture])(
    'matches the recorded query ($name)',
    (fx) => {
      expect(buildSearchParams(fx.input as GeocodeRequest).toString()).toBe(fx.params);
    },
  );

  it('limits results to the supported region', () => {
    expect(buildSearchParams({ query: 'x' }).get('bbox')).toBe('9.5,45.7,22.95,49.05');
  });

  it('sends the ranking point rounded to ~1 km, and nothing without one', () => {
    const near = buildSearchParams({ query: 'x', near: [16.372044, 48.208464] });
    expect([near.get('lon'), near.get('lat')]).toEqual(['16.37', '48.21']);
    const anywhere = buildSearchParams({ query: 'x' });
    expect(anywhere.has('lon') || anywhere.has('lat')).toBe(false);
  });

  it('trims the query', () => {
    expect(buildSearchParams({ query: '  Graz ' }).get('q')).toBe('Graz');
  });
});

describe('mapSearchResponse', () => {
  it('labels a plain address by street and house number', () => {
    const places = mapSearchResponse(asResponse(addressFixture.response));
    expect(places).toContainEqual({
      name: 'Herrengasse 16',
      detail: '8010 Graz, Österreich',
      point: [15.4396712, 47.0699746],
    });
  });

  it('labels a named place with its address', () => {
    expect(mapSearchResponse(asResponse(addressFixture.response))[0]).toMatchObject({
      name: 'Landeszeughaus',
      detail: 'Herrengasse 16, 8010 Graz, Österreich',
    });
  });

  it('merges results that would look identical, keeping Photon’s order', () => {
    const raw = stephansplatzFixture.response.features;
    const places = mapSearchResponse(asResponse(stephansplatzFixture.response));
    expect(places.length).toBeLessThan(raw.length);
    expect(new Set(places.map((p) => `${p.name}\n${p.detail}`)).size).toBe(places.length);
    expect(places[0]?.point).toEqual(raw[0]?.geometry.coordinates);
  });

  it('keeps [lon, lat] order', () => {
    const [gyor] = mapSearchResponse(asResponse(townFixture.response));
    expect(gyor).toMatchObject({ name: 'Győr', point: [17.6342832, 47.6835029] });
  });

  it('returns nothing for no match', () => {
    expect(mapSearchResponse(asResponse(noMatchFixture.response))).toEqual([]);
  });

  it('skips entries without a point or anything to call them', () => {
    const response = asResponse({
      features: [
        { geometry: { coordinates: [] }, properties: { name: 'Nowhere' } },
        { geometry: { coordinates: [16, 48] }, properties: {} },
      ],
    });
    expect(mapSearchResponse(response)).toEqual([]);
  });
});

describe('placeLabel', () => {
  it('does not repeat the name on the second line', () => {
    expect(placeLabel({ name: 'Wien', city: 'Wien', country: 'Österreich' })).toEqual({
      name: 'Wien',
      detail: 'Österreich',
    });
    expect(placeLabel({ name: 'Stephansplatz', street: 'Stephansplatz', city: 'Wien' })).toEqual({
      name: 'Stephansplatz',
      detail: 'Wien',
    });
  });

  it('falls back to the state when there is no town', () => {
    expect(
      placeLabel({ name: 'Schneeberg', state: 'Niederösterreich', country: 'Österreich' }),
    ).toEqual({
      name: 'Schneeberg',
      detail: 'Niederösterreich, Österreich',
    });
  });

  it('uses the county as the town when there is no city', () => {
    expect(
      placeLabel({ name: 'Győrújbarát', postcode: '9081', county: 'Győr-Moson-Sopron megye' })
        .detail,
    ).toBe('9081 Győr-Moson-Sopron megye');
  });
});

describe('PhotonGeocoder', () => {
  const respond = (body: unknown, status = 200) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('queries /geo/api and maps the answer', async () => {
    const fetchFn = respond(townFixture.response);
    const places = await new PhotonGeocoder('/geo', fetchFn).search(townFixture.input);
    expect(fetchFn).toHaveBeenCalledWith(`/geo/api?${townFixture.params}`, { signal: undefined });
    expect(places[0]?.name).toBe('Győr');
  });

  it(`doesn't send queries shorter than ${MIN_QUERY_LENGTH} characters`, async () => {
    const fetchFn = respond(townFixture.response);
    expect(await new PhotonGeocoder('/geo', fetchFn).search({ query: ' gy ' })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'unavailable'],
    [429, 'unavailable'],
    [400, 'bad_request'],
  ] as const)('reports HTTP %i as %s', async (status, kind) => {
    const search = new PhotonGeocoder('/geo', respond({ message: 'no' }, status)).search({
      query: 'Graz',
    });
    await expect(search).rejects.toEqual(expect.objectContaining({ name: 'GeocodingError', kind }));
  });

  it('reports an unreachable or garbled service as unavailable', async () => {
    const unreachable = new PhotonGeocoder(
      '/geo',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch')),
    );
    await expect(unreachable.search({ query: 'Graz' })).rejects.toBeInstanceOf(GeocodingError);

    const html = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(new PhotonGeocoder('/geo', html).search({ query: 'Graz' })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('passes aborts through', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => {
      controller.abort();
      return Promise.reject(abort);
    });
    await expect(
      new PhotonGeocoder('/geo', fetchFn).search({ query: 'Graz' }, controller.signal),
    ).rejects.toBe(abort);
  });
});
