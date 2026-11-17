# 0013: The routing engine in a container, graph mounted and read from disk

- Status: accepted
- Date: 2026-11-17

## Context

The app is to run online (docs/containers.md): first the routing engine, then the web app and an API, in containers
on a small machine that stops when idle. The engine as configured for local use keeps the whole 2.1 GB graph in
memory (`RAM_STORE`) with a 10 GB heap, and the first start imports the graph, which needs about 6.3 GB.

## Decision

- **The image holds the engine, not the graph.** `services/routing/Dockerfile` adds the GraphHopper 11.1 jar
  (checksum-pinned, from the release), `config.yml`, the models and `start.sh`, on `eclipse-temurin` 25 JRE (GPLv2
  with the Classpath Exception; it isn't shipped to the browser). A prepared `graph-cache` is mounted at
  `/srv/routing/data/graph-cache`, so the graph is built once on a computer (`pnpm routing:start`) and copied where
  it's needed.
- **The mount is read-write.** The engine creates a lock file (`gh.lock`) in the graph folder even to read it and
  refuses to start without one. Loading left every graph file byte-for-byte unchanged.
- **Read from disk (`MMAP`), 1 GB heap, by default.** Measured in Docker on the Mac (8 GB for containers), Vienna–Graz
  gravel route with a custom model:

  | Mode, heap        | Start                                | Routes (after the first) | Container memory |
  | ----------------- | ------------------------------------ | ------------------------ | ---------------- |
  | `MMAP`, 512 MB    | 2 s                                  | 0.05–0.07 s              | 0.3 GB           |
  | `RAM_STORE`, 5 GB | 17 s                                 | 0.05–0.08 s              | 3.6 GB           |
  | `RAM_STORE`, 4 GB | never came up (stopped after 10 min) |                          |                  |

  Map matching a 61 km track took 6–6.5 s at 512 MB and at 1 GB, the same as the native engine. Whole in memory
  is no faster and needs five times the memory, so the container doesn't offer it by default. 1 GB leaves margin
  over the 512 MB that worked.

- **One `config.yml`.** `start.sh` turns `GH_DATAACCESS` and `GH_BIND_HOST` into GraphHopper's `-Ddw.` overrides;
  the image sets `MMAP` and `0.0.0.0`. Local `pnpm routing:start` is unchanged (`RAM_STORE`, localhost, 10 GB).
  The admin port stays on the container's localhost.
- **Runs as a non-root user** (`ubuntu`). The engine's logs go to `data/logs` inside the container, not the mount.

## Consequences

- The graph built on the Mac (arm64) loads on Intel/AMD: in an emulated `linux/amd64` container it gave the same
  Vienna–Graz route to the metre. Cloud machines of either kind can take it.
- `e2e:live` passes against the container (`GH_URL=http://localhost:8995`; the dev proxy reads `GH_URL` too).
- Starting was measured with the graph already in the Mac's file cache. A woken cloud machine reads it from its
  volume first; that cold start is unmeasured (chunk 5).
- The container and `pnpm routing:start` shouldn't serve the same `graph-cache` at once. Both want port 8989 by
  default, so they clash visibly.
