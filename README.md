# Route Planner for Cyclists

A browser-based route planner for road, gravel and MTB riders. It does three things existing planners (Komoot, Strava, RideWithGPS) do poorly:

1. **Tunable riding profiles.** Road / gravel / MTB, each with settings such as "how much off-road" for gravel.
2. **Workout-matched routes.** "I have a 2.5 h workout with 4×8 min threshold intervals": suggest a route whose duration and terrain fit the workout.
3. **Personal "do not ride" corrections.** Flag a section of a route as unrideable. The planner reroutes around it now and avoids it in every future route.

Plus a travel feature:

4. **Getting there and back.** Given the user's home and a track's start and end, suggest how to reach the start and get home from the end by **public transport** (with a bike) or by **car**.

> This README is the source of truth for scope. If you are an agent working on this repo, read it fully before writing code, and follow the milestone order below.

---

## Guiding principles

- **Don't build a routing engine.** Use OpenStreetMap data and an existing open-source engine (GraphHopper). Our value is the layer on top: profiles, workout matching, user corrections and travel planning.
- **OSM data is imperfect.** Missing or wrong `surface` / `tracktype` / `smoothness` tags are the main reason planners send riders onto unrideable paths. Features should assume tags can be wrong, and let the user's own corrections override them.
- **Browser-first.** The app is a web app. Routing runs in a local or self-hosted service; the UI talks to it over HTTP.
- **Ship vertical slices.** Each milestone must work end to end (map → request → route on screen → GPX export) before the next one starts.

---

## Architecture

```
┌────────────────────────────┐
│  apps/web                  │  React + TypeScript + Vite
│  MapLibre GL map, UI,      │  Map tiles: OpenFreeMap
│  elevation chart, GPX I/O  │  Local storage: IndexedDB
└─────────────┬──────────────┘
              │ HTTP (Vite dev proxy: /gh → :8989)
┌─────────────▼──────────────┐
│  services/routing          │  GraphHopper 11.1 (Java 21+, jar)
│  OSM .pbf (Geofabrik)      │  bike profile on LM (not CH) so
│  custom models per profile │  custom models can be sent per request
└────────────────────────────┘

Later:
- services/api      Node/TS API in front of the engines (profiles, flags, workout logic)
- services/transit  MOTIS (self-hosted) or Transitous public API for public transport
- Postgres + PostGIS  when sync/sharing is needed (IndexedDB until then)
```

### Tech stack

| Area | Choice |
|---|---|
| Frontend | React, TypeScript, Vite, `maplibre-gl`, `react-map-gl` |
| Map tiles | OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`) |
| Routing | GraphHopper, self-hosted, with per-request **custom models** |
| OSM data | Geofabrik extracts `austria-latest.osm.pbf` + `hungary-latest.osm.pbf`, merged with osmium into one graph (cross-border routes work) |
| Elevation | GraphHopper elevation (SRTM) |
| Public transport | MOTIS / Transitous API. Fallback: `hafas-client` ÖBB profile, BKK GTFS for Budapest |
| Car routing | Same GraphHopper instance, car profile |
| Package manager | pnpm workspaces |
| Testing | Vitest + React Testing Library; Playwright for e2e |

Alternatives considered: **BRouter** (very bike-focused, native "nogo" areas; its own profile scripting language) and **Valhalla** (per-request bicycle costing, polygon exclusion; heavier to run). **OSRM** was rejected because its profiles are fixed when the data is preprocessed. If GraphHopper fails on real-world gravel tests, BRouter is the fallback.

### Repository layout

```
route-planner/
  apps/web/                 # frontend
  services/routing/
    config.yml              # GraphHopper config
    models/                 # custom models: road-model.json, gravel-model.json, mtb-model.json, car-model.json
                            # (*-model.json because GraphHopper reserves its built-in names like mtb.json)
    scripts/                # setup.sh (download jar + .pbf), start.sh (run the server)
    data/                   # *.osm.pbf, graph cache, SRTM tiles, logs (gitignored)
    routing.http            # sample requests (VS Code REST Client)
  docs/                     # requirement notes, decisions (ADRs)
  .vscode/tasks.json        # "dev" compound task: GraphHopper + Vite
  pnpm-workspace.yaml
  README.md
