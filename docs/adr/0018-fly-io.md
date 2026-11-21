# 0018: Running on Fly.io, three apps that suspend when idle

- Status: accepted
- Date: 2026-11-20

## Context

The app has to be reachable from a phone on a ride without the user's computer (docs/containers.md, chunk 5), for
one rider and a few friends, a few hours a month. The containers exist (ADRs 0013–0015). Fly.io was chosen for
stopping when idle; the open questions were whether the web container can wake the others, and how long the first
route takes on a ride.

## Decision

- **Three Fly.io apps in Frankfurt (`fra`, the nearest region to Austria and Hungary),** one per container, each
  with one machine: `bike-route-planner-web` (256 MB), `-api` (256 MB) and `-routing` (2 GB, the graph read from
  disk as in ADR 0013). Configs are the `fly.toml` next to each Dockerfile; Fly builds the same images.
- **Only the web app has a public address.** The API and the engine have only private Flycast addresses
  (`http://<app>.flycast`, set as `API_URL` and `GH_URL` for the Caddyfile), allocated before their first deploy so
  Fly gave them no public ones. Flycast goes through Fly's proxy, which wakes a machine on a request; the private
  `.internal` names don't.
- **All three suspend when idle** (`auto_stop_machines = 'suspend'`): the machine's memory is kept, so the engine
  resumes with its graph already read. Measured from the web machine, Vienna–Graz gravel (202 km):

  | Engine before the request | First route | Next routes |
  | ------------------------- | ----------- | ----------- |
  | running                   | 0.12 s      | 0.12–0.27 s |
  | suspended                 | 1.0 s       | 0.10 s      |
  | stopped                   | 16.7 s      | 0.17–0.27 s |

  Fly keeps a suspended machine's memory only until the next deploy, a move to another host or maintenance; then
  the first route takes the stopped time once. Suspend needs machines of at most 2 GB, which all three are.

- **Volumes:** `api_data` (1 GB) holds the SQLite file, `graph` (3 GB) the 2.1 GB graph. Both start owned by root
  and the images run as uid 1000, so a temporary machine sets the owner once. Fly snapshots each volume daily and
  keeps the snapshots 5 days: the backup of the accounts, flags and saved routes.
- **The graph is built on the computer and copied up** (`services/routing/scripts/fly-graph.sh`): each file
  zstd-compressed through `fly ssh console`, checked by md5 at the end; 15 minutes on the user's connection.
  `fly ssh sftp` was slower (0.7 MB/s) and lost the connection halfway.
- **Bots and visitors who aren't logged in wake only the web app.** Each app has one machine and Fly never adds
  more, so the bill has a ceiling: the engine wakes only for a logged-in user (ADR 0015). The web app also answers
  `/gh`, `/geo` and `/api` itself (401, "Log in first") when there's no session cookie, so they don't wake the API
  either; seen on Fly: a suspended API stayed suspended through such requests and woke for one with a cookie.
  `robots.txt` asks crawlers, AI ones included, not to load the app. What's left is the web app running and its
  data transfer ($0.02/GB; the app is about 0.7 MB compressed).
- **Deploys are by hand** (`pnpm fly:web`, `fly:api`, `fly:routing`; docs/deploy.md), not from CI.

## Consequences

- About $1–2 a month at a few hours' use: the volumes ($0.15/GB) and the suspended machines' disk. A running engine
  costs about $0.016 an hour.
- Adding an account needs `fly ssh console` on the API machine (docs/deploy.md).
- Copying a new graph removes the engine's machine for the copy; the app can't route for those 15 minutes.
- The same images still run on a VPS with compose.yaml if Fly stops suiting.
