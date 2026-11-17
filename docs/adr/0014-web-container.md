# 0014: The web container: the built app behind Caddy, which replaces the dev proxy

- Status: accepted
- Date: 2026-11-17

## Context

Online, only one container is reachable from outside (docs/containers.md). It has to serve the built app and do what
the Vite dev proxy does today: pass `/gh` to the engine and `/geo` to Photon, on the same origin, so the app's
adapters keep calling `/gh` and `/geo` unchanged. Later (chunk 3) it also passes `/api` to the API and checks the
login before passing anything on.

## Decision

- **Caddy 2.11** (Apache 2.0; not shipped to the browser) serves the app and proxies, configured in
  `apps/web/Caddyfile`. It needs a short config, compresses responses (the app's own script goes from 585 kB to 183 kB
  gzipped), and can check a login with another service before proxying (`forward_auth`), which chunk 3
  needs. nginx can do the same with a longer config.
- **Only the engine calls the app makes pass:** `/gh/route` and `/gh/match`. Every other `/gh` path (`/info`,
  `/health`, path tricks like `/gh/route/../info`) gets a 404, so the engine's other endpoints stay private.
- **Photon gets no cookies and no forwarded IP address.** Caddy normally adds the user's IP as `X-Forwarded-For`; the
  config removes it and the `Cookie` header, so Photon sees what the user typed, the rounded map centre and the
  server's own address (AGENTS.md privacy). Checked against an echo server: both headers reach it without those two
  lines.
- **Upstreams come from the environment:** `GH_URL` (default `http://routing:8989`, the routing container's name on a
  shared network) and `PHOTON_URL` (default the public Photon; a self-hosted one later, ADR 0006).
- **No fallback to `index.html`:** the app has no client-side paths, so an unknown path is a 404 rather than the
  app. `/api` is added with the API (chunk 3).
- **Image:** built in a Node 26 stage (`pnpm install --frozen-lockfile`, then `pnpm --filter web build`, which also
  typechecks), then only `dist/` and the Caddyfile on `caddy:2.11.7-alpine`, 92 MB. Built from the repo root
  (`pnpm web:image`), since the lockfile is there; `apps/web/Dockerfile.dockerignore` keeps the context to the
  manifests and `apps/web`. Runs as `nobody` on port 8080, plain HTTP: TLS ends in front of it (Fly.io).

## Consequences

- `E2E_BASE_URL` points Playwright at an app that's already served instead of starting the dev server. The stubbed
  suite (39 tests) passes against the container. The stubs intercept `/gh` in the browser, so it tests the built app,
  not the proxy.
- The proxy itself is tested by `e2e:live` through the container, with the web and routing containers on one Docker
  network, `E2E_BASE_URL` at the web container and `GH_URL` at the engine (for the contract tests): 24 tests pass,
  and the engine's log shows the browser's route and match requests arriving from the web container.
- A new engine endpoint in `GraphHopperEngine` must also be allowed in the Caddyfile; only `e2e:live` through the
  container would catch a missing one.
- Running the two containers together takes a network and two `docker run`s for now; one compose command comes in
  chunk 3.
