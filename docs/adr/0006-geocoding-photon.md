# 0006: Address search with Photon, behind an adapter

- Status: accepted
- Date: 2026-11-02

## Context

Start and destination can be typed as addresses, with suggestions while typing (README M1). That needs an OSM-based
geocoder that allows search-as-you-type. Nominatim's public API forbids client-side autocomplete in its usage
policy. Commercial geocoders need an API key and an account.

## Decision

- **Photon** (komoot's OSM geocoder, built for search-as-you-type). The public API (`photon.komoot.io`, fair use) for
  now. Self-hosting it (a Java service with its own search index, like GraphHopper) can come later.
- The same shape as routing (ADR 0003). `apps/web/src/geocoding/` defines `Geocoder`, `GeocodeRequest`, `Place` and
  `GeocodingError`. `geocoding/photon/` implements them with pure request and response functions, unit-tested
  against recorded responses (`pnpm --filter web fixtures:record-photon`).
- The browser calls the same-origin `/geo`, which the Vite dev server proxies to Photon. Switching to a self-hosted
  instance means changing the proxy target.
- Requests are kept small: results are limited to the supported region (`region.ts`), the ranking point is rounded
  to 2 decimals (~1 km), and queries under 3 characters aren't sent.

## Consequences

- What the user types, and roughly where the map is, goes to komoot. The README says so. Self-hosting removes it.
- Like `/gh`, `/geo` exists only in the dev server. A production deployment needs the same proxying.
- Photon returns near-duplicates (a station and the square it's named after). The adapter merges entries that would
  look identical in a list.