```

---

## Getting started (local dev)

Prerequisites: Node 24+, pnpm, Java 21+ (tested on 26), osmium-tool (`brew install osmium-tool`). About 10 GB free RAM for the routing engine.

```bash
pnpm install

# 1. Routing engine (all commands run from the repo root)
pnpm routing:setup   # downloads the pinned GraphHopper jar + the Austria and Hungary extracts (MD5-checked),
                     # merges them into services/routing/data/region.osm.pbf
pnpm routing:start   # serves on :8989; heap via GH_HEAP (default 10g)
                     # first start imports the graph: ~5 min, ~6.3 GB heap used; later starts load data/graph-cache (2.1 GB)

# 2. Frontend
pnpm dev
```

`pnpm routing:setup --update` refreshes the OSM extracts (and drops the graph cache so the next start re-imports). Regions are listed in `REGIONS` in `services/routing/scripts/setup.sh`.
Sample requests are in `services/routing/routing.http`.

`config.yml` requirements:
- `datareader.file` points at the `.pbf` in `data/`
- encoded values include at least: `surface, track_type, smoothness, road_class, bike_priority, bike_access, average_slope, max_slope` (plus `osm_way_id` for flags)
- elevation enabled (SRTM)
- all profiles use **LM, not CH**, so per-request `custom_model` works. LM rule: a request's custom model may only lower weights, so every `multiply_by` must be within [0, 1] and `distance_influence` can only go up. Profile settings therefore penalise rather than boost.
- a car profile exists (for milestone 4)
- `import.osm.ignored_highways` is set explicitly (required since GraphHopper 11); it is empty because bike and car profiles together need every highway type

The Vite dev server proxies `/gh/*` to `http://localhost:8989` so the browser never deals with CORS.

---

## Milestones

### M1 — Profiles + core routing

- Map with click-to-add waypoints (start, end and intermediate), draggable.
- Profile switcher: **road / gravel / MTB**. Each profile is a base custom model in `services/routing/models/`.
- Profile settings adjust the custom model's weights, e.g. a gravel "off-road preference" slider (0–100) that scales the priority for unpaved surfaces and track grades.
- Route display: line on the map, distance, elevation gain, estimated time, and a surface breakdown (% asphalt / gravel / ground / unknown).
- Elevation profile chart, linked to the map on hover.
- GPX export. GPX import is needed later for milestone 4.

**Done when:** the user can plan a route, switch profiles and see it change, adjust the gravel slider and see it change, and export a GPX file.

### M2 — Flag unrideable sections

- Select a stretch of the current route (two handles on the line, or click a segment) and mark it "not rideable". Optional fields: a reason (overgrown, private, too steep, bad surface, other) and a note.
- Store each flag as geometry: the segment's polyline, plus OSM way IDs if obtainable via map matching. Persist flags in IndexedDB.
- When routing, convert every flag into a small buffered avoid-polygon and apply it through the custom model's `areas` with a priority of 0.
- Re-route only between the waypoints around the flagged part, so the rest of the route stays the same.
- Flags apply to **all future routes**, under every profile. Show them on the map as a toggleable layer, and make them editable and deletable.

**Done when:** flagging a section immediately produces an alternative that avoids it, and a fresh route through the same area also avoids it.

**Later:** if the flag list grows large, bake the penalties into the graph at import time instead of sending them with every request.

### M3 — Workout-matched routes

1. **Speed/time model.** Predict ride time from distance, gradient, surface and profile. Start with a physics model (power → speed, using the rider's FTP, weight and CdA estimates). Later, calibrate it from the rider's own history (e.g. Strava activities).
2. **Workout input.** Enter a duration manually, or import a structured workout file (ZWO, ERG, or an Intervals.icu export).
3. **Candidate generation.** Generate many loops from the start point. Use GraphHopper's round-trip algorithm with different seeds and distances, plus random-waypoint loops.
4. **Scoring.** Rank candidates by:
   - how closely the predicted total time matches the workout's,
   - whether each interval lands on suitable terrain: a climb of the right length for VO2 or over-under work, and a long uninterrupted stretch with few junctions, traffic signals or stop signs for threshold work (OSM `highway=traffic_signals`, `highway=stop`),
   - surface and profile fit,
   - avoiding flagged sections (always).
5. **UI.** Show the top 3 candidates, with the workout's intervals overlaid on the route and the elevation chart.

**Done when:** given "2.5 h, gravel, from home", the app returns loops whose predicted time is within ±10% of the target. Given a structured workout, intervals visibly line up with suitable segments.

### M4 — Getting there and back

Inputs: home location, plus a track (planned or imported GPX) with its start, end and planned start time.

- **Public transport:**
  - Query home → track start (arrive by the start time) and track end → home (depart after the predicted finish from M3's speed model).
  - Primary source: MOTIS. Use the Transitous public API for prototyping, respecting its usage policy; self-host MOTIS with GTFS feeds later.
  - **Bike carriage is critical.** Prefer regional and S-Bahn legs. Mark legs where bike carriage is unknown or needs a reservation (e.g. ÖBB long-distance trains). Let the user flag "bike not allowed on this line", using the same correction pattern as M2.
- **Car:**
  - Drive home → start and end → home with GraphHopper's car profile.
  - The car stays where it was parked. For point-to-point tracks, suggest "park at the end, take a train to the start" (or the reverse), combining car and transit.
- **Done when:** for a given track, the app shows ranked transit options both ways with bike-carriage info, plus car options that account for where the car ends up.

### M5 (later) — Station-to-station ride discovery

Invert M4: find one-way rides that start and end near stations reachable from home, filtered by profile and a duration or workout target.

---

## Data model (initial)

```ts
type Profile = 'road' | 'gravel' | 'mtb';

interface ProfileSettings {
  profile: Profile;
  offroadPreference?: number; // 0..100, gravel/MTB
  avoidMainRoads?: boolean;
  // extend as needed; maps to a GraphHopper custom model
}

interface PlannedRoute {
  id: string;
  name: string;
  waypoints: [number, number][];        // [lon, lat]
  settings: ProfileSettings;
  geometry: GeoJSON.LineString;          // with elevation as the 3rd coordinate
  distanceM: number;
  ascentM: number;
  predictedDurationS?: number;
  createdAt: string;
}

interface AvoidFlag {
  id: string;
  geometry: GeoJSON.LineString;          // flagged segment
  osmWayIds?: number[];
  reason?: 'overgrown' | 'private' | 'too_steep' | 'bad_surface' | 'other';
  note?: string;
  createdAt: string;
}

interface Workout {
  id: string;
  name: string;
  totalDurationS: number;
  intervals: { startS: number; durationS: number; targetPctFtp: number; kind: 'endurance' | 'tempo' | 'threshold' | 'vo2' | 'recovery' }[];
}

interface UserSettings {
  home?: [number, number];
  ftpW?: number;
  weightKg?: number;
}
```

---

## Conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Coordinates are always `[lon, lat]` (GeoJSON order), never `[lat, lon]`.
- Engine-specific code (GraphHopper, MOTIS) lives behind an adapter interface, so engines can be swapped. The UI never builds engine requests directly.
- Custom models are versioned JSON files in `services/routing/models/`. UI settings are transformed into model overrides by a pure, unit-tested function.
- Every milestone ships with tests: unit tests for transforms and scoring, and a Playwright e2e for the main flow.
- Record architectural decisions as short ADRs in `docs/adr/`.
- Attribute OpenStreetMap contributors on the map (ODbL).

## Non-goals (for now)

- Native mobile apps
- User accounts, sync, social features
- Turn-by-turn navigation
- Global coverage. The target region is **Austria and Hungary**.

## Open questions

- ~~How well does Transitous cover Hungarian rail (MÁV)?~~ Good on paper, incl. cross-border lines; the MÁV feed is a community conversion. See `docs/spikes/2026-10-29-transit.md`.
- ~~How reliable is bike-carriage data (`bikes_allowed` in GTFS) for ÖBB and MÁV?~~ There is none: the column is absent from the ÖBB, MÁV and GYSEV feeds. Use rules by train category plus user corrections.
- Transitous public API vs self-hosted MOTIS: the public API is for open-source projects only (published under an OSS licence, `User-Agent` with a contact). Decide before M4.
- ~~Exact GraphHopper version and encoded-value names.~~ Resolved: GraphHopper 11.1; see `services/routing/config.yml`.
- Workout file format to support first (ZWO vs Intervals.icu).