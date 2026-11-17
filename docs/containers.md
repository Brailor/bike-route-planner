# Containers, accounts and hosting

Plan agreed with the user on 2026-11-17. Not started yet; progress is ticked in [plan.md](plan.md#containers-and-accounts-added-on-request).

## Why

On a test ride the user hit a bad section the planned route went through. They want to flag it on the spot, have the
route replanned, and load the new GPX onto their Garmin through the phone. That needs the app and the routing engine
reachable from a phone, without the user's computer being on or tunnelled into. Later, the user and a few friends
log in and keep their planned routes.

This plan covers getting there: the app in containers, accounts, and storage on the server. The ride feature itself
("Flag here", replanning from your position, hand-off to Garmin) comes after it.

## Decisions

- **Containers, hosted where they can stop when idle.** One rider using the app a few hours a month costs well under
  $1 a month on Fly.io with stop-when-idle (stopped rootfs about $0.15/GB/month; Fly waives personal bills under $5),
  against €5.99 a month (excl. VAT) for the cheapest 4 GB Hetzner VPS. An always-on 4 GB container costs about $25.
  The same images run on a VPS if the start-up wait turns out to be a problem. Prices from the providers' pages on
  2026-11-17.
- **Accounts: the user and a few friends.** Added by a command, with no sign-up page and no email.
- **Database: SQLite, as a file inside the API container.** It needs no extra container and no extra machine to wake
  on a stop-when-idle host. Moving to Postgres later is a contained job (a handful of tables).
- **Daily development stays as it is:** `pnpm dev` and `pnpm routing:start`. Containers are for running the whole
  thing and deploying it.

## Architecture

```
phone / browser ──HTTPS──▶ web   built app + proxy
                            ├─ /gh/route, /gh/match → routing  GraphHopper; graph mounted, not in the image
                            ├─ /geo/*               → Photon   public API, for now (ADR 0006)
                            └─ /api/*               → api      login, saved routes, flags; SQLite file on a volume
```

- **The web container does what the Vite dev proxy does today,** so the app keeps calling `/gh` and `/geo`
  unchanged.
- **Only the web container is reachable from outside.** It passes on only the engine calls the app makes (`route`,
  `match`); every other engine path is refused.
- **Routing and address search need a login.** The web container passes on `/gh` and `/geo` only with a valid login
  session, checked with the API. Otherwise anyone who finds the address could use the engine (keeping the machine
  awake, at your cost) and Photon in your name.
- **The graph is data, not part of the image.** Locally the container mounts `services/routing/data`, so nothing is
  re-imported. In the cloud it sits on a volume. The graph is built on a computer and copied up, since the import
  needs about 6.3 GB.

## Engine memory (measured 2026-11-17, on the Mac, with a copy of the engine)

| Setup                                                        | Memory limit | Result                                                                                        |
| ------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------- |
| `graph.dataaccess.default_type: RAM_STORE` (today's setting) | 3 GB         | Ran out of memory loading the 2.1 GB graph                                                    |
| `MMAP` (graph read from disk, cached by the system)          | 512 MB       | Up in 2 s; Vienna–Graz gravel route 0.06 s (warm file cache: the graph was already in memory) |
| Today's engine, for comparison                               | 10 GB        | Same route 0.05 s                                                                             |

So the container keeps one `config.yml` and chooses the memory mode and heap through environment variables. In
Docker (chunk 1) the whole graph in memory needed a 5 GB heap and was no faster, so the container reads from disk
(`MMAP`, 1 GB heap) everywhere; measurements in ADR 0013.

## Chunks

Each chunk ends with format, lint, typecheck, unit tests and e2e passing, docs updated, and a suggested commit
message.

| #   | Chunk                                | Works afterwards                                                                                                                                     | Estimate                         |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Routing image                        | The engine runs in a container, graph mounted; `e2e:live` passes against it, surface matching included                                               | ~2 h                             |
| 2   | Web image                            | The built app is served with `/gh`, `/geo` and `/api` proxied; the e2e suite passes against the built app (today it's only tested on the dev server) | ~1–2 h                           |
| 3   | API, SQLite and login                | The user and friends can log in; one compose command starts everything; CI builds the images and runs e2e against the web container                  | ~half a day                      |
| 4   | Saved routes and flags on the server | Save, list and reopen routes; flags follow the user between phone and computer                                                                       | ~half a day to a day             |
| 5   | Deploy to Fly.io                     | The app runs online and stops when idle; start-up wait and route times measured and recorded. Deployed only after the user confirms                  | ~2 h, plus ~10 min from the user |

Docs touched along the way: a new ADR (containers, SQLite, how logins are stored), the README's architecture,
setup and non-goals ("user accounts, sync" is a non-goal today), [plan.md](plan.md) and AGENTS.md.

## Defaults

- **Accounts are added by a command,** for example `pnpm --filter api user:add anna`.
- **Each person has their own flags and routes.** Sharing flags between friends can come later.
- **Existing flags come along, once:** on the first login in a browser, the flags saved in it are uploaded to that
  account and then cleared from the browser. A later login in the same browser (a friend's, say) finds nothing to
  upload, so flags never end up in someone else's account.
- **No new dependencies where Node does the job:** Node's built-in SQLite and password hashing. Check first that
  the built-in SQLite is stable enough in Node 24.
- **Login cookies are HTTPS-only and not readable by scripts.** Passwords are stored hashed.

## Not in this plan

- The ride feature: "Flag here", replanning from the rider's position, hand-off to Garmin Connect.
- A full-stack test in CI: the graph is too big to build there.
- Sign-up, password reset by email, sharing between users.

## Risks and open checks

- **Waking stopped containers on Fly.io.** The web container has to wake the stopped engine and API. This is
  possible but untried. If it's awkward, the same compose file runs unchanged on a VPS.
- **Engine speed with 2 GB of memory and on a cloud processor.** Measured only on the Mac so far.
- **Cold start.** The 2 s start-up was measured with the graph already in memory. A woken cloud machine first reads
  the 2.1 GB graph from its volume, so the real wait for the first route on a ride is unknown. Measure in chunk 5;
  it decides whether stop-when-idle is usable.
- **The Mac-built graph loading unchanged** on the cloud machine's processor. Check in chunk 1.
- **Backups of the SQLite file.** Check Fly.io's volume snapshots in chunk 5, before real data lives there.
