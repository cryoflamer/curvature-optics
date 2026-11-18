# Modern built-in demonstrations — architecture and delivery roadmap

Status: **patch 0 (architecture and roadmap)**, 2026-11-18. No catalog or
runtime behavior is implemented by this patch. The active next step is patch 1.
This roadmap supersedes the delivery order at the end of
[the location migration inventory](modern-location-migration.md), not its
source evidence or Legacy preservation gates.

## Product and architecture decisions

A Modern demo is an authored, immutable built-in Animation Studio project,
not a new script language, interpreter or rendering engine. The Studio is
both the authoring tool and the player. Built-in Demos and My Projects are
separate categories of the same Studio. A built-in can be opened, played,
paused, restarted, scrubbed, inspected and exported; its authored contents
cannot be edited, renamed, deleted or overwritten. Create copy makes a
normal independent named project and opens it for editing. Presentation mode
is another view of the same player, not another playback implementation.

Keep versioned portable JSON in the repository (proposed `demos/modern/`,
with `catalog.json` and `soundly.json` initially). Use stable semantic paths,
no patch/version suffixes. Catalog entries have stable demo IDs distinct from
user project IDs, a relative asset path and only necessary display metadata;
project name, description, mode and frame count derive from the validated
project rather than duplicated metadata. Decide the exact manifest schema and
asset-loading mechanism in patch 1 after checking supported hosting modes.
Do not assume a fetch-only design works from every supported launch path.
No placeholder entries for unimplemented demos. Adding a demo should require
only a portable JSON file and a declarative catalog entry, not new JS logic.

Built-ins must not be seeded into the user's IndexedDB Library or draft
collection. Their source is the shipped catalog, refreshed on application
load. Read-only playback must not mutate the source, the live Scene/Compare
experiment, History or saved user drafts. Runtime preview state (time, pause,
seek, quality override) is separate from authored content. On switching away,
protect outgoing user work through existing workspace persistence; a failed
checkpoint cancels switching. Opening a demo should work without writable
IndexedDB where no outgoing user data needs saving. Do not silently bypass
an existing failed save. Reload/recovery policy: preserve user work, optionally
restore a demo by ID, never serialize a built-in as an editable draft.

Create copy is explicit, not normal import deduplication: allocate a new
user ID, deep-own all project/contract/keyframe data, clear browser-local
sourceSnapshotId references, preserve the authored settings and timing,
and use normal named-project persistence with intentional duplicate content
allowed. A copy is a snapshot, not linked to a future catalog update.
Repeated explicit copies get distinct IDs. A failed copy must not lose
user work or pretend to have saved/opened a project. Export a built-in as
ordinary portable JSON; importing it creates a normal user project under
existing import semantics, never a new trusted built-in. Export all My
Projects must not silently include built-ins. Origin/read-only status is
trusted runtime/catalog metadata, not an editable field in imported JSON.

## Current-code audit and integration seams

