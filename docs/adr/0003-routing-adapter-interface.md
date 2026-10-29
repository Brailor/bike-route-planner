# 0003: Routing behind an adapter interface

- Status: accepted
- Date: 2026-10-29

## Context

The README requires that engines (GraphHopper now; BRouter as the fallback; MOTIS for transit later) can be swapped,
and that the UI never builds engine requests directly. GraphHopper's response format (points, path details as
`[from, to, value]` index ranges) is also not what the UI wants to work with.

## Decision

- `apps/web/src/routing/` defines engine-neutral types (`RouteRequest`, `RouteResult`) and a
  `RoutingEngine` interface (`route(req, signal): Promise<RouteResult>`).
- `routing/graphhopper/` implements it: builds the POST `/gh/route` body (including the custom model from ADR 0002),
  and maps the response to `RouteResult` / `PlannedRoute` (GeoJSON `[lon, lat, ele]`, per-segment surface, etc.).
- Request building and response mapping are pure functions with unit tests against recorded GraphHopper responses.
- Transit (M4) gets its own `TransitEngine` interface the same way.

## Consequences

- Swapping to BRouter means a second adapter, not UI changes.
- The recorded responses double as e2e fixtures (ADR 0004).
