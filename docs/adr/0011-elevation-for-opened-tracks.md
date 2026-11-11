# 0011: Elevation for opened tracks from the hillshade's tiles

- Status: accepted
- Date: 2026-11-11

## Context

An opened GPX track (ADR 0010) showed an elevation profile only when every point in the file had an `<ele>`. Many
files have none (route exports from some planners, phones recording without a barometer), and some miss it on a few
points, so the user opened a GPX and saw no profile. GraphHopper has SRTM elevation, but no way to ask it for the
elevation at arbitrary points: only for a route it plans, and planning one would change the track.

## Decision

- **Gaps are filled in from the neighbours** when the file has elevation on some points (`fillGaps`): interpolated by
  distance along the track, or the nearest one at either end.
- **A file with none has it looked up** in Mapterhorn's terrarium tiles, the ones the hillshade layer already draws
  (ADR 0009): lidar in Austria, the 30 m Copernicus model elsewhere. The tiles are read at zoom 12 (about 13 m a
  pixel at 48° N, and the deepest zoom the tiles reach in Hungary), or further out for a track that would need more
  than 64 tiles. Each point's elevation is interpolated between the four pixels around it. It's done once, when the
  file is opened, before the track is shown; the button reads "Opening…" meanwhile.
- **The panel says where it came from.** "The file has no elevation; it's from Mapterhorn", linked to their
  attribution page. When the tiles can't be loaded, the track opens without a profile and says so.
- **Only the logic is unit-tested** (`track/elevation.ts`). Fetching and decoding a tile (`track/mapterhorn.ts`)
  needs a real browser, so the e2e suite answers tile requests with a generated PNG.

## Consequences

- Mapterhorn learns which zoom-12 tiles (about 6 km across) the track crosses. The map already loads tiles for the
  same area once the track is shown, so this tells them nothing the map tiles don't already tell OpenFreeMap. The
  track itself is never sent.
- A track of 100 km loads a few dozen tiles, once per file; the browser caches them.
- The tiles are a terrain model: on a bridge or in a tunnel, the profile follows the ground beneath, as GraphHopper's
  SRTM elevation does for planned routes.
- Ways around spliced into the track come with GraphHopper's elevation, so a profile may step slightly where they
  join.
