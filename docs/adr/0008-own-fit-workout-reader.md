# 0008: Our own FIT workout reader; Garmin's SDK only in tests

- Status: accepted
- Date: 2026-11-04

## Context

Workouts from Garmin devices, Garmin Connect and Intervals.icu come as FIT workout files (README M3). Garmin's
JavaScript SDK (`@garmin/fitsdk`) reads them, but its licence (the FIT Protocol License) allows use for the
licensee's own purposes and forbids passing the SDK on to anyone else. A web app ships its code to every visitor, so
bundling the SDK would pass it on. That matters once the app is hosted for others, or published as open source (which
the Transitous question may require, README "Open questions"). The licence does allow using the FIT protocol in our
own software.

## Decision

- **A small reader of our own** (`apps/web/src/workouts/fit.ts`, written from the protocol): header, definition and
  data messages, little- and big-endian fields, developer fields (skipped), compressed-timestamp headers and the file
  CRC. It reads only what a workout needs: `file_id`, `workout` and `workout_step`.
- **Garmin's SDK is a dev dependency only** (pinned, 21.218.0). Tests use its encoder to write real workout files and
  check the reader against them (`src/test/fit.ts`). It isn't imported by app code, so it isn't in the build (checked
  with `pnpm build`).
- How steps become a workout:
  - Time steps are read. Steps that end on distance, the lap button or another condition are skipped, with a warning.
  - Repeats ("repeat steps N times", N the total count) are expanded, nested ones too. Repeats until a condition are
    done once, with a warning.
  - Power targets: custom ranges become their middle, in % of FTP (values up to 1000) or watts (above 1000, minus
    1000). Power zones 1–7 become the middle of Coggan's zones. Heart-rate, cadence and speed targets have no power;
    those steps are timed at the rider's ride power, with a warning.

## Consequences

- About 270 lines (with comments) to maintain instead of a dependency. FIT is stable and backward compatible; the
  reader skips what it doesn't know (fields, messages, developer data).
- Tests check the reader against files from Garmin's encoder, not yet against files exported by Garmin Connect or
  Intervals.icu. Testing with a real exported file from each is still to do.
- Updating the SDK only affects tests.
