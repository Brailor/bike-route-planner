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
  - 776 MB pbf → server ready in **3 min 24 s** (~75 s import + SRTM, ~2 min LM for 4 profiles). Heap peak ~6.3 GB
    used (8 GB `-Xmx`; earlier note of 5.5 GB read the wrong log figure). `data/graph-cache` is 1.5 GB, `data/srtm`
    38 MB. Later starts load the cache
  - Austria + Hungary (1.1 GB merged pbf): ready in **4 min 46 s**, heap peak ~6.3 GB used, graph cache 2.1 GB.
    Default `GH_HEAP` raised to 10g
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

- [x] Vitest + React Testing Library, plus one smoke test
  - Vitest 5.0.4 (jsdom), RTL 16.3.3. `MapView.test.tsx`: style URL, expanded attribution, explicit worker URL.
    Confirmed it fails when the attribution is switched to compact
- [x] Playwright, plus one smoke test (the map renders)
  - `e2e/map.spec.ts`: canvas visible, an OpenFreeMap `.pbf` tile loads (proves the worker runs), attribution
    shown, no console errors. Confirmed it fails without the `workerUrl` fix, and that with `CI=1` it starts and
    stops its own Vite server
- [x] UI test coverage (added on request)
  - Component tests for ProfilePanel, SurfaceBar, ElevationChart, RouteSummary (GPX download), Sidebar (guidance,
    errors, undo/redo/clear) and the undo shortcuts. `pnpm --filter web test:coverage`: unit line coverage 65% → 91%
  - Playwright `e2e/map-interactions.spec.ts` (stub engine draws straight routes through the clicked points): line
    hover ↔ chart, line-drag insert + undo, click on line, marker drag on the line, marker click removal. It found a
    real bug (clicking the last marker removed and re-added it), now fixed
- [x] GitHub Actions: lint, typecheck, unit tests, e2e (fixture mode)
  - `.github/workflows/ci.yml` (format, lint, typecheck, unit, Playwright; report uploaded on failure). First run
    green on `5807344` (run 40846428656, ~1 min 40 s, all steps passed)
- [x] ADRs 0001–0004 in `docs/adr/`
  - Plus 0005: TypeScript 7 for compiling, with TS 6 for tooling

**Spikes (cheap, early, de-risking)**

- [ ] Gravel sanity check: route 3–5 known gravel/MTB areas (e.g. Wienerwald, Leithagebirge) with `routing.http`, then compare against local knowledge and satellite imagery
  - Engine side done: [docs/spikes/2026-10-29-gravel.md](spikes/2026-10-29-gravel.md). Verdict on paper: keep
    GraphHopper. Default gravel is 0–12% unpaved; "likely paved" penalty × 0.4 + cancelled cycle-network boost
    gives 55–77% likely unpaved at ≤ 1.16× distance
  - Still open: ground truth on the GPX files (needs local knowledge), and the forest-road legality tag check
    (Overpass timed out)
- [ ] Transitous: query a few MÁV and ÖBB journeys; check coverage and whether `bikes_allowed` is present
  - Feed side done: [docs/spikes/2026-10-29-transit.md](spikes/2026-10-29-transit.md). Coverage good (incl.
    cross-border); `bikes_allowed` absent from all rail feeds (0 of 57,169 trips); Austrian feed ends 2026-12-12
  - Not done: live `/plan` queries. Blocked on Transitous policy (open-source only; this repo is private, no
    licence). Decide: publish under an OSS licence, or self-host MOTIS

### M1: Profiles + core routing

**Core (pure, unit-tested)**

- [x] Domain types from the README's data model in `apps/web/src/types.ts`
- [x] `RoutingEngine` interface + `GraphHopperEngine` (POST `/gh/route`, `points_encoded=false`, `elevation=true`, `details=[surface, road_class, track_type, smoothness, average_slope]`)
  - Details are `surface, road_class, track_type, osm_way_id` (what the breakdown and M2 flags need). Typed
    `RoutingError` (`no_route` / `unavailable` / `bad_request`); aborts pass through
