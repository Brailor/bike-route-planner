# Implementation plan

Working plan for building the app described in the [README](../README.md). The README owns scope; this file owns
_how_ and _in what order_. Tick boxes as work lands; update the plan when reality disagrees with it.

## Approach

1. **M0: skeleton first.** Get an empty-but-wired vertical slice running: GraphHopper serving Austria, the web
   app showing a map, the dev proxy working and tests running. Every later milestone just adds features to it.
2. **Validate the engine early.** The whole project depends on GraphHopper handling gravel well. Before building
   much UI, run real requests over a few known Austrian gravel/MTB areas. If the results are bad, switch to BRouter
   while switching is still cheap.
3. **Pure core, thin UI.** The logic is pure TypeScript and unit-tested: settings → custom model, GraphHopper
   response → `PlannedRoute`, surface breakdown, GPX, and later scoring. React components only wire it together.
4. **One milestone at a time, end to end.** Each one finishes with its "Done when" criteria met, plus a Playwright test.

## Key technical decisions (to record as ADRs)

| #    | Decision                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | GraphHopper as the routing engine, BRouter as the fallback | As in the README; record why OSRM and Valhalla were rejected.                                                                                                                                                                                                                                                                                                                           |
| 0002 | LM (not CH) and per-request custom models                  | **Constraint:** with LM, a custom model sent per request can only _lower_ priority/speed relative to the server profile. Server-side profiles must therefore be the "most permissive" version, and UI settings work by penalising. For example, the gravel slider at 0 penalises unpaved surfaces and at 100 penalises paved ones. Verify this against the installed GH version's docs. |
| 0003 | Routing adapter interface                                  | `RoutingEngine.route(req): Promise<RouteResult>`. The UI never sees GraphHopper JSON.                                                                                                                                                                                                                                                                                                   |
| 0004 | Playwright e2e uses recorded GraphHopper fixtures          | This keeps e2e fast and runnable without a 6 GB JVM. A separate opt-in `e2e:live` runs against the real engine.                                                                                                                                                                                                                                                                         |

## Code layout (inside the README's structure)

```
apps/web/src/
  map/            MapView, waypoint markers, route layer, flag layer (M2)
  routing/        RoutingEngine interface, graphhopper/ adapter, request/response mapping
  profiles/       settings → custom-model transform (pure)
  route/          stats, surface breakdown, elevation series (pure)
  gpx/            export (M1), import (M4)
  ui/             panels, profile switcher, slider, elevation chart
  state/          app store (zustand)
  storage/        IndexedDB via `idb` (M2)
services/routing/
  config.yml, models/*.json, routing.http
  scripts/setup.sh   downloads the pinned GraphHopper jar and the Geofabrik .pbf into data/
```

---

## TODO

### M0: Project setup

**Tooling**

