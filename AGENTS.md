# Working on this repo

Instructions for coding agents, and for anyone else changing the code. What the app is for, and its scope, is in the
[README](README.md); read it before writing code.

## Where things are decided

- **Scope:** the README's milestones. Work through them in order; each milestone must work end to end before the
  next starts.
- **Plan and progress:** [docs/plan.md](docs/plan.md). Tick a todo only once it is done and verified (tests pass, and
  it has been tried against the real engine where that matters). For partial progress, add a note under the todo
  instead of ticking it. Update the plan when reality disagrees with it.
- **Decisions:** short ADRs in [docs/adr/](docs/adr/). Write one for any choice a later reader would otherwise have to
  reverse-engineer (an engine constraint, a library or licence decision, a data format).
- **Domain model:** `apps/web/src/types.ts` is the source of truth; don't copy it into docs.

## Working agreements

- **Commits:** don't commit or push unless asked. Work in commit-sized chunks, and end each chunk with a suggested
  commit message; the user commits.
- **Servers:** the user starts the app (`pnpm dev`) and the routing engine (`pnpm routing:start`) and controls how long
  they run. Don't stop or restart them without asking, and don't leave servers of your own running. For Playwright
  runs, use a separate port (5199) through a temporary config that extends `playwright.config.ts` (or
  `playwright.live.config.ts`), and delete it afterwards.
- **Dependencies:** pin exact versions (no ranges), at least two weeks old. Check the licence before adding one: code
  shipped to the browser is distributed to every visitor (see ADR 0008).
- **Privacy:** never send the user's personal details (name, email, location history) to an external service. The
  geocoder only gets what the user types and the map centre rounded to about 1 km; the user's location stays in the
  browser.

## Code conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Coordinates are always `[lon, lat]` (GeoJSON order), never `[lat, lon]`.
- Engine-specific code (GraphHopper, Photon, later MOTIS) lives behind an adapter interface, so engines can be swapped.
  The UI never builds engine requests directly.
- Logic is pure TypeScript and unit-tested (settings → custom model, response mapping, surfaces, scoring); React
  components only wire it together.
- Custom models are versioned JSON files in `services/routing/models/`. UI settings become model overrides through a
  pure, unit-tested function.
- Region limits live in one place: `apps/web/src/region.ts`.
- Attribute OpenStreetMap contributors on the map (ODbL).

## Tests

- Every change ships with tests: unit tests for logic, component tests for UI, and a Playwright e2e for each main
  flow. Existing tests must keep passing.
- Check that new tests can fail: remove or change each rule you added and confirm a test catches it. Rules no test can
  catch are usually redundant; remove them.
- Before handing over a chunk, run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and the e2e suite.
- `pnpm e2e` answers from recorded engine responses (ADR 0004). Re-record with `pnpm --filter web fixtures:record`
  (needs the engine). If a fixture changed only in metadata (`took`, visited nodes, timestamps, bounds), restore the
  old file rather than committing the noise.
- Run `pnpm e2e:live` (against the real engine) after changing models, `config.yml`, the requested path details or
  the OSM data.

## Routing engine

GraphHopper 11.1, configured in `services/routing/config.yml`. It must keep:

- `datareader.file` pointing at the `.pbf` in `data/`, and SRTM elevation enabled.
- These encoded values, at least: `surface`, `track_type`, `smoothness`, `road_class`, `bike_priority`,
  `bike_access`, `average_slope`, `max_slope`, plus `osm_way_id` (flags) and `crossing` (stops). Every path detail
  the app requests (`DETAILS` in `apps/web/src/routing/graphhopper/request.ts`) must be an encoded value.
- **LM, not CH**, for all profiles, so a custom model can be sent per request. Under LM a request may only lower
  weights: every `multiply_by` must be within [0, 1], and `distance_influence` can only go up. Base models are the
  most permissive version of each profile, and settings penalise rather than boost (ADR 0002).
- A car profile (milestone 4).
- `import.osm.ignored_highways` set explicitly (required since GraphHopper 11); empty, because the bike and car
  profiles together need every highway type.

Changing the encoded values needs a re-import: delete `services/routing/data/graph-cache` and start the engine
(about 5 minutes, about 6.3 GB heap). Until then the engine rejects requests for the new details, so the app can't
route. Ask the user before doing this to their engine.
