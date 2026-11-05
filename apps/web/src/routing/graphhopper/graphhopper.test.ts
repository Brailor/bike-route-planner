import { describe, expect, it, vi } from 'vitest';
import { distanceM } from '../../geo';
import { RoutingError, type RoundTripRequest, type RouteRequest } from '../types';
import flaggedStartFixture from './__fixtures__/gravel-flagged-start.json';
import flaggedFixture from './__fixtures__/gravel-flagged.json';
import gravelFixture from './__fixtures__/gravel-offroad-80.json';
import outOfBoundsFixture from './__fixtures__/out-of-bounds.json';
import roadViaFixture from './__fixtures__/road-via.json';
import roundTripFixture from './__fixtures__/gravel-round-trip.json';
import { GraphHopperEngine } from './GraphHopperEngine';
import {
  buildRoundTripRequestBody,
  buildRouteRequestBody,
  buildTraceRequestBody,
  DETAILS,
  TRACE_DISTANCE_INFLUENCE,
  TRACE_PROFILE,
  type GhRouteRequestBody,
} from './request';
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
    expect(body).not.toHaveProperty('pass_through');
  });

  it('asks not to turn back at waypoints when told to pass through', () => {
    const waypoints: [number, number][] = [
      [16, 48],
      [16.1, 48.1],
      [16, 48],
    ];
    expect(
      buildRouteRequestBody({ waypoints, settings: { profile: 'road' }, passThrough: true }),
    ).toMatchObject({
      pass_through: true,
    });
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

  it('traces through points on the permissive profile, distance first', async () => {
    const fetchFn = reply(200, gravelFixture.response);
    const points: [number, number][] = [
      [16.559, 48.2004],
      [16.57, 48.198],
      [16.59, 48.19],
    ];
    const trace = await new GraphHopperEngine('/gh', fetchFn).trace(points);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/gh/route');
    expect(JSON.parse(init?.body as string)).toEqual(buildTraceRequestBody(points));
    expect(trace.attributes.osmWayId.length).toBeGreaterThan(0);
  });

  it('asks for a round trip from the start, with the profile’s model and the flags', async () => {
    const fetchFn = reply(200, gravelFixture.response);
    const flag = (flaggedFixture.input as unknown as RouteRequest).flags![0]!;
    await new GraphHopperEngine('/gh', fetchFn).roundTrip({
      start: [16.559, 48.2004],
      distanceM: 30_000.4,
      seed: 3,
      settings: request.settings,
      flags: [flag],
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/gh/route');
    const body = JSON.parse(init?.body as string) as GhRouteRequestBody;
    expect(body).toMatchObject({
      profile: 'gravel',
      points: [[16.559, 48.2004]],
      algorithm: 'round_trip',
      'round_trip.distance': 30_000,
      'round_trip.seed': 3,
      details: [...DETAILS],
    });
    expect(body.custom_model).toEqual(
      buildRouteRequestBody({ ...request, flags: [flag] }).custom_model,
    );
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

describe('buildTraceRequestBody', () => {
  it('uses the most permissive bike profile and lets distance dominate, with no flags', () => {
    const body = buildTraceRequestBody([
      [16.5, 48.2],
      [16.6, 48.2],
    ]);
    expect(body).toMatchObject({
      profile: TRACE_PROFILE,
      points: [
        [16.5, 48.2],
        [16.6, 48.2],
      ],
      details: expect.arrayContaining(['osm_way_id']) as unknown,
      custom_model: { distance_influence: TRACE_DISTANCE_INFLUENCE },
    });
    expect(body.custom_model).not.toHaveProperty('areas');
  });
});

describe('buildRoundTripRequestBody', () => {
  it('builds the recorded round-trip request, and the answer is a loop back to the start', () => {
    const input = roundTripFixture.input as RoundTripRequest;
    expect(buildRoundTripRequestBody(input)).toEqual(roundTripFixture.request);
    const loop = mapRouteResponse(asResponse(roundTripFixture.response));
    const coords = loop.geometry.coordinates;
    expect(distanceM(coords[0]!, coords.at(-1)!)).toBeLessThan(50);
    expect(loop.distanceM).toBeGreaterThan(input.distanceM * 0.8);
    expect(loop.distanceM).toBeLessThan(input.distanceM * 1.2);
  });
});
