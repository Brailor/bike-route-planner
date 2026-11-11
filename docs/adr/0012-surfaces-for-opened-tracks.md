# 0012: Surfaces for opened tracks, by map matching

- Status: accepted
- Date: 2026-11-11

## Context

An opened GPX track (ADR 0010) showed no surface breakdown, while a planned route does. The user asked for one. A
file has no road data, and ADR 0010 left surfaces out because they need the engine's way details. GraphHopper 11.1
ships map matching (`POST /match`, GPX in, a route-shaped answer with the same path details as `/route`). It works
under LM, with no config change.

## Decision

- **Match only to read the roads; the track stays as it is.** The engine matches the track to the road network
  (`RoutingEngine.match`, behind the adapter, ADR 0003). The answer's geometry follows the roads, so it isn't used as
  the track. Instead, each of the track's own segments takes the attributes (surface, road class, track type, way
  ID, crossings) of the matched road segment beside its middle (`track/roads.ts`). Then the surface breakdown and
  the surface colours on the map work exactly as for a route.
- **Carrying the attributes over.** The search goes forward along the matched path only, from the last match, as far
  as the track has gone since plus 300 m. A road segment heading the other way counts as 20 m further off, so a
  road ridden out and back, or a lap ridden twice, is matched pass by pass. A track segment more than 30 m from every
  road in reach is "unmatched": its surface counts as unknown, and isn't estimated from the road type.
- **Matched on the gravel profile** (GraphHopper's bike), which may use nearly every way a ride can take, with GPS
  accuracy 20 m. GraphHopper's default of 40 m found the same roads (61.30 km against 61.32 km on a 61 km track) in
  twice the time (12 s against 6 s). Thinning the points first saved little (4.5 s) and changed the roads matched,
  so the track is sent as it is.
- **In the background.** A long ride takes the engine seconds (about 0.1 s a km), so the track opens at once and its
  panel says "Finding the surfaces…" until they arrive. Matching waits while a section is rerouted, and a track
  changed before its roads arrived is matched again. If matching fails (engine down, track off the road network),
  the panel says so.
- **Ways around bring their own.** A rerouted section's way around comes from the engine with its attributes; they
  are spliced in with the coordinates, so the track isn't matched again.

## Consequences

- Live: 5 routes (Vienna, Lobau, Graz, Győr; 22–61 km), each as a GPS-like trace (a point every 5 m, up to 6 m
  either side), got 98.5–99.4% of their length in the same surface category as the route itself. 0.4–1.5% was
  wrongly unknown.
- The track goes to the user's own engine (localhost, through the dev proxy), not to an outside service.
- A recorded track with a long gap (GPS off) makes the engine route the gap; a 200 km jump took it 66 s.
- Ride time for opened tracks now has what it needs (surfaces, elevation) and can follow.
