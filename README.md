# Route Planner for Cyclists

A browser-based route planner for road, gravel and MTB riders. It does three things existing planners (Komoot, Strava, RideWithGPS) do poorly:

1. **Tunable riding profiles.** Road / gravel / MTB, each with settings such as "how much off-road" for gravel.
2. **Workout-matched routes.** "I have a 2.5 h workout with 4×8 min threshold intervals": suggest a route whose duration and terrain fit the workout.
3. **Personal "do not ride" corrections.** Flag a section of a route as unrideable. The planner reroutes around it now and avoids it in every future route.

Plus a travel feature:

4. **Getting there and back.** Given the user's home and a track's start and end, suggest how to reach the start and get home from the end by **public transport** (with a bike) or by **car**.

This README describes what the app is for and how to run it. The milestones below are the scope; progress is tracked in [docs/plan.md](docs/plan.md). Coding agents, and anyone changing the code, should also read [AGENTS.md](AGENTS.md).

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
│  MapLibre GL map, UI,      │  Map tiles: OpenFreeMap (+ ADR 0009)
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
- services/geocoding  Photon (self-hosted), replacing the public API
- Postgres + PostGIS  when sync/sharing is needed (IndexedDB until then)
```

### Tech stack

| Area | Choice |
|---|---|
| Frontend | React, TypeScript, Vite, `maplibre-gl`, `react-map-gl` |
| Map tiles | OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`). Other backgrounds: CyclOSM, OpenTopoMap, Esri World Imagery (with an API key); hillshade from Mapterhorn (ADR 0009) |
| Routing | GraphHopper, self-hosted, with per-request **custom models** |
| OSM data | Geofabrik extracts `austria-latest.osm.pbf` + `hungary-latest.osm.pbf`, merged with osmium into one graph (cross-border routes work) |
| Elevation | GraphHopper elevation (SRTM) |
| Geocoding | Photon (OSM-based, built for search-as-you-type). The public `photon.komoot.io` API for now, self-hosted later. Not Nominatim: its public API forbids autocomplete |
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
  docs/
    plan.md                 # implementation plan and progress
    adr/                    # architecture decisions
    spikes/                 # findings from early experiments
  .vscode/tasks.json        # "dev" compound task: GraphHopper + Vite
  pnpm-workspace.yaml
  README.md                 # what the app is for, how to run it, the milestones
  AGENTS.md                 # how to work on the code (for coding agents and contributors)
  CLAUDE.md                 # points Claude Code at AGENTS.md
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

Tests: `pnpm test` (unit), `pnpm e2e` (Playwright with recorded engine responses; what CI runs), `pnpm e2e:live` (Playwright against the running engine; opt-in, run it after changing models, config or the OSM data).
Recorded responses: `pnpm --filter web fixtures:record` (GraphHopper, needs the engine) and `pnpm --filter web fixtures:record-photon` (Photon, queries the public API).

The engine's settings are in `services/routing/config.yml` (what it must keep is listed in [AGENTS.md](AGENTS.md#routing-engine)). After changing its encoded values, delete `services/routing/data/graph-cache` so the next `pnpm routing:start` re-imports (about 5 minutes).

