# 0007: Avoiding flagged sections

- Status: accepted
- Date: 2026-11-03

## Context

A flag marks a stretch of a route as unrideable (README M2). Every later route, under every profile, should keep
off it. The README's first idea was a buffered avoid-polygon in the custom model's `areas` with priority 0. A live
check against GraphHopper 11.1 showed two problems with that alone:

- An area penalises every edge it touches. That includes roads that cross the stretch or run right next to it.
  In the Lobau test the detour grew from 3.4 km to 5.2 km, when 3.7 km was enough.
- Priority 0 is a block. If there is no way around (the only bridge, or a waypoint on the flag), the route fails.

## Decision

- Each flag records the OSM way IDs its stretch runs on. They come from the route's `osm_way_id` path detail
  when the flag is made, so no map matching is needed.
- Each flag becomes one area, `flag_<i>`. The stretch is trimmed by 8 m at both ends, then buffered by 5 m with
  `@turf/buffer`. The trim keeps the same way continuing past the flag out of the area. The tight radius is
  fine because the stretch came from the routing graph itself.
- The rule is `in_flag_<i> && (osm_way_id == a || …)`, with `multiply_by: 0.01`. That is a strong avoid, not a
  block: a flagged edge costs as much as one 100 times longer. It is LM-safe (ADR 0002). A flag without way IDs
  uses the area alone.
- Every request carries every flag. The routing hook reroutes when the flags change, so confirming a flag
  reroutes at once.
- The panel warns when the current route still runs along a flag. That is a segment on a flagged way whose middle
  is inside the trimmed, buffered stretch (`usesFlag`).

## Consequences

- Checked live: the Lobau route goes around a flagged stretch (3.4 → 3.7 km, against 5.2 km with the area alone,
  which also shut out the other roads through it). A flag over the start can't be avoided, so the route still comes
  back and the panel warns.
- Legs that don't touch a flag come back identical, because GraphHopper routes each leg between consecutive
  waypoints on its own. That gives the README's partial reroute without extra requests.
- `@turf/buffer` brings in a JTS port. The main bundle grew from 271 kB to 564 kB (87 → 154 kB gzipped). If that
  matters, load it lazily, only once there are flags.
- Requests grow with the number of flags. If that becomes a problem, bake the penalties into the graph at import
  time (README M2 "Later").
