# 0016: Flags on the server

- Status: accepted
- Date: 2026-11-18

## Context

Flags have to follow the rider between phone and computer (docs/containers.md, chunk 4), so with a login they can't
stay in the browser's IndexedDB. The dev server has no accounts (ADR 0015) and must keep working as before.

## Decision

- **Endpoints:** `GET /api/flags` (the user's flags, oldest first), `PUT /api/flags/:id` (insert or replace),
  `DELETE /api/flags/:id`. All need a login, and each user sees and changes only their own flags. These are the
  app's `FlagStore` (list, save, remove) over HTTP, so the app's syncing of flags is unchanged.
- **One table, the flag as JSON:** `flags (user_id, id, created_at, flag)`, keyed by user and id. A flag is only
  ever read whole, so its fields don't need columns.
- **The server checks every flag** and stores only the fields the app uses: an id of 1–64 of `A–Z a–z 0–9 _ -`, a
  date, a line of 2–10,000 points, whole-number way ids, a known reason and a note of up to 2,000 characters (the
  note field takes no more). A flag body may be up to 1 MB.
- **Logged in, the app keeps flags only on the server.** When it opens, it first moves the flags saved in this
  browser to the account, each removed from the browser only once the server has it. That happens once per browser:
  a later login in the same browser (a friend's) finds nothing to move, so flags never end up in someone else's
  account.
- **Where there are no accounts** (`pnpm dev`), flags stay in IndexedDB as before.

## Consequences

- Without a connection, flags made on a ride last only until the page is reloaded (as with blocked browser
  storage). Keeping them in the browser until the server has them is for the on-the-ride feature.
- Logged in, the e2e suite shares one account, so each test gets its own flags in memory (`e2e/support.ts`), and
  `e2e/account.spec.ts` alone tests the server's, one test at a time.
- Settings (FTP, weight, map background) stay in the browser for now.
