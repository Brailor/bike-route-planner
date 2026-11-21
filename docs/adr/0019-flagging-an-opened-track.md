# 0019: Flagging a stretch of an opened track

- Status: accepted
- Date: 2026-11-21

## Context

A saved route reopens as an opened track (ADR 0017), and on a ride that's what's on the phone. When the rider hits a
bad stretch they have to flag it there, then reroute around it, but an opened track could only be checked against
flags made earlier on a route (ADR 0010).

## Decision

- **"Flag a section" on the track panel** puts the two handles on the track, as on a route; the reason and note are
  the same form (`SelectionForm`).
- **Only once every flagged section is answered.** The new flag's sections are then put among the others in track
  order and asked about next ("reroute around it, or keep it?"), with the reroute ADR 0010 already has. After them
  the next section without an answer comes, so the sections answered before aren't asked again.
- **The flag is a flag like any other:** saved, avoided by later routes, and on the server when logged in (ADR 0016).
  Its ways come from the roads the track is matched to (ADR 0012); before that's done it has none, and is avoided
  by its line alone (ADR 0007).

## Consequences

- While a question is open, the user answers it first; then they can flag.
- A stretch that overlaps an answered section (one kept, or a way around) is asked about too. Not tried yet: its
  way around has less room between its neighbours.
- "Flag here" from the rider's position is still to come (docs/containers.md).
