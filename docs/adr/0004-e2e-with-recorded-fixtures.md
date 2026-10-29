# 0004: Playwright e2e uses recorded GraphHopper responses

- Status: accepted
- Date: 2026-10-29

## Context

End-to-end tests need routes on screen, but GraphHopper needs a ~1.1 GB OSM extract, ~6.3 GB of heap and ~5 min to
import. That's too heavy and slow for every CI run.

## Decision

- Default e2e runs (`pnpm e2e`, and CI) intercept `/gh/*` with Playwright's `page.route` and answer from recorded
  GraphHopper responses kept in the repo.
- Fixtures are recorded from a real local instance with a small script, so they match the pinned GraphHopper version.
  Re-record them when the version, models or OSM extract change meaningfully.
- A separate opt-in run (`e2e:live`) uses the real engine, for manual checks before milestones close.
- Map tiles still come from OpenFreeMap in e2e (the map-render smoke test depends on them).

## Consequences

- CI is fast and needs no Java.
- Fixtures can drift from what the engine would return now. `e2e:live` and the routing unit tests catch that.
