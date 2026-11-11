import type { LonLat } from '../../types';
import type { RoundTripRequest, RouteRequest, RouteResult, RoutingEngine } from '../types';
import { RoutingError } from '../types';
import {
  buildMatchRequest,
  buildRoundTripRequestBody,
  buildRouteRequestBody,
  buildTraceRequestBody,
  type GhRouteRequestBody,
} from './request';
import {
  mapErrorResponse,
  mapRouteResponse,
  type GhErrorResponse,
  type GhRouteResponse,
} from './response';

export class GraphHopperEngine implements RoutingEngine {
  /** `baseUrl` defaults to the Vite dev proxy (`/gh` → localhost:8989). */
  constructor(
    private readonly baseUrl = '/gh',
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  route(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult> {
    return this.post(buildRouteRequestBody(request), signal);
  }

  trace(points: LonLat[], signal?: AbortSignal): Promise<RouteResult> {
    return this.post(buildTraceRequestBody(points), signal);
  }

  roundTrip(request: RoundTripRequest, signal?: AbortSignal): Promise<RouteResult> {
    return this.post(buildRoundTripRequestBody(request), signal);
  }

  match(track: readonly (readonly number[])[], signal?: AbortSignal): Promise<RouteResult> {
    const { query, gpx } = buildMatchRequest(track);
    return this.send(`match?${query}`, 'application/gpx+xml', gpx, signal);
  }

  private post(body: GhRouteRequestBody, signal?: AbortSignal): Promise<RouteResult> {
    return this.send('route', 'application/json', JSON.stringify(body), signal);
  }

  private async send(
    path: string,
    contentType: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<RouteResult> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new RoutingError('The routing engine is not reachable', 'unavailable');
    }

    const json: unknown = await res.json().catch(() => undefined);
    if (!res.ok) throw mapErrorResponse(res.status, json as GhErrorResponse | undefined);
    return mapRouteResponse(json as GhRouteResponse);
  }
}