Satellite photos need an ArcGIS Location Platform API key (free tier): copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_ESRI_API_KEY`. Without it, the map offers the other backgrounds only.

The Vite dev server proxies `/gh/*` to `http://localhost:8989` and `/geo/*` to the Photon geocoder (`https://photon.komoot.io` for now), so the browser never deals with CORS.

---

## Milestones

### M1 — Profiles + core routing

- Map with click-to-add waypoints (start, end and intermediate), draggable.
- The map opens on the user's location (browser geolocation) when it's inside the supported region, and on Vienna otherwise (location denied, unavailable or outside the region). A map button goes to the user's location at any time. The location stays in the browser.
- Start and destination can also be entered as addresses, with autocomplete. What the user types, plus the map centre for ranking, goes to the geocoder (Photon).
- Profile switcher: **road / gravel / MTB**. Each profile is a base custom model in `services/routing/models/`.
- Profile settings adjust the custom model's weights, e.g. a gravel "off-road preference" slider (0–100) that scales the priority for unpaved surfaces and track grades.
- Route display: line on the map, distance, elevation gain, estimated time, and a surface breakdown (% asphalt / gravel / ground / unknown).
- Elevation profile chart, linked to the map on hover.
- GPX export. GPX import came with milestone 2 (below) and is used again in milestone 4.

**Done when:** the user can plan a route, switch profiles and see it change, adjust the gravel slider and see it change, and export a GPX file.

### M2 — Flag unrideable sections

- Select a stretch of the current route (two handles on the line, or click a segment) and mark it "not rideable". Optional fields: a reason (overgrown, private, too steep, bad surface, other) and a note.
- Sections can also be flagged without a route: click where the section starts and where it ends, and the app traces the stretch between them along roads and paths (the most direct way). Drag either end to adjust.
- Store each flag as geometry: the segment's polyline, plus OSM way IDs if obtainable via map matching. Persist flags in IndexedDB.
- When routing, convert every flag into a small buffered avoid-polygon and apply it through the custom model's `areas`, limited to the flag's OSM ways so crossing roads stay usable. Flags are avoided strongly (priority × 0.01), not blocked: when there's no way around, the route still uses the flag and the app warns (ADR 0007).
- Re-route only between the waypoints around the flagged part, so the rest of the route stays the same.
- Flags apply to **all future routes**, under every profile. Show them on the map as a toggleable layer, and make them editable and deletable.
- Open a GPX file made elsewhere. The app leaves the track as it is, except: where it runs through flagged sections, it asks about each one, one by one or all at once, whether to reroute around it, and splices the way around into the track (ADR 0010).

**Done when:** flagging a section immediately produces an alternative that avoids it, and a fresh route through the same area also avoids it.

**Later:** if the flag list grows large, bake the penalties into the graph at import time instead of sending them with every request.

### M3 — Workout-matched routes

1. **Speed/time model.** Predict ride time from distance, gradient, surface and profile. Start with a physics model (power → speed, using the rider's FTP, weight and CdA estimates). Later, calibrate it from the rider's own history (e.g. Strava activities).
2. **Workout input.** Enter a duration manually, or import a structured workout file from Garmin, MyWhoosh or Intervals.icu: **ZWO** (what MyWhoosh imports, and what Intervals.icu and Zwift export) and **FIT workout files** (Garmin devices and Intervals.icu).
3. **Candidate generation.** Generate many loops from the start point. Use GraphHopper's round-trip algorithm with different seeds and distances, plus random-waypoint loops.
4. **Scoring.** Rank candidates by:
   - how closely the predicted total time matches the workout's,
   - whether each interval lands on suitable terrain: hard intervals on a stretch without stops, on a climb or on the flat but not on a descent (a loop that puts one on a descent is strongly marked down), and threshold and harder ones preferably on a climb. Stops come from OSM crossing tags (traffic lights, level crossings, crossings where a path meets a road); the routing graph doesn't have stop signs,
   - for rides without hard intervals, how much of the ride is on long stretches without stops,
   - surface and profile fit,
   - not riding the same roads twice (out-and-back loops score low),
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

## Documentation

- [docs/plan.md](docs/plan.md): the implementation plan and progress, milestone by milestone
- [docs/adr/](docs/adr/): architecture decisions (routing engine, custom models, flags, geocoding, FIT reader, …)
- [docs/spikes/](docs/spikes/): findings from early experiments (gravel routing quality, transit data)
- [AGENTS.md](AGENTS.md): how to work on the code (conventions, tests, the routing engine, working agreements)
- `apps/web/src/types.ts`: the domain model (routes, flags, workouts, settings)

## Non-goals (for now)

- Native mobile apps
- User accounts, sync, social features
- Turn-by-turn navigation
- Global coverage, for now. The target region is **Austria and Hungary**; the whole world is the long-term goal, so region limits live in one place (`apps/web/src/region.ts`).

## Open questions

- ~~How well does Transitous cover Hungarian rail (MÁV)?~~ Good on paper, incl. cross-border lines; the MÁV feed is a community conversion. See `docs/spikes/2026-10-29-transit.md`.
- ~~How reliable is bike-carriage data (`bikes_allowed` in GTFS) for ÖBB and MÁV?~~ There is none: the column is absent from the ÖBB, MÁV and GYSEV feeds. Use rules by train category plus user corrections.
- Transitous public API vs self-hosted MOTIS: the public API is for open-source projects only (published under an OSS licence, `User-Agent` with a contact). Decide before M4.
- ~~Exact GraphHopper version and encoded-value names.~~ Resolved: GraphHopper 11.1; see `services/routing/config.yml`.
- ~~Workout file format to support first (ZWO vs Intervals.icu).~~ Both ZWO and FIT workouts, covering Garmin, MyWhoosh and Intervals.icu (2026-11-04).