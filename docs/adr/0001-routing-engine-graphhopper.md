# 0001: GraphHopper as the routing engine, BRouter as the fallback

- Status: accepted
- Date: 2026-10-29

## Context

We need bike routing over OSM data with profiles that can be tuned **per request** (profile settings, gravel slider,
avoid-areas for user flags). We do not want to build or maintain a routing engine.

Candidates:

- **GraphHopper**: Java, self-hostable, JSON "custom models" that can be sent per request; path details (surface,
  road class, OSM way IDs) in the response; round-trip algorithm; car routing from the same instance.
- **BRouter**: very bike-focused, native "nogo" areas, but its own profile scripting language.
- **Valhalla**: per-request bicycle costing and polygon exclusion, but heavier to run.
- **OSRM**: profiles are fixed at preprocessing time. Rejected: per-request tuning is the core of the product.

## Decision

Use GraphHopper (pinned to 11.1, see `services/routing/scripts/setup.sh`), self-hosted, with one profile per app
profile (`road`, `gravel`, `mtb`, `car`). If GraphHopper fails real-world gravel tests, switch to BRouter. The routing
adapter (ADR 0003) keeps that switch contained.

## Consequences

- A JVM process with ~5.5 GB heap during import for Austria; the first start takes ~3.5 min.
- Custom models are versioned JSON files in `services/routing/models/`. GraphHopper reserves its built-in model names
  (`mtb.json`, `car.json`, …), so ours are named `*-model.json`.
- Early check: the default `gravel` model (based on GraphHopper's `bike`) is ~93% asphalt on a Wienerwald test route.
  Gravel tuning is M1 work.