| Existing code | Finding / proposed boundary |
| --- | --- |
| `src/animation/ModernAnimationProject.js`, `ModernAnimationContract.js` | Strict v1/v2 project validation, owned frozen values, camera and one-channel physical modes; v2 experimental can store full snapshots but does not promise playback. V2 requires baseExperiment and contract.referenceExperiment equality. Reuse validators; no demo-specific animation schema. |
| `src/animation/ModernAnimationLibrary.js` | Portable format `curvature-modern-animations` v1, parsePortable accepts bundles or standalone projects. IndexedDB named records use revision checks; importEntries deduplicates by content and clears History IDs. create(..., allowDuplicate) already supports intentional duplicates, but caller supplies project ID. Reuse this for explicit copy with fresh identity, not importEntries. exportPortable expects normalized named records; adapt export at boundary without persisting fake user records. |
| `ModernAnimationLibraryActions.js` (same directory) | Coordinates import/export/save/rename/remove; Save As already allows duplicates. Keep built-ins outside durable user mutation paths; enforce read-only before mutation dispatch, not just disabled buttons. |
| `ModernAnimationStudio.js`, `ModernAnimationStudioEditing.js` | fromProject converts projects into editor drafts; editing coordinator owns commit/live/undo/reorder effects. Do not route a built-in into an unrestricted editable draft; guard editor actions, wizard, shortcuts and save paths. |
| `ModernAnimationWorkspaceSwitch.js`, `ModernAnimationWorkspacePersistence.js`, `ModernAnimationDraftAutosave.js`, `ModernAnimationWorkspaceRecovery.js` | Existing outgoing-draft checkpoint, generation checks, named fetch and multi-workspace recovery. Add a distinct demo selection/lifecycle instead of impersonating a named IndexedDB record. Test in-flight switches, reload and stale callbacks. |
| `src/ui/modern/ModernAnimationStudioUI.js`, `ModernApp.js` | Existing Studio UI and application integration owners. Use current cards, selection and status conventions; avoid a second Studio. |
| `src/animation/ModernAnimationPlayback.js`, `ModernAnimationPreview.js`, `ModernAnimationCompareComposition.js` | Deterministic clock samples an owned project; preview already accepts Scene/A/B and checks Canvas Direct capability. Reuse shared sample/clock and existing rendering/export composition. Browser synchronization and actual speed still require acceptance. |

Strict project/keyframe validation means optional narrative fields require an
explicit backward-compatible validator/editor/export change later, not an
unvalidated extra field today. Current camera contracts lock presentation as
well as physics; Scene/Compare is not merely a freely editable display toggle
inside every project. An alternate playback view, if supported, needs a
validated detached reference/project and must never silently retarget a
physical animation's channel. Camera and physical changes together remain
outside current supported playback contracts.

## First source project: Soundly

User-supplied `curvature-animation.json` (2026-11-18, SHA-256
`1d404662096922477329db126f8eac207bc45785f9cebaf078a56e8db1a214bb`).
Patch 0 inspects but does not vendor this asset; preserve the supplied export
for patch 1. Keep an explicit source/provenance note in the catalog or docs.

- `Soundly Causeway · Bridge Camera Study`, v2 Camera, spline, Auto quality,
  nine keyframes, 59,100 ms including holds, fixed 128 bridge sections.
- Adaptation of Legacy K0, K2, K4, K5, K9, K12, K13, K15, K16; last four
  viewing directions correspond to Observation Scenes 1–4, not photographic
  pixel matches. Geometry anchored to K12; opposite camera motion approximates
  Legacy bridge relocations. Commentary and redundant transitions omitted.
- Scene starts Globe/vacuum; dormant Compare is already A Globe/vacuum,
  B Flat/vacuum. Both reference display modes currently equal `scene`.
- Patch 0 executed the existing parsePortable, ready and totalMs APIs on the
  original export: valid, ready, 59,100 ms. A detached in-memory copy changing
  both baseExperiment.display.mode and contract.referenceExperiment.display.mode
  to `compare` also passed ready/totalMs and sampleAt at 24,000 ms returned
  Compare. This proves schema/sample compatibility only, not pixel parity,
  actual dual playback or browser FPS. No source file was changed.

For the first comparison, use the same camera pose, geometry, clock,
zoom/framing and atmosphere on both sides; only the surface differs. Vacuum
isolates curvature, not a claim to reproduce photographed atmospheric
conditions. Especially test the 100 m to 3 m descent, zoom and final four
observations. Flat/Globe rendering must use the established signed-curvature
Canvas Direct support and fallback policies; Accurate stays the reference.
No new physics, arbitrary accuracy thresholds, or per-demo painter forks.

## Ordered compatpatch plan and acceptance gates

Each row is an independently reviewable delivery. Update this status and
PROJECT_STATE in the same commit. Split a row into smaller commits if needed,
record the split, and do not mark complete on implementation alone.