- [x] Install pnpm (`npm i -g pnpm`; corepack isn't bundled with Node 26)
- [x] Confirm GraphHopper runs on the installed Java 26; otherwise install Temurin 21
  - GraphHopper **11.1** imports and serves on Java 26. It prints harmless warnings (final-field mutation,
    `sun.misc.Unsafe`)
- [x] Root `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `tsconfig.base.json` (strict)
  - **TypeScript 7.0.2** as `tsc`, with TS 6 alongside it for tooling. This is the setup from the TS 7 announcement:
    `typescript` → `npm:@typescript/typescript6` (the 6.0 JS API, used by typescript-eslint) and
    `@typescript/native` → `npm:typescript@7.0.2` (provides `tsc`). Drop the alias once typescript-eslint supports
    TS 7.1 (typescript-eslint#10940)
  - Checked with a throwaway project: `tsc` 7 enforces the base config, and typed ESLint runs on TS 6
  - `.nvmrc` is 26 (not LTS yet); `engines` is `>=24`
- [x] ESLint + Prettier, shared config at the root; root scripts `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`
  - All scripts exit 0. Typed rules (`no-explicit-any`, `consistent-type-imports`, `no-unsafe-*`) confirmed firing
  - `README.md` is in `.prettierignore`, so its hand formatting is kept
- [x] Extend `.gitignore`: `services/routing/data/`, `*.jar`, `playwright-report/`, `test-results/`

**Routing service**

- [x] Pick and pin the GraphHopper release; read its `config-example.yml` for current encoded-value names
  - 11.1. Two config gotchas: built-in model names (`mtb.json`, `car.json`) can't be reused, and
    `import.osm.ignored_highways` must be set explicitly (we use `''`)
- [x] `scripts/setup.sh`: download the jar and `austria-latest.osm.pbf` (skip if already present)
  - Austria download plus MD5 check confirmed (~8 min). The jar branch wasn't exercised: the jar was already
    present, downloaded manually from the same URL. `pnpm routing:setup` / `pnpm routing:start` from the root
- [x] `config.yml`: pbf path, encoded values from the README, SRTM elevation, LM for all profiles, `road`/`gravel`/`mtb`/`car` profiles
  - Also `osm_way_id` (gives M2 its way IDs as a path detail), `bike_network`, `road_environment`, `max_speed`
- [x] `models/*-model.json` (road, gravel, mtb, car): first-pass base models
  - GH 11.1 built-ins (road = racingbike, gravel = bike, mtb, car) with `bike_elevation.json` merged in
  - Default gravel is ~93% asphalt on the Hütteldorf → Tulln sample, so tuning gravel is M1 work
- [x] First import; note the import time and memory use
  - 776 MB pbf → server ready in **3 min 24 s** (~75 s import + SRTM, ~2 min LM for 4 profiles). Heap peak ~5.5 GB
    of the 8 GB `-Xmx`. `data/graph-cache` is 1.5 GB, `data/srtm` 38 MB. Later starts load the cache
- [x] `routing.http`: sample requests (plain route, with a custom model, with `details`, with elevation)
  - All 6 requests return 200 in 17–289 ms. Confirmed live: the per-request custom model changes the route
    (gravel 93% → 39% asphalt when paved is penalised), the avoid-area forces a detour (26.1 → 26.9 km, 0 points
    inside the box), and the LM constraint rejects `multiply_by: 1.5` with HTTP 400

**Web app**

- [x] Scaffold `apps/web` (Vite + React + TS strict)
  - Vite 8.3.4, React 19.3.1. `typecheck` (TS 7 `tsc`), `lint` (incl. react-hooks and react-refresh rules,
    confirmed firing), `build` and root `pnpm dev` all work
- [x] `maplibre-gl` + `react-map-gl` with the OpenFreeMap Liberty style, with OSM attribution visible
  - maplibre-gl 6.14.0, react-map-gl 8.1.3. **Gotcha:** maplibre-gl 6 loads its worker relative to its own
    module, which Vite's bundling breaks (blank map, "Worker failed to load"). Fixed with the `workerUrl` prop +
    `maplibre-gl-worker.mjs?url`
  - Confirmed with headless-Chromium screenshots in dev and prod: tiles render, no console errors, attribution
    "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" shown expanded
- [x] Vite proxy `/gh` → `http://localhost:8989`
  - `localhost:5173/gh/info` returns GraphHopper's info (profiles road, gravel, mtb, car)
- [ ] `.vscode/tasks.json` compound "dev" task (GraphHopper + Vite)
  - Written. Its ready patterns match the real GraphHopper and Vite logs; still needs one run inside VS Code

**Tests & docs**

- [ ] Vitest + React Testing Library, plus one smoke test
- [ ] Playwright, plus one smoke test (the map renders)
  - `@playwright/test` 1.64.1 + Chromium installed (used for the map screenshots); config and test not written yet
- [ ] GitHub Actions: lint, typecheck, unit tests, e2e (fixture mode)
- [ ] ADRs 0001–0004 in `docs/adr/`

**Spikes (cheap, early, de-risking)**

- [ ] Gravel sanity check: route 3–5 known gravel/MTB areas (e.g. Wienerwald, Leithagebirge) with `routing.http`, then compare against local knowledge and satellite imagery
- [ ] Transitous: query a few MÁV and ÖBB journeys; check coverage and whether `bikes_allowed` is present

### M1: Profiles + core routing

**Core (pure, unit-tested)**

- [ ] Domain types from the README's data model in `apps/web/src/types.ts`
- [ ] `RoutingEngine` interface + `GraphHopperEngine` (POST `/gh/route`, `points_encoded=false`, `elevation=true`, `details=[surface, road_class, track_type, smoothness, average_slope]`)
- [ ] Response mapping → `PlannedRoute`, with tests against recorded fixtures
- [ ] `buildCustomModel(settings)`: profile base + overrides (gravel/MTB off-road slider, avoid main roads), within the LM penalise-only constraint
- [ ] Surface breakdown: map OSM `surface` values to asphalt / gravel / ground / unknown, as % of distance
- [ ] Elevation series (cumulative distance × elevation) and ascent with light smoothing
- [ ] GPX export (track with elevation, plus route name)

**UI**

- [ ] Click map to add waypoints: the first is the start, the last is the end, and the rest are intermediate. Drag to move, click a marker to remove
- [ ] Insert a waypoint by dragging the route line
- [ ] Profile switcher (road / gravel / MTB) and settings panel (off-road slider, avoid main roads)
- [ ] Re-route on change: debounce and abort in-flight requests
- [ ] Route line on the map, coloured by surface
- [ ] Stats panel: distance, ascent, estimated time (GraphHopper's time for now; replaced in M3), surface breakdown bar
- [ ] Elevation chart (SVG), with hover linked both ways to a marker on the map
- [ ] Export GPX button
- [ ] Error and loading states (engine down, no route found)

**Done-when checks**

- [ ] Playwright: place waypoints → route appears → switch profile → route changes → move slider → route changes → export GPX
- [ ] Manual check with the live engine on the spike's gravel areas

### M2: Flag unrideable sections

- [ ] IndexedDB storage layer (`idb`) for flags
- [ ] Segment selection on the route (two handles on the line, or click a segment)
- [ ] Flag form (reason + note); flag layer on the map, toggleable, editable, deletable
- [ ] Flag → buffered avoid-polygon (turf) → custom-model `areas` with priority 0
- [ ] Partial reroute: only re-request the legs between the waypoints around the flag
- [ ] Map-match flags to OSM way IDs (optional; GraphHopper map-matching)
- [ ] e2e: flag a segment → alternative appears → fresh route avoids it

### M3: Workout-matched routes

- [ ] Physics speed model (FTP, weight, CdA, Crr per surface, gradient) + user settings form
- [ ] Workout input: manual duration and the first file format (decide ZWO vs Intervals.icu)
- [ ] Candidate generation: GraphHopper `round_trip` with several seeds and distances, plus random-waypoint loops
- [ ] Segment features: climbs, uninterrupted stretches (signals/stops from OSM)
- [ ] Scoring function (time fit, interval-terrain fit, surface fit, flags), unit-tested
- [ ] Top-3 UI with intervals overlaid on the map and the elevation chart
- [ ] e2e + ±10% time check

### M4: Getting there and back

- [ ] GPX import
- [ ] Home location setting
- [ ] `TransitEngine` adapter + MOTIS/Transitous implementation (respect its usage policy)
- [ ] Bike-carriage marking per leg + user "bike not allowed" corrections
- [ ] Car routing via the GraphHopper car profile; park-at-end + train-to-start combos
- [ ] Ranked options UI, both directions
- [ ] Hungary: add `hungary-latest.osm.pbf` (a merged extract or a second instance)

### M5: Station-to-station discovery

- [ ] To plan after M4

---

## Risks

- **GraphHopper gravel quality.** Mitigated by the M0 spike, with BRouter as the fallback.
- **LM penalise-only constraint.** This affects how profile settings are designed; settled in ADR 0002 before M1 UI work.
- **Transitous MÁV coverage / sparse `bikes_allowed`.** Mitigated by the M0 spike, plus user corrections in M4.
- **Austria + Hungary memory/disk.** Austria alone is fine on this machine; measure before adding Hungary.