- [x] Response mapping → `PlannedRoute`, with tests against recorded fixtures
  - Maps to the engine-neutral `RouteResult` (geometry + per-segment attribute spans). Fixtures recorded from the
    live engine via `pnpm --filter web fixtures:record`; a test fails if the request builder drifts from them
- [x] `buildCustomModel(settings)`: profile base + overrides (gravel/MTB off-road slider, avoid main roads), within the LM penalise-only constraint
  - Per the gravel spike: penalise _likely_ paved (incl. untagged ordinary roads and `grade1` tracks), not just
    tagged paved, and cancel the cycle-network boost on likely-paved ways
  - Slider: 50 = neutral; towards 100 penalises likely-paved down to × 0.3 (+ network cancel); towards 0 penalises
    likely-unpaved. Unit test sweeps all settings for LM-safe factors; 6 generated models accepted by the live engine
- [x] Surface breakdown: map OSM `surface` values to asphalt / gravel / ground / unknown, as % of distance
  - Categories paved / gravel / ground / unknown; missing tags inferred from road class + track grade and reported
    separately as `inferredMeters`
- [x] Elevation series (cumulative distance × elevation) and ascent with light smoothing
  - Ascent comes from GraphHopper (server-side SRTM smoothing, see `config.yml`); no extra client smoothing
- [x] GPX export (track with elevation, plus route name)
  - `toGpx` + `gpxFileName`; tested for well-formedness, lat/lon order and escaping

**UI**

- [x] Click map to add waypoints: the first is the start, the last is the end, and the rest are intermediate. Drag to move, click a marker to remove
  - Confirmed in Chromium against the live engine. **Gotcha:** markers sit inside the map's canvas container, so
    presses on them also reach the map; and display-only markers (hover dot) must have `pointer-events: none` on
    their wrapper or they swallow presses on waypoints beneath
- [x] Insert a waypoint by dragging the route line
  - Inserted into the leg it was dragged from (`insertionIndex`, unit-tested); a plain click on the line does nothing
- [x] Profile switcher (road / gravel / MTB) and settings panel (off-road slider, avoid main roads)
  - Each profile keeps its own settings. Defaults: gravel off-road 80, MTB 60 (gravel base is road-like)
- [x] Re-route on change: debounce and abort in-flight requests
  - 250 ms debounce; `useRouting.test.ts` covers debounce, abort, latest-result-wins and errors
- [x] Route line on the map, coloured by surface
  - Dashed where the surface is inferred (missing OSM tag)
- [x] Stats panel: distance, ascent, estimated time (GraphHopper's time for now; replaced in M3), surface breakdown bar
- [x] Elevation chart (SVG), with hover linked both ways to a marker on the map
- [x] Export GPX button
- [x] Error and loading states (engine down, no route found)
- [x] Undo/redo for waypoint edits (added on request): Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y, plus buttons
  - Covers add/insert/move/remove/clear (100 steps); profile and settings changes aren't recorded. Unit + e2e tested

**Done-when checks**

- [x] Playwright: place waypoints → route appears → switch profile → route changes → move slider → route changes → export GPX
  - `e2e/plan-route.spec.ts` with recorded fixtures (ADR 0004): route, hover link, profile switch, slider and
    avoid-main-roads change the request, GPX download. Plus engine-down and no-route tests
  - With fixtures the slider can't change the route itself; that part was confirmed live (Donau-Auen: road 99%
    paved; gravel 80 → 47% gravel; gravel 100 → 76% gravel; gravel 0 → 99% paved)
- [ ] Manual check with the live engine on the spike's gravel areas
  - Scripted live run done for Donau-Auen only. Needs you: try the other areas in the app
- [x] `e2e:live` (ADR 0004): opt-in Playwright run against the real engine
  - `pnpm e2e:live` (needs `pnpm routing:start`; not in `pnpm e2e` or CI). 9 tests in ~4 s: recorded fixtures vs
    live engine (status, details, distance ±10%), every profile/setting accepted under LM, Hungary + cross-border
    routes, and the app against the real engine (Donau-Auen: road ≥ 90% paved, slider 100 raises gravel, slider
    0 back to ≥ 90% paved)
  - Confirmed it fails usefully: engine down → "not reachable … pnpm routing:start"; an LM-violating factor → lists
    each rejected setting with GraphHopper's message. (`buildCustomModel` also clamps to [0, 1] as a safety net)

