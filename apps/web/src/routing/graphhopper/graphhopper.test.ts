import { describe, expect, it, vi } from 'vitest';
import { RoutingError, type RouteRequest } from '../types';
import flaggedStartFixture from './__fixtures__/gravel-flagged-start.json';
import flaggedFixture from './__fixtures__/gravel-flagged.json';
import gravelFixture from './__fixtures__/gravel-offroad-80.json';
import outOfBoundsFixture from './__fixtures__/out-of-bounds.json';
import roadViaFixture from './__fixtures__/road-via.json';
import { GraphHopperEngine } from './GraphHopperEngine';
import { buildRouteRequestBody } from './request';
import { mapErrorResponse, mapRouteResponse, type GhRouteResponse } from './response';

const asResponse = (json: unknown) => json as GhRouteResponse;

describe('buildRouteRequestBody', () => {
  // Fixtures are recorded from these exact bodies; if this fails, re-record (pnpm --filter web fixtures:record).
  it.each([gravelFixture, roadViaFixture, outOfBoundsFixture, flaggedFixture, flaggedStartFixture])(
    'matches the recorded request ($name)',
    (fx) => {
      expect(buildRouteRequestBody(fx.input as RouteRequest)).toEqual(fx.request);
    },
  );

  it('omits custom_model when no setting changes the profile', () => {
    const body = buildRouteRequestBody({
      waypoints: [
        [16, 48],
        [16.1, 48.1],
      ],
      settings: { profile: 'road' },
    });
    expect(body).not.toHaveProperty('custom_model');
  });
});

describe('mapRouteResponse', () => {
  const route = mapRouteResponse(asResponse(gravelFixture.response));
  const path = gravelFixture.response.paths[0]!;

  it('keeps [lon, lat, ele] coordinates', () => {
    expect(route.geometry.coordinates).toEqual(path.points.coordinates);
    expect(route.geometry.coordinates[0]).toHaveLength(3);
    const [lon, lat] = route.geometry.coordinates[0]!;
    expect(lon).toBeCloseTo(16.56, 1);
    expect(lat).toBeCloseTo(48.2, 1);
  });

  it('converts units', () => {
    expect(route.distanceM).toBe(path.distance);
    expect(route.durationS).toBe(path.time / 1000);
    expect(route.ascentM).toBe(path.ascend);
  });

  it('maps path details to spans covering the whole route', () => {
    const segments = route.geometry.coordinates.length - 1;
    const { surface, roadClass, trackType, osmWayId } = route.attributes;
    for (const spans of [surface, roadClass, trackType, osmWayId]) {
      expect(spans[0]?.from).toBe(0);
      expect(spans.at(-1)?.to).toBe(segments);
    }
    expect(new Set(route.attributes.surface.map((s) => s.value))).toContain('asphalt');
    expect(route.attributes.osmWayId.every((s) => typeof s.value === 'number')).toBe(true);
  });
});

describe('mapErrorResponse', () => {
  it('treats out-of-bounds points as no route', () => {
    const err = mapErrorResponse(outOfBoundsFixture.status, outOfBoundsFixture.response);
    expect(err.kind).toBe('no_route');
  });

  it('treats server errors as unavailable', () => {
    expect(mapErrorResponse(502, undefined).kind).toBe('unavailable');
  });

  it('treats other client errors as bad requests', () => {
    expect(
      mapErrorResponse(400, { message: "Cannot compile expression: 'foo' not available" }).kind,
    ).toBe('bad_request');
  });
});

describe('GraphHopperEngine', () => {
  const request = gravelFixture.input as RouteRequest;
  const reply = (status: number, body: unknown) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('posts the request body to <baseUrl>/route', async () => {
    const fetchFn = reply(200, gravelFixture.response);
    await new GraphHopperEngine('/gh', fetchFn).route(request);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/gh/route');
    expect(JSON.parse(init?.body as string)).toEqual(gravelFixture.request);
  });

  it('returns the mapped route', async () => {
    const route = await new GraphHopperEngine('/gh', reply(200, gravelFixture.response)).route(
      request,
    );
    expect(route.distanceM).toBe(gravelFixture.response.paths[0]!.distance);
  });

  it('throws a typed error for engine errors', async () => {
    const engine = new GraphHopperEngine('/gh', reply(400, outOfBoundsFixture.response));
    await expect(engine.route(request)).rejects.toMatchObject({
      name: 'RoutingError',
      kind: 'no_route',
    });
  });

  it('reports a network failure as unavailable', async () => {
    const engine = new GraphHopperEngine(
      '/gh',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')),
    );
    await expect(engine.route(request)).rejects.toBeInstanceOf(RoutingError);
    await expect(engine.route(request)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('passes aborts through untouched', async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException('aborted', 'AbortError');
    const engine = new GraphHopperEngine(
      '/gh',
      vi.fn<typeof fetch>().mockRejectedValue(abortError),
    );
    await expect(engine.route(request, controller.signal)).rejects.toBe(abortError);
  });
});
