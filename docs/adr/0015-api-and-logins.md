# 0015: The API, logins and the login gate

- Status: accepted
- Date: 2026-11-17

## Context

Online, the user and a few friends log in, and later keep their routes and flags on the server (docs/containers.md).
Without a login, anyone who finds the address could use the engine, keeping a stop-when-idle machine awake at the
owner's cost, and send address searches to Photon in the owner's name. Daily development (`pnpm dev`) must keep
working without any of this.

## Decision

- **`services/api`: Node 26, no dependencies.** Node runs the TypeScript sources as they are (type stripping; imports
  name the `.ts` file, `erasableSyntaxOnly`), so there's no build. `node:http`, `node:sqlite` (SQLite 3.53, no
  warning on Node 26) and `node:crypto` cover the server, the database and password hashing; tests use `node:test`.
  The image is `node:26.13.0-slim` with only `src/`, run as `node`.
- **One SQLite file on a volume** (`data/api.db`, WAL), tables created at start (`CREATE TABLE IF NOT EXISTS`).
- **Accounts come from a command, with generated passwords.** `pnpm user:add anna` runs `src/cli.ts add` in the
  container and prints a new 144-bit password. Running it again sets a new password and ends that user's sessions.
  Nobody picks a weak password, so guessing over the network is hopeless and logins need no rate limit.
- **Passwords are stored as scrypt hashes** with a salt each, compared in constant time.
- **Sessions are random tokens in a cookie:** `HttpOnly` (scripts can't read it), `Secure` (HTTPS only; browsers
  count `http://localhost` as secure), `SameSite=Strict` (other sites can't send it). They last 90 days. The
  database keeps only the token's SHA-256, so a copy of the file doesn't log anyone in. Expired sessions are deleted
  at the next login. Logins only take JSON, so a plain form on another site can't post one.
- **Endpoints:** `POST /api/login`, `POST /api/logout`, `GET /api/me` (the username, or 401).
- **The gate is in the web container:** Caddy's `forward_auth` asks `/api/me` (with the request's cookies) before
  passing `/gh/route`, `/gh/match` or `/geo/*` on; a 401 goes back to the browser. `/api/*` itself passes through.
- **The app asks `/api/me` first.** 401 shows a login form instead of the app (no map, no requests before logging
  in). Anything that isn't the API's answer, such as the dev server's own page, means there are no accounts, and the
  app opens as before. "Log out" in the sidebar ends the session and reloads the page, so the next user doesn't see
  the last one's route.

## Consequences

- `pnpm dev` is unchanged: no API, no login.
- If the API is down online, the app opens without a login but can't route or search (the gate refuses).
- With `E2E_USER` and `E2E_PASSWORD`, Playwright logs in once before the suite (`e2e/login.setup.ts`) and every test
  runs with that session; `e2e/login.spec.ts` tests the gate and the login form for real and is skipped on the dev
  server. CI's `containers` job builds the web and API containers, adds an account and runs the suite through them.
- A session that expires mid-ride shows up as a routing error until the page is reloaded; at 90 days that's rare.
- Removing an account takes SQL for now (`DELETE FROM users WHERE name = ?`, in the container).
