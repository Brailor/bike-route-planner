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
  - Each profile keeps its own settings. Defaults: gravel off-road 80 (gravel base is road-like). MTB has no slider
    since 2026-11-04 (user's call): always off-road 100. Live, Hütteldorf → Kahlenberg: 2% paved instead of 30% at 60
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
- [x] Start and destination address fields with autocomplete
  - `RouteEnds` (two `AddressField` comboboxes: mouse or arrows + Enter, Esc / leaving restores) and
    `usePlaceSearch` (250 ms debounce, aborts stale requests, keeps the last list while the next loads, ranked near
    the map centre). Picks are undoable waypoint edits (`setStart` / `setDestination`); the map flies to one point or
    fits both ends clear of the side panel. Destination needs a start; both frozen while flagging. Map-placed points
    show as "Point on map"
  - Unit + component tests, e2e `address-search.spec.ts` (recorded Photon answers). Each behaviour confirmed to
    fail a test when removed

### M2: Flag unrideable sections

Decided with the user (2026-11-02): a flag is only applied once confirmed ("Flag & reroute");
the flagged stretch stays visible on the map but is never part of the GPX (export only writes the current route);
flags are avoided strongly rather than blocked, and when a route still has to use one the panel warns.

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
- [x] Flag form (reason + note); flag layer on the map, toggleable, editable, deletable
  - Done: confirm form (optional reason + note, "Save flag") → `AvoidFlag` with the stretch's geometry and the OSM
    way IDs under it (`flags/flag.ts`); store `flags`; `useFlagPersistence` loads them at startup and keeps
    IndexedDB in step; dashed layer (white casing, so it reads as flagged over the route); count in the panel.
    Unit + component tests, e2e `flags.spec.ts` (survives a reload). Each part confirmed to fail a test when removed
  - Managing (`FlagList`): list with reason, length and note; "Show on map" toggle (hidden flags still apply to routes,
    and can't be clicked); picking a flag in the list or clicking its line on the map (a flag wins over the route
    under it) opens it for editing, highlighted and brought into view; edit reason/note; delete with an inline
    confirm, which frees the section for routing again. Unit + component tests; e2e: edit kept across reload,
    delete reroutes back, map click incl. over the route and after a reload. Each part confirmed to fail a test when
    removed, except the hidden-layer filter on clicks, which the test only catches some of the time
- [x] Flag → buffered avoid-polygon (turf) → custom-model `areas` with priority 0
  - ADR 0007. Priority × 0.01 (strong avoid, not a block, as decided) and only on the flag's OSM ways: an area alone
    also blocked crossing roads (live: 3.4 → 5.2 km detour instead of 3.7). Area = stretch trimmed 8 m at each end,
    buffered 5 m (`@turf/buffer` 7.4.0; tslib pinned to 2.8.1 via override, 2.9.1 too new). Panel warns when the route
    still runs along a flag (`usesFlag`); confirm button is now "Flag & reroute"
  - Fixtures `gravel-flagged` (way around: 3.4 → 3.7 km, flag untouched) and `gravel-flagged-start` (no way around:
    route kept, flag used) recorded from the app's own flag code. e2e `flags.spec.ts`; `e2e:live` checks both cases
    in the app against the real engine (13/13 pass). Each rule confirmed to fail a test when removed
  - Main bundle 271 → 564 kB (gzip 87 → 154 kB), nearly all JTS from turf; lazy-loading it is an option
- [x] Partial reroute: only re-request the legs between the waypoints around the flag
  - No extra machinery: GraphHopper routes each leg on its own, so legs away from a flag come back identical.
    Checked live (3 waypoints, flag in leg 2): leg 1 point-for-point identical, leg 2 rerouted (13.7 → 13.8 km)
- [x] Flag a section without a route (added on request, 2026-11-03)
  - "Flag on map": clicks are traced by `RoutingEngine.trace` (GraphHopper: mtb profile, `distance_influence: 5000`,
    so the most direct way over any road or path; live Donau-Auen: mtb 15.4 km by default, 13.1 km traced, car 13.2
    km). The trace becomes the flag (geometry + way IDs from the graph, so avoiding works as for route flags).
    Route, waypoints and address fields stay frozen while marking; Esc cancels
  - Two clicks for the ends, then drag either end to adjust. A "point by point" mode was tried alongside it and dropped
    (user's choice, 2026-11-03)
  - Unit + component tests; e2e `flag-on-map.spec.ts` (two clicks, third ignored, re-trace on drag, clicking an end
    adds nothing, saved flag sent with the next route, marking over an existing route); `e2e:live` marks the
    Donau-Auen middle with no route, then the route avoids it. Each part confirmed to fail a test when removed
- [ ] Map-match flags to OSM way IDs (optional; GraphHopper map-matching)
  - Not needed so far: flags take their way IDs from the route or the trace
- [x] e2e: flag a segment → alternative appears → fresh route avoids it
  - `flags.spec.ts` (recorded answers: request carries the flag rules, route 3.4 → 3.7 km, kept after reload and sent
    with a fresh route) and `e2e:live` (real engine: route changes with no warning, Clear + replan gives the same
    detour; a flag over the start warns)

### M3: Workout-matched routes

- [x] Physics speed model (FTP, weight, CdA, Crr per surface, gradient) + user settings form
  - Model done (`speed/physics.ts`, `speed/model.ts`): steady-state power ↔ speed (gravity, rolling, drag with air
    density by altitude, 97% drivetrain); per-profile bike setups (mass, CdA, Crr and safe descent speed per surface
    category); gradients smoothed over 100 m; walking floor ~4 km/h; time at every route point for laying workouts
    over the route later. Sanity: road 250 W flat ≈ 38 km/h; gravel 200 W flat asphalt 28–33 km/h. Unit-tested,
    each rule confirmed to fail a test when removed. Values are textbook defaults until calibrated on real rides
  - Settings form (sidebar "Rider", collapsed to a one-line summary): FTP, weight and ride power as % of FTP;
    empty fields use defaults (200 W, 75 kg, 65%), out-of-range values are marked and not applied, a decimal comma
    works. Saved in IndexedDB (database version 2 adds a `settings` store; tested upgrading a version 1 database with
    flags). The route summary's time is now the model's: the 3.4 km fixture route is 8 min at 130 W, where
    GraphHopper said 17. Unit + component tests, e2e `rider.spec.ts` (time follows the settings, kept after reload);
    each rule confirmed to fail a test when removed
- [ ] Configurable bike setups, per profile, in rider terms rather than raw coefficients
  - Bike weight (kg); riding position (upright / hoods / drops → CdA); tyres for gravel and MTB (e.g. 35 mm fast /
    40–45 mm all-round / knobby → Crr per surface). Maybe one "descending: cautious / normal / confident" for the
    descent caps. No raw CdA/Crr fields: calibration from ride history should set those instead
- [x] Workout input: manual duration, ZWO and FIT workout files
  - Formats decided (2026-11-04), to cover Garmin, MyWhoosh and Intervals.icu: ZWO (MyWhoosh imports ZWO and can't
    export; Intervals.icu and Zwift export it) and FIT workouts (Garmin devices, Intervals.icu). Intervals.icu also
    has MRC/ERG/JSON, not needed while ZWO and FIT cover it
  - Sidebar "Workout": a duration ("1:30" or minutes) or a file; shows name, length, a power profile coloured by zone,
    and what couldn't be carried over. Kept for the session only (not saved yet)
  - ZWO (`workouts/zwo.ts`): steady, warm-up/cool-down/ramp (as their average), on/off intervals, free ride, max
    effort; attribute case ignored; unusable steps skipped with a reason; running workouts rejected
  - FIT (`workouts/fit.ts`): our own reader, Garmin's SDK in tests only (ADR 0008, licence). Time steps, nested
    repeats, % FTP / watt / zone power targets; distance, lap-button and condition steps skipped with a warning;
    heart-rate targets timed at ride power
  - Workout model: an interval's power is % FTP or watts; zones derived from FTP when shown. Unit + component tests,
    tests against files written by Garmin's SDK, e2e `workout.spec.ts`; each rule confirmed to fail a test when removed
  - Still open: try a real export from Garmin Connect and from Intervals.icu (needs the user's files)
- [x] Candidate generation: GraphHopper `round_trip` with several seeds and distances, plus random-waypoint loops
  - `loops/candidates.ts` (`findLoops`): 6 round trips (seeds) and 6 loops through 3 points on a circle through the
    start (6 directions), sized from the model's flat cruising speed × 0.9 (circles: roads ≈ 1.35 × straight lines,
    measured live 1.2–1.5). Each loop off the target time by more than 5% is asked for again in the same direction,
    scaled by how far off it was; the closer one is kept. Loops sharing over 80% of their ways are merged. Profile
    settings and flags go with every request; each loop is timed with the speed model
  - Per loop rather than one shared correction, because the error is mostly terrain. Live, 2.5 h gravel at 130 W:
    one shared correction gave 5/16 (Stephansplatz) and 8/16 (Lobau) loops within ±10%; per loop, 8/12 and 9/12
    (1 h from Stephansplatz: 9/12), 20–24 requests, under 0.8 s
  - `RoutingEngine.roundTrip` (GraphHopper `algorithm: round_trip`, works with LM and custom models); recorded
    fixture `gravel-round-trip` with a live contract check. Unit-tested with a fake engine; each rule confirmed to
    fail a test when removed. No UI yet (comes with the top-3 UI)
- [x] Segment features: climbs, uninterrupted stretches (signals/stops from OSM)
  - `loops/features.ts`. Climbs (`findClimbs`): from a low point to the top, riding through dips of up to 10 m;
    kept from 20 m gain and 3% average. Each with length, gain, gradient and riding time (speed model)
  - Stops (`findStops`) from GraphHopper's `crossing` value, newly in `graph.encoded_values` (needs a re-import, about
    5 min): traffic signals and level crossings always; zebra and unmarked crossings only where the route is the path
    crossing the road. Within 30 m counts as one stop. `findStretches` cuts the route at stops, with riding times
  - Limits: GraphHopper reads crossing tags only, not `highway=traffic_signals` on junctions, so a junction's lights
    count through its mapped pedestrian crossings (common in Vienna); stop and give-way signs aren't in the graph
  - Live, 2 h gravel loops: from Stephansplatz 41–75 stops but still a 27–51 min stretch without one; from the Lobau
    5–35 stops, longest stretches up to 100 min; from Hütteldorf the Wienerwald climbs (up to 240 m, about 30 min,
    and short 12–13% ramps)
  - Unit-tested on synthetic routes; each rule confirmed to fail a test when removed. Fixtures re-recorded with the
    `crossing` detail (geometry gains points where roads are split at crossings; distances unchanged)
- [x] Scoring function (time fit, interval-terrain fit, surface fit, flags), unit-tested
  - `loops/score.ts`: parts 0–1, weighted: time 0.35 (full on target, 0.6 at ±10%, 0 from ±25%), intervals 0.25,
    flow 0.1, surface 0.1, variety 0.2; a loop still over a flag keeps half its total. Without hard intervals the
    interval weight goes to flow
  - Intervals (tempo and up, ≥ 76% FTP; watts read against FTP): the workout is stretched to the loop's predicted
    time; each interval scores its longest share without a stop × its share not downhill (steeper than −2%); threshold
    and up (≥ 91%) × (0.7 + 0.3 × share on a climb). Weighted by interval length
  - No intervals on descents (user's call, 2026-11-04): a loop where a hard interval spends more than 20% of its time
    going downhill keeps 60% of its total, and its card says so. Live (3 × 10 threshold, gravel): 4 of 12 loops from
    Hütteldorf put an interval on a descent and one made the top 3 before; none now. Flat starts unaffected
  - Flow: share of time on stretches of 10 min or more. Surface: paved and unpaved mixed by the off-road setting
    (road: paved, MTB: unpaved), untagged half each way. Variety: 1 − share on ways ridden again after leaving them
  - Live, 2 h with 3 × 10 min threshold, gravel: the top 3 were within ±10% from all three starts (113–129 min);
    Lobau's best are the flat low-stop loops (flow 0.88–0.96), Hütteldorf's the Wienerwald climbs with few stops;
    loops 30–40% over the time rank last however good their terrain. Variety is near 1 for most loops (GraphHopper's
    round trips rarely repeat roads); surface scores run low with off-road 80 (Vienna has less unpaved than that asks)
  - Unit-tested on synthetic loops; each rule confirmed to fail a test when removed
- [x] Top-3 UI with intervals overlaid on the map and the elevation chart
  - "Find loops from the start" in the Workout panel (needs a start point; not while marking a flag). `useLoopSearch`
    runs `findLoops`, ranks and keeps 3. Results close when the start, workout, profile settings, flags or rider
    change (their times and scores no longer hold); a closed search is aborted and its answer dropped
  - While loops are on show they replace the route: the sidebar shows a card per loop (match %, distance, time vs the
    workout, ascent, stops, what stands out from `loops/explain.ts`), and the selected loop's elevation chart with the
    hard intervals shaded, its surface breakdown, plus Export GPX. The map shows the selected loop in surface colours
    like a route, with its hard intervals as an outline in zone colours (`loops/placement.ts`, shared with scoring), the
    others faint; clicking one selects it; the map fits all three. Waypoints and the route are frozen until Close
  - Unit + component tests; e2e `loops.spec.ts` (stubbed engine: three cards, selection, interval band, map frozen,
    GPX export, close; results close when the workout changes); each rule confirmed to fail a test when removed.
    Checked by screenshot against the live engine (Lobau, 1 h with 2 × 10 min tempo: loops within ±2%)
  - Not covered by tests: selecting a loop by clicking it on the map (needs map coordinates the tests can't reach)
- [x] Direction arrows, and riding a loop either way (user's request, 2026-11-04)
  - Chevrons along the route (start → destination) and the selected loop (its riding direction): a symbol layer
    with a chevron drawn as pixels (`map/arrow.ts`), added when the map loads
  - "Clockwise / Anticlockwise" on the selected loop (`loops/direction.ts`). Reversing the line would ride one-ways
    the wrong way, so the engine routes back through 12 points along the loop, with `pass_through` so it doesn't turn
    back at them. Live (18 loops): 0.94–1.04 × the length, median 1.00, 76% of the same ways; 4 points cut corners
    (median 0.88), 20 began to add detours (up to 1.14). The reversed loop is timed and scored afresh (its climbs are
    now descents) and kept, so switching back is instant
  - Unit + component tests (arrow pixels, direction, store, hook, panel, map setup); e2e switches direction and back;
    each rule confirmed to fail a test when removed. Checked by screenshot against the live engine
- [ ] e2e + ±10% time check
- [ ] **User testing (for the user): try generated routes and loops in practice**
  - [ ] Plan loops from your usual start points (gravel, road and MTB); flag anything unrideable and check the next
        search avoids it
  - [ ] Ride a suggested loop with a plain duration: compare the actual time with the predicted one (goal ±10%)
  - [ ] Ride one with a structured workout: did the hard intervals land on climbs or flat stretches without stops,
        and never on a descent?
  - [ ] Try both directions of a loop: is the reversed one rideable and on mostly the same roads?
  - [ ] Ride an MTB route: is "always fully off-road" right, or too rough in places?
  - [ ] Load a real workout export from Garmin Connect (FIT) and from Intervals.icu (FIT and ZWO)
  - Notes from rides go here; they feed calibrating the speed model and tuning the scoring

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
