# 0010: Opened GPX tracks: only flagged sections change

- Status: accepted
- Date: 2026-11-06

## Context

The user asked to open a GPX file made elsewhere (another planner, a recorded ride) and have the app do one thing
with it: when the track runs through flagged sections (ADR 0007), ask about each section, one by one or all at once,
whether to reroute around it. The track is the user's own choice, so everything else about it has to stay as it is.
A track from a file has no way IDs or surface details, and a recorded one strays a few metres either side of the
road.

## Decision

- **The track stays a track.** It isn't turned into waypoints and re-planned, and it isn't map-matched. It's shown on
  its own, in one colour, in place of the route until closed. It has a distance and, when the file has elevation, an
  elevation chart. It has no surfaces or ride time, since those need the engine's way details. It's kept for the
  session only.
- **Finding the sections** (`track/sections.ts`): a sample every 5 m along the track is compared with each flag's
  stretch, trimmed at the ends as for routing. A sample is on the flag within 15 m (GPS error). A run of samples
  counts when it covers at least half the stretch, so crossing a flagged way or touching it doesn't count. A gap of
  up to 60 m along the track (a stray GPS point) doesn't end a run. Sections less than 100 m apart are asked about as
  one. A track that rides a flag twice gets a question per pass.
- **Rerouting a section** (`track/reroute.ts`): the engine routes between two points on the track either side of the
  section, under the current profile, avoiding every flag. The way around is spliced in where it leaves and rejoins
  the track. Where it first rides back or on along the track to a junction, that part is dropped, so no out-and-back
  spur is left behind. It never reaches into a neighbouring section.
- **How far out to start.** Close to the flag, the way around keeps most of the track, but where there's no way
  around nearby (a bridge, a long dam), it has to come back just past the flag. That cost up to 6.4 km in a live
  check, where re-planning the whole route cost 0.45 km. So ways around are asked for from 50 m, 300 m, 1 km and
  3 km out, in parallel. The cheapest wins, where each metre of the user's track given up counts as a quarter metre
  of extra riding.
  Live, 6 routes around Vienna with 200–600 m flags: 50 m won twice, 1 km twice and 3 km twice. The 4 that didn't
  start at 50 m added 0.5–3.6 km less than 50 m would have. No new U-turns were left, and every corrected track,
  checked again, ran along no flag. The same held for a GPS-like trace (points 6 m either side).
- **No way around**: a way that still runs along a flag doesn't count. When none is left, the section is kept and
  the app says so. When the engine can't be reached, the question stays open to try again.

## Consequences

- A section's way around can be longer than a fresh route would take. A fresh route can leave the track anywhere,
  but a way around has to come back to it. The 3 km reach limits how much longer, but on a track that only crosses
  the Danube once it can still be kilometres more.
- Each section costs up to 4 engine requests; "all" runs the sections one after another, since each way around
  changes the track the next one is spliced into.
- The joins are within 15 m of the track, so a recorded track can get a short jog where the way around starts.
- An opened track can't be flagged or edited; to change more than the flagged sections, plan a route instead.