### M1.5: Location and address search (added on request)

- [x] Open the map on the user's location
  - Browser geolocation after the map loads; jumps there (zoom 12) only if it's inside `SUPPORTED_BOUNDS`
    (`region.ts`, one box around AT + HU, so it also takes in some neighbours' border areas) and the map hasn't
    moved and has no waypoints yet. Otherwise stays on Vienna. A dot marks the user's position either way
  - Unit tests (`locate`, `region`, MapView opening position) and e2e `location.spec.ts` (Graz → centred there;
    Berlin and denied → Vienna). Each condition confirmed to fail a test when removed
- [x] `Geocoder` adapter + Photon implementation (public API for now), dev proxy `/geo`
  - ADR 0006. `geocoding/types.ts` + `geocoding/photon/` (request, response, `PhotonGeocoder`). Region-limited
    (`bbox`), ranking point rounded to ~1 km, queries under 3 characters not sent, identical-looking results merged;
    errors as `GeocodingError` (`unavailable` incl. 429 / `bad_request`), aborts pass through
  - Fixtures from the public API (`fixtures:record-photon`): a partial name, a Graz address, a Hungarian town, no
    match. Each rule confirmed to fail a test when removed. Proxy confirmed live (`/geo/api` → 200). No UI yet
- [ ] Start and destination address fields with autocomplete

### M2: Flag unrideable sections

- [x] IndexedDB storage layer (`idb`) for flags
  - `storage/db.ts` (`openPlannerDb`: versioned upgrade steps, `flags` store keyed by `id`, `createdAt` index) and
    `storage/flagStore.ts` (`FlagStore`: list oldest first / save-or-replace / remove). idb 8.0.4; tests on
    fake-indexeddb 6.2.5 (6.2.6 was under two weeks old), incl. survive close + reopen. Each test confirmed to fail
    against a matching break (unordered list, `add` instead of `put`, no-op remove). Not wired into the UI yet
- [x] Segment selection on the route (two handles on the line, or click a segment)
  - Two handles (click-a-segment deferred, on request). "Flag a section" puts them at 40% / 60% of the distance;
    dragging snaps each to the nearest route point; the stretch shows as a halo under the route line, with its
    length in the panel. Cancel or Esc ends it, and so does any new route (indices point into the old geometry).
    While selecting, map clicks, line drags and waypoint markers don't edit waypoints
  - Pure helpers in `flags/selection.ts`. Unit + component tests, e2e in `map-interactions.spec.ts`; each guard and
    the snap confirmed to fail its test when removed. Nothing to save yet: that's the flag form, next
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
  - GTFS has no `bikes_allowed` for ÖBB/MÁV/GYSEV: use rules by train category (route short name) + corrections;
    don't rely on MOTIS `requireBikeTransport` (transit spike)
- [ ] Car routing via the GraphHopper car profile; park-at-end + train-to-start combos
  - Car currently snaps onto Austrian forest tracks: enable `country_rules` and penalise `road_access` (gravel spike)
- [ ] Ranked options UI, both directions
- [x] Hungary: add `hungary-latest.osm.pbf` (a merged extract or a second instance)
  - Done early (on request): `setup.sh` merges the Austria and Hungary extracts with osmium into one graph.
    Confirmed live: routes inside Hungary (Budapest–Szentendre, Győr–Pannonhalma, Tihany, Budapest–Esztergom) and
    across the border (Wien–Sopron, Neusiedl–Fertőrákos, Wien–Budapest by car); a Győr route planned in the app

### M5: Station-to-station discovery

- [ ] To plan after M4

---

## Risks

- **GraphHopper gravel quality.** Mitigated by the M0 spike, with BRouter as the fallback.
- **LM penalise-only constraint.** This affects how profile settings are designed; settled in ADR 0002 before M1 UI work.
- **Transitous MÁV coverage / sparse `bikes_allowed`.** Mitigated by the M0 spike, plus user corrections in M4.
- **Austria + Hungary memory/disk.** Austria alone is fine on this machine; measure before adding Hungary.
