# 0017: Saved routes are lines, reopened as tracks

- Status: accepted
- Date: 2026-11-18

## Context

The user wants to save routes, list them and open them again (docs/containers.md, chunk 4), on the phone as well as
the computer. A route can be planned from waypoints, a generated loop (which has no waypoints: the engine makes it)
or a GPX file opened in the app. On a ride, the user wants to open the planned route, flag a bad section, reroute
around it and send the new GPX to the Garmin.

## Decision

- **A saved route is the line itself:** a name, the [lon, lat, ele] coordinates, the distance and where the
  elevation came from (`SavedRoute` in `apps/web/src/types.ts`). Not the waypoints or the profile settings. Planned
  routes, loops and opened tracks are all saved the same way ("Save route", next to "Export GPX"), under a name the
  user can change.
- **Reopening shows it as an opened track (ADR 0010):** the same line, with its elevation, the flagged sections it
  runs through to reroute around, its surfaces once matched (ADR 0012), and GPX export. That's what the ride needs.
  The user chose this over re-planning from waypoints (which would keep it editable, but can't hold loops and could
  give a different route after flags or the map changed).
- **Stored like flags (ADR 0016):** `GET/PUT/DELETE /api/routes` for a logged-in user, each user only their own, in
  their own table. The server checks each route: a name of 1–200 characters, a line of 2–50,000 points (a recorded
  ride of 8 hours at a point a second is about 29,000), a distance and a known elevation source; a body may be up to
  3 MB. Where there are no accounts (`pnpm dev`), routes are kept in IndexedDB (database version 3). On the first
  login in a browser they move to the account, as flags do.
- **One storage path for both lists:** the app's `ListStore` (browser or server), `moveAll` and `usePersistedList`
  serve flags and saved routes alike; on the server, `items.ts` stores both, the table and column chosen from a
  fixed list.

## Consequences

- A saved route can't be edited by moving waypoints. Re-planning it means planning it again.
- The saved line doesn't change when flags change: reopening it shows the sections it now runs through, to reroute
  around, as for any opened track.
- A reroute or anything else done to a reopened route isn't saved back; saving it again makes a new saved route.
- There's no limit on how many routes a user saves. That's fine for a few friends, and a reason to add one before
  more people get accounts.
