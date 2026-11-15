# Modern Animation project contracts — compatibility foundation

A **contract** is a prospective agreement about which History snapshots may be
included in one animation. It is not a History search filter: a search result can
match keywords yet still be rejected by a project's locked scene or physics.

`src/animation/ModernAnimationContract.js` provides a side-effect-free API:

- `create(referenceExperiment, {mode, target?})` creates a validated, immutable
  contract based on an owned, embedded v1 experiment. `mode` is required.
- `validate(contract)` revalidates serialized contract data, rejecting unknown
  fields, malformed targets, inactive physical channels and unsupported modes.
- `signatures(experiment)` returns deterministic strings for **scene** (active
  object groups and grid), **physics** (active surface, refraction, visibility
  and display mode), **camera** and **display** (other active overlays). This is
  for grouping, diagnostics and project metadata; **do not** use signatures in
  place of the authoritative compatibility inspector.
- `allowedPaths(contract)` lists which *effective* fields may vary.
- `inspectCandidate(contract, experiment)` reports accepted/rejected, exact
  changed paths, diagnostic issues and candidate-level Preview compatibility.
- `inspectFrames(contract, experiments)` validates 0–200 snapshots and returns
  candidate checks plus the whole-sequence Preview verdict. Fewer than two
  frames are accepted as draft material but are not preview-ready.

## Contract types

| Type | Locked | Allowed between snapshots |
| --- | --- | --- |
| `camera` | Active scene, atmosphere, Earth geometry, presentation, camera framing outside supported motion fields | `CameraEast`, `CameraNorth`, `Height`, `Pan`, `Nick`, `Roll`, `FocalLengthField` (zoom) |
| `physical` | Active scene, other physics, camera including zoom, presentation | Exactly one chosen channel: `surface.curvature` or, on `temperature-lapse`, `temperatureProfile.gradientKPerKm` in Scene/Compare A/B |
| `experimental` | Nothing beyond v1 snapshot schema validation | Any valid snapshot; interpolation/export is **not** promised |

A `physical` target must use `scope: 'scene'`, `'A'`, or `'B'` matching the
reference display mode, and a supported `parameter`. Compare A and B are
separate channels. Changing camera and physics together, even across distinct
segments, remains invalid for current Camera/Physical playback. Physical
projects cannot animate camera zoom yet.

## Canonical active scene

`ModernAnimationCompatibility.effective()` now normalizes dormant controls of
an object group with `NObjects[group] === 0` to `null` while keeping its count.
This prevents false rejections (e.g. changing the distance setting for an
*empty* second group). All parameters of a nonempty group remain locked;
changing count from zero to positive activates that group's full description.
The rule is shared with the current renderer compatibility and sequence
selection. The original validated snapshot is **not** rewritten.

Surface curvature is represented by effective curvature (zero for Flat),
so inactive radius changes on Flat do not break a contract; inactive atmospheric
parameters are excluded by the existing fingerprint normalizer. Object layout
means *configuration relative to the surface*, not fixed world coordinates:
when curvature is the animated channel, the renderer may recompute world
positions from the same object parameters on a different surface.

## What this stage deliberately does not do

- No wizard or Picker filtering, no new saved project schema, no IndexedDB or
  autosave migration and no automatic modification of existing projects.
- The existing `ModernAnimationProject` remains version 1, requires 2–200
  frames, and supports only `camera` or `physical` for playback/export.
- `experimental` may collect arbitrary valid snapshots in a future project
  model, but *does not* make mixed modes or hard cuts exportable. Its
  candidate-level `previewCompatible` is `null`, never an optimistic `true`.
- `inspectFrames()` must be used for a whole-sequence verdict before preview;
  pairwise checks against the reference are not a substitute.
- No tolerance-based approximate equality is used. Normalization only drops
  inactive controls; it never silently equates two active configurations.

Next stages: define v2 project persistence and v1 migration, build wizard
and reference selection, enforce contract on every insertion/import route,
then add project-library search and grouping by declared contract.
