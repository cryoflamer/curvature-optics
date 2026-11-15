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

## Saved Animation Project contracts

`src/animation/ModernAnimationProject.js` now reads **both** project schemas:

- **v1** (unchanged): `version: 1`, Camera/Physical only, 2–200 keyframes,
  optional HUD and interpolation settings. Existing exports and playback remain
  valid. `create()` still produces v1; existing unconstrained UI drafts are
  not silently upgraded.
- **v2**: `version: 2`, the same identity, metadata, `mode`, `target`,
  `baseExperiment`, `keyframes` and optional settings, **plus `contract`**.
  The `baseExperiment` must match the contract's embedded
  `referenceExperiment` exactly after validation, and `mode`/`target` must
  agree with the contract. A v2 project may hold **0–200 keyframes**, including
  a named, unfinished project with none.
- **v2 Camera / Physical**: frame `value` keeps the existing compact pose or
  scalar representation. It can change only the contract's allowed channel;
  the fixed scene, surface or camera is reconstructed from the embedded
  reference. The creation API checks the complete proposed snapshot sequence
  with `ModernAnimationContract.inspectFrames()` before encoding it.
- **v2 Experimental**: every keyframe's `value` is a fully validated, owned
  experiment snapshot. Scene/Compare and different physical scenes can
  coexist in one collection. No interpolation, Playback, PNG-frame or video
  export is promised or enabled for Experimental.

The new API `createV2(contract, snapshots, options)` creates a validated
project. `frameExperiment(project, index)` reconstructs a frame independently
of History, even in an unfinished or Experimental project. `ready(project)` is
true **only** for a valid Camera/Physical project with at least two frames.
`sampleAt`, `timeline`, `totalMs` and `splineProof` explicitly reject an
unfinished or Experimental project instead of fabricating a video.

Animation Library's **record/database schema remains version 1**, and its
portable **bundle envelope also remains version 1**; either can now carry
nested project v1 or v2 records. Standalone v1/v2 JSON is accepted on import.
The importer validates the entire payload before writing, creates fresh local
IDs, clears source History IDs and uses revision checks and content-aware
fingerprints. Rename, Save As, JSON backup and import retain v2 contracts.
Older program versions are not expected to read a v2 project; retain a backup
before opening exported projects in older builds.

Animation Studio can reopen a v2 project with 0/1 frames or an Experimental
collection **without preparing Preview**. Its named Save/Save As path preserves
v2 and the locked contract; the independent autosaved workspace includes the
contract without changing its existing checkpoint/collection formats. V1
workspaces without a contract remain readable. The UI displays a read-only
contract description when an existing v2 project is opened. This is a storage
foundation: the current **New project** command still creates an ordinary v1
working draft, not a new constrained v2 project.

## Still outside this stage

- No creation wizard or new contract editor. The first-class UI for creating
  v2 projects is planned for the next stage.
- Snapshot Picker does not yet prefilter by the project contract. However,
  `buildSaved()` and `createV2()` reject incompatible keyframes before writing
  to Library. UI-level filtering and early rejection are separate work.
- Experimental stores collections only; it does not make mixed Scene/Compare
  or hard-cut exports available. The existing v1 `build()` path remains the
  sole Preview/Export preparation path for ready Camera/Physical drafts.
- No physics, RK4, refraction, image generation or IndexedDB schema migration.

Next stages: wizard and reference selection, Picker contract filtering and
candidate diagnostics, project-library search/grouping by declared contracts,
then a final stabilization and browser acceptance pass.
