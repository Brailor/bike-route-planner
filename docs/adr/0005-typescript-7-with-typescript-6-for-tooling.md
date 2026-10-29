# 0005: TypeScript 7 for compiling, TypeScript 6 for tooling

- Status: accepted
- Date: 2026-10-29

## Context

TypeScript 7 (the native Go port) is the current release, but 7.0 ships without a programmatic JS API. typescript-eslint
needs that API and supports `typescript <6.1` (support for TS 7.1 is in progress: typescript-eslint#10940).

## Decision

Follow the TypeScript 7 announcement's side-by-side setup with npm aliases in the root `package.json`:

- `typescript` → `npm:@typescript/typescript6` provides the 6.0 API for typescript-eslint and a `tsc6` binary.
- `@typescript/native` → `npm:typescript@7.0.2` provides `tsc`, used by `pnpm typecheck` and `build`.

## Consequences

- Type checking and builds use TS 7. Typed lint rules run on TS 6, so the two could disagree on edge cases.
- Editors may pick up the TS 6 package as the "workspace" TypeScript version.
- Remove the alias (plain `typescript@7.x`) once typescript-eslint supports TS 7.
