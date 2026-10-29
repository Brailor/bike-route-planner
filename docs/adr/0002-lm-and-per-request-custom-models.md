# 0002: LM (not CH) with per-request custom models

- Status: accepted
- Date: 2026-10-29

## Context

GraphHopper has three routing modes: CH (fastest, fixed weights), LM (fast, allows per-request changes) and flexible
(no preparation, slowest). Profile settings, the gravel slider and user flags all need per-request custom models.

GraphHopper 11.1 restricts per-request custom models under LM (`FindMinMax.checkLMConstraints`): every `multiply_by`
must evaluate to a value within [0, 1], and `distance_influence` may only be raised. Anything else is rejected with
HTTP 400 (confirmed against our instance: `multiply_by: 1.5` → "cannot be larger than 1").

## Decision

- All profiles use LM; no CH.
- Server-side profile models are the **most permissive** version of each profile.
- Every UI setting maps to a model that only **penalises**. For example, the gravel off-road slider penalises paved
  surfaces at the off-road end and unpaved surfaces at the paved end, with neither penalised in the middle.
- The settings → custom model transform is a pure, unit-tested function. It never emits a factor outside [0, 1].
- `lm.disable=true` (flexible mode) is the escape hatch for a request that cannot be expressed as a penalty. It is
  slower and should stay rare.

## Consequences

- Flags (M2) fit naturally: an avoid-area is `multiply_by: 0` inside a polygon (confirmed: forces a detour).
- Base models must be re-imported (LM re-prepared) when changed; per-request tuning needs no re-import.
- Query times measured on Austria: 17–93 ms for point-to-point routes, ~290 ms for a 40 km round trip.