| Patch | Status | Scope and acceptance |
| --- | --- | --- |
| 0 — Architecture & Roadmap | Implemented | Documentation only; inspect current Studio boundaries and validate supplied Soundly export; retain prior migration evidence. |
| 1 — Built-in Demo Catalog | Next | Ship original Soundly portable JSON and manifest; stable unique IDs, deterministic order, validate with existing APIs, reject invalid/duplicate catalog entries and missing assets with explicit errors, no IndexedDB writes. Test real asset loading and supported launch paths; source data immutable. |
| 2 — Project Lifecycle | Planned | Open read-only demo, protect all mutation paths (including autosave, shortcuts, Save/Save As, rename/delete), explicit Create copy with new identity and independent owned data; persistence/recovery, storage failure and repeated-copy tests. No implicit duplicate reuse. |
| 3 — Studio Catalog UI | Planned | Built-in Demos / My Projects categories, existing card style, open/inspect/play/export/copy controls; no editable actions on original. Browser tests for category isolation, copy, reload, keyboard and outgoing unsaved work. No new player. |
| 4 — Compare Playback | Planned | Audit/extend existing Scene/Compare player as necessary; one clock/sample for A/B, same camera and independent optics, play/pause/seek/restart and exports. Validate detached Soundly Compare variant, preserve original content, verify no stale or mixed-time frames, fallback on unsupported geometry, representative Accurate comparisons and actual browser FPS. First functional demo milestone after manual acceptance. |
| 5 — Presentation Mode | Planned | Viewer-focused layout, timeline, play/pause/restart, fullscreen, title/current frame and optional camera HUD, open Studio/Create copy. Same player and project, no second timeline or engine; test resize, keyboard/fullscreen exit and lifecycle. |
| 6 — Narrative Support | Planned | Optional keyframe title/description or explicit narrative timing if required, deterministic behavior at holds/transitions/seeks, escaped text, old JSON unchanged in behavior, round-trip through Studio/drafts/export and presentation. Decide transition caption policy before implementation. |
| 7 — Soundly Finalization | Planned | Author final storyboard/captions and catalog presentation, verify both models, source provenance, browser/Opera smoothness, controls, copy/export/reimport; document observed accuracy limits. Tag only after CI/manual acceptance. First completed public demo milestone. |
| 8+ — Legacy Demo Migration | Planned | Chicago, Canigou, Causeway, Pontchartrain/TransLine, Bedford, Grace, Tensas (order provisional); Curve last as a distinct educational lesson. Reuse Studio; add universal capabilities only when justified by source choreography. One bounded adaptation at a time, with explicit evidence and limitations. |

## Verification and migration policy

For implementation patches, run focused Node tests, full Node regression
(`node --test --test-concurrency=2 tests/*.test.js`), architecture/Legacy
preservation (`node tools/check-refactor-closure.js` and
`python tools/validate-legacy-visual-reference.py`) and real Chromium smoke
(`python -m unittest discover -s tests/browser -p 'test_*.py' -v`, see
`.github/workflows/ci.yml`). Record failures or environment blockers rather
than claiming success. CI must be green before tagging. Use manual Opera for
visual smoothness, measured Actual FPS when available and acceptance of
representative intermediate poses; do not equate unit tests with browser FPS.
Retain old project imports, user drafts, History, routing, optical quality
preferences and authoritative exports. Legacy source, iframe, old links,
scientific reference tests and original images remain untouched.

For each migrated demo keep a mapping to the original states/transitions,
explicitly identify omitted/adapted choreography and atmosphere differences,
and record reproducible visual/physical checks (viewport, DPR, camera,
model/profile, relevant tolerances). The original inventory of 80 states and
71 transitions remains evidence, not a requirement to reproduce every action
literally. A demo is complete when its educational/physical intent is clear,
its authored sequence is reproducible, and the relevant acceptance checks
pass. Do not mark Legacy pixel/optical parity without independent evidence.

Canvas Direct baseline is accepted for continued development following the
user's report of green CI after profiler-test cleanup; tag relocation was
recommended but has not been independently verified here. The deferred
Stage 5D requalification and extreme fallback/manual performance evidence
remain separate open work, not silently completed by this roadmap.
