import type { RouteRequest, RouteResult, RoutingEngine } from '../types';
import { RoutingError } from '../types';
import { buildRouteRequestBody } from './request';
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

  async route(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRouteRequestBody(request)),
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
