# Running the app on Fly.io

The app runs at <https://bike-route-planner-web.fly.dev> as three Fly.io apps in Frankfurt (`fra`), the containers
of [containers.md](containers.md) (ADR 0018). Only the web app has a public address; it reaches the other two at
their private Flycast addresses, which wake them. All three suspend when idle: the first route after a pause
takes about 1 s, and about 17 s once after a deploy (measurements in ADR 0018).

| App                          | Config                                                    | Volume                       | Machine           |
| ---------------------------- | --------------------------------------------------------- | ---------------------------- | ----------------- |
| `bike-route-planner-web`     | [apps/web/fly.toml](../apps/web/fly.toml)                 | none                         | shared 1×, 256 MB |
| `bike-route-planner-api`     | [services/api/fly.toml](../services/api/fly.toml)         | `api_data`, 1 GB: the SQLite | shared 1×, 256 MB |
| `bike-route-planner-routing` | [services/routing/fly.toml](../services/routing/fly.toml) | `graph`, 3 GB: the graph     | shared 1×, 2 GB   |

Needs `flyctl` (`brew install flyctl`) and `fly auth login`.

## Everyday

- **Deploy a change:** `pnpm fly:web`, `pnpm fly:api` or `pnpm fly:routing`. Fly builds the image from the same
  Dockerfile as locally.
- **Add an account, or give one a new password:** wake the API (opening the app doesn't: without a login the web app
  answers for it), then add the account. It prints the password once.

  ```sh
  fly machine start -a bike-route-planner-api $(fly machine list -a bike-route-planner-api -q)
  fly ssh console -a bike-route-planner-api -C "node src/cli.ts add <name>"
  ```

- **New OSM data or encoded values:** build the graph here (`pnpm routing:start`, ADR 0013), stop the local engine,
  then `services/routing/scripts/fly-graph.sh` (about 15 minutes; the app can't route meanwhile). It removes the
  engine's machine, copies the graph to its volume from a temporary machine, and deploys the engine again.
- **Logs:** `fly logs -a <app>`.
- **Testing the live app:** add an account for the tests (above), then run the e2e suites with `E2E_BASE_URL`,
  `E2E_USER` and `E2E_PASSWORD`. `pnpm e2e:live` also talks to the engine directly: start its machine, open
  `fly proxy 18989:8989 -a bike-route-planner-routing` and set `GH_URL=http://localhost:18989`.

## Setting it up from nothing

Done once, on 2026-11-20. In this order:

```sh
for a in web api routing; do fly apps create bike-route-planner-$a; done
# Private addresses before the first deploy, so the API and engine get no public ones. Check with fly ips list.
fly ips allocate-v6 --private -a bike-route-planner-api
fly ips allocate-v6 --private -a bike-route-planner-routing
fly volumes create api_data -a bike-route-planner-api -r fra -s 1 --yes
fly volumes create graph -a bike-route-planner-routing -r fra -s 3 --yes
# Volumes start owned by root; the API runs as uid 1000.
fly machine run alpine:3.22 -a bike-route-planner-api -r fra -v <api_data volume id>:/data --restart no -- \
  sh -c 'chown 1000:1000 /data'
fly machine destroy <that machine> -a bike-route-planner-api --force
pnpm fly:api
pnpm fly:web
services/routing/scripts/fly-graph.sh
```
