# Modern built-in demonstrations — architecture and delivery roadmap

Status: **patch 4C (Keyframe Thumbnail Persistence)**, 2026-11-19. Catalog,
Soundly, covers, read-only activation, copy and portable export are implemented.
Separate galleries and cover editing are implemented. Soundly now opens in synchronized Globe/Flat Compare. Keyframe navigation now requests an immediate paused paint when the stage has layout. A horizontal Storyboard now sits below playback controls. Lazy keyframe thumbnails are implemented. Persistent keyframe thumbnails and portable attachments are implemented. Presentation Mode and optional keyframe narratives are implemented; user confirmed Presentation Mode in Opera. Narrative Support was accepted in Opera. Complete Storyboard Export is implemented; browser acceptance remains open. Next: Soundly Narrative & Sources.
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

Keep versioned portable JSON in the repository (`demos/modern/`,
with `catalog.json` and `soundly.json` initially). Use stable semantic paths,
no patch/version suffixes. Catalog entries have stable demo IDs distinct from
user project IDs, a relative asset path and only necessary display metadata;
project name, description, mode and frame count derive from the validated
project rather than duplicated metadata. The manifest and static-script
loading mechanism are described below.
Do not assume a fetch-only design works from every supported launch path.
No placeholder entries for unimplemented demos. Adding a demo should require
only a portable JSON file and a declarative catalog entry, not new JS logic
(regenerate the shipped data script).

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

## Shipped catalog and authoring workflow (patch 1)

- `demos/modern/catalog.json` is a strict manifest: `format` is
  `curvature-modern-demo-catalog`, `version` is 1 and `demos` is an ordered
  array of `{ "id": "soundly", "asset": "soundly.json" }` entries. IDs and
  asset basenames use lowercase letters, digits and hyphens. Paths are local
  JSON basenames, not URLs or traversal paths. Duplicate demo IDs, assets and
  authored project IDs are rejected. No placeholder entries are shipped.
- Each asset contains exactly one portable project (normal library export or
  accepted standalone project). It must pass `parsePortable` and `ready`;
  incomplete/Experimental projects cannot be published yet. Asset errors
  identify the demo and file; validation is all-or-nothing. Loaded entries
  are deeply frozen and owned, with `id`, `asset`, `project`, `quality`,
  `thumbnail`, `createdAt` and `updatedAt`. Browser-local History IDs are
  cleared in the runtime project only; original JSON remains unchanged. Optional manifest `displayMode`
  (`scene` or `compare`) may explicitly adapt a Camera project. The catalog
  validates both the owned base and contract reference with the same display
  mode. Changing a non-Camera project's display scope is rejected; projects
  without an override retain the authored mode.
- Static HTTP is the documented normal launch, but local `file://` routing
  is retained where supported. Fetch of a JSON file is unreliable there.
  `tools/build-modern-demo-catalog.js` validates the manifest and actual
  JSON files and generates `src/animation/ModernDemoCatalogData.js` as a
  deterministic classic script. It embeds the JSON text, not alternate
  authored project data. Modern loads it and `ModernDemoCatalog.js` after
  the library; no fetch, bundler or storage dependency is needed. The same
  data is used by Node and browsers. Missing or stale source assets fail the
  generation/check gate; a missing bundled asset fails runtime `load()`.
- `CurvatureModernDemoCatalog.load()` returns the validated immutable list
  on demand, or throws. It never calls Library create/import, IndexedDB or
  draft autosave and has no editor side effects. Patch 2 owns the selection
  lifecycle, and patch 3 owns the UI. The existing Legacy Demos tab is unchanged.

To publish a new demo: export one finished project from Studio, save the JSON
under `demos/modern/`, add one stable entry to the manifest, and run:

```sh
node tools/build-modern-demo-catalog.js
node tools/build-modern-demo-catalog.js --check
node --test tests/ModernDemoCatalog.test.js
```

Commit the JSON, manifest and generated script together. Do not hand-edit
that script; Node regressions verify exact regeneration from canonical files.
When intentionally replacing the initial Soundly source, update its pinned
provenance/acceptance tests and document the change. Current browser smoke
checks exercise actual HTTP and local-file launch; local Chromium blocks both
with `ERR_BLOCKED_BY_ADMINISTRATOR`, so these checks await CI or Opera. An
isolated real Chromium execution of the static scripts in HTML order did
load Soundly with nine frames, 59,100 ms and frozen project data; this is
not a full-page navigation or playback test.

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

Optional keyframe `description` is now a validated plain-text field (up to 1000 characters, empty omitted in portable projects). Studio, draft checkpoints, Undo/Redo, copy and portable export/import preserve it. Current camera contracts lock presentation as
well as physics; Scene/Compare is not merely a freely editable display toggle
inside every project. An alternate playback view, if supported, needs a
validated detached reference/project and must never silently retarget a
physical animation's channel. Camera and physical changes together remain
outside current supported playback contracts.

## First source project: Soundly

User-supplied `curvature-animation.json` (2026-11-18, SHA-256
`1d404662096922477329db126f8eac207bc45785f9cebaf078a56e8db1a214bb`).
Patch 1 ships this export byte-for-byte as `demos/modern/soundly.json`.
The SHA-256 and authored Scene mode remain pinned by focused tests. Patch 4
selects Compare in the catalog manifest, not in the source JSON.

- `Soundly Causeway · Bridge Camera Study`, v2 Camera, spline, Auto quality,
  nine keyframes, 59,100 ms including holds, fixed 128 bridge sections.
- Adaptation of Legacy K0, K2, K4, K5, K9, K12, K13, K15, K16; last four
  viewing directions correspond to Observation Scenes 1–4, not photographic
  pixel matches. Geometry anchored to K12; opposite camera motion approximates
  Legacy bridge relocations. Commentary and redundant transitions omitted.
- Scene starts Globe/vacuum; dormant Compare is already A Globe/vacuum,
  B Flat/vacuum. Both authored reference display modes equal `scene`; the runtime catalog
  sets both to `compare`.
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
| 1 — Built-in Demo Catalog | Implemented; browser gate open | Ship original Soundly portable JSON and manifest; stable unique IDs, deterministic order, validate with existing APIs, reject invalid/duplicate catalog entries and missing assets with explicit errors, no IndexedDB writes. Test real asset loading and supported launch paths; source data immutable. |
| 2A — Project Lifecycle foundation | Implemented | Explicit durable copy API; optional portable cover data, shipped Soundly working cover and provenance. |
| 2B — Project Lifecycle integration | Implemented; browser gate open | Open read-only demo, protect all mutation paths (including autosave, shortcuts, Save/Save As, rename/delete), explicit Create copy with new identity and independent owned data; persistence/recovery, storage failure and repeated-copy tests. No implicit duplicate reuse. |
| 3 — Studio Catalog UI | Implemented; browser gate open | Built-in Demos / My Projects categories, existing card style, open/inspect/play/export/copy controls; no editable actions on original. Browser tests for category isolation, copy, reload, keyboard and outgoing unsaved work. No new player. |
| 3A — Project Cover Editor | Implemented; browser gate open | Upload, capture current frame, replace/remove and portable round-trip for user projects. Cover-first display and thumbnail fallback are already implemented in patch 3. |
| 4 — Compare Playback | Implemented; browser gate open | Audit/extend existing Scene/Compare player as necessary; one clock/sample for A/B, same camera and independent optics, play/pause/seek/restart and exports. Validate detached Soundly Compare variant, preserve original content, verify no stale or mixed-time frames, fallback on unsupported geometry, representative Accurate comparisons and actual browser FPS. First functional demo milestone after manual acceptance. |
| 4A — Keyframe Navigation | Implemented; browser gate open | Click an included compatible keyframe to pause, seek to exact arrival milliseconds and repaint using existing paused-frame lifecycle. Auto-prepare compatible unprepared drafts; excluded/incompatible cards remain editor selections. Read-only navigation does not persist authored changes. |
| 4A.1 — Paused Keyframe Rendering | Implemented; Opera acceptance open | Fix reported dependence on Play: immediate forced paint for a laid-out stage, deferred layout path otherwise; validate actual rendered time and preserve failure/retry. |
| 4A.2 — Storyboard | Implemented; Opera acceptance open | Horizontal navigation strip beside playback, using shared keyframe selection. Keep detailed editor below, hide redundant editor for read-only demos; preserve Compare width. |
| 4B — Keyframe Thumbnail Capture | Implemented; Opera acceptance open | Capture only a successfully painted selected keyframe at its exact arrival. Reuse bounded screenshot composition (Scene or both Compare sides), lazy capture on explicit jump, manual refresh and transient cache keyed by visual state; validate History provenance before reuse. No eager whole-project render. |
| 4C — Keyframe Thumbnail Persistence | Implemented; Opera acceptance open | Separate bounded IndexedDB thumbnail cache, restore, duplicate and optional portable JSON attachments with size limits; prune unused entries. Never put raster payloads into LocalStorage draft checkpoints or physical fingerprints. Built-ins remain immutable. |
| 5 — Presentation Mode | Implemented; user confirmed in Opera | Viewer-focused layout, timeline, play/pause/restart, fullscreen, title/current frame and optional camera HUD, open Studio/Create copy. Same player and project, no second timeline or engine; test resize, keyboard/fullscreen exit and lifecycle. |
| 6 — Narrative Support | Implemented; user confirmed in Opera | Optional plain-text keyframe description, up to 1000 characters; outgoing caption remains visible until the next arrival, including travel, with explicit source-frame label. Empty next caption clears the text. Synchronize to the last successfully painted time. A bounded panel is shown in Presentation only when the active sequence has explanations. Old JSON remains readable and unchanged; draft checkpoints, Undo/Redo, copies and portable export/import preserve descriptions. Author Soundly captions in step 7; PNG/video overlays are not added by this step. |
| 7A — Complete Storyboard Export | Implemented; Opera acceptance open | Capture missing or regenerate all active keyframes on isolated fixed-size canvases, with progress/cancel, no playhead changes. Export current prepared project with every thumbnail or a compact JSON without keyframe images. Shipped portable assets may contain validated thumbnails; discard imagery if a catalog display override changes the view. Library backup actions continue to export available cached images. |
| 7B — Soundly Narrative & Sources | Planned | Adapt Legacy explanations to the actual keyframe sequence, document original observation links and source provenance. |
| 7C — Soundly Finalization | Planned | Apply standard atmosphere to Globe and Flat; identical profile, not historical weather reconstruction. Verify Canvas Direct vs Accurate RK4, revise captions/hold times, generate complete final storyboard and cover, validate controls, copy/export/reimport and browser performance. Tag only after CI/manual acceptance. |
| 7D — Presentation Atmosphere Toggle | Planned | Optional synchronized vacuum/standard-atmosphere comparison without changing the authored camera trajectory. |
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

## Project covers and lifecycle split

Built-in cover paths are declared in the manifest; the generator validates PNG
assets and embeds bounded data URLs for independent copies without network access.
Soundly's user-supplied video still has unknown original source and unverified
rights; replace or clear it before public release unless permission is confirmed.
The optional library `cover` data URL is distinct from the first-frame `thumbnail`,
excluded from physical fingerprints, preserved by update/rename and portable
export/import. Old records without covers remain unchanged. Explicit copies use
new library IDs and bypass content deduplication.

2B connects the existing Studio player to an owned, detached demo draft. The
retained workspace ID still points to the prior user checkpoint. The switch
coordinator checkpoints outgoing user work before showing a demo, but skips
checkpointing the demo itself (or a pristine initial blank). A failed outgoing
write cancels activation. Late startup recovery cannot replace the viewer;
reload restores the previous user workspace, not the demo. Playback quality
may be overridden in memory, while interpolation, authored HUD appearance,
keyframe edits, undo/redo and Save are locked. The minimal Library buttons
Open, Create copy, Close demo and Export demo permit acceptance before the
full gallery in patch 3. Export is ordinary portable JSON with the cover;
Export all continues to include only user records. Save As on a named copy
preserves its cover. Copy failure leaves the demo open. No new player or
physical rendering path is introduced. 3A will implement cover upload/frame
capture/replacement/removal and fallback thumbnail display.

### Studio catalog UI (patch 3)

Animation Library now presents two separately labelled categories on one page:
Built-in Demos (always visible) and My Projects (existing saved-project
filters, folding, backup selection and working drafts remain personal only).
Built-in cards reuse the existing card visual style, show a read-only/opened
indicator, authored metadata and a static reference image. Open demo opens the
existing paused Studio player; its existing playback controls remain the only
player. Create copy can be invoked directly on a card and uses the same durable
outgoing-workspace checkpoint and validated copy operation as detached playback.
Export demo is available without opening the project; it never changes personal
backup selection. Details inspect the validated experiment and actual saved
physical thumbnail, if any, not the reference photograph. No rename or delete
controls exist on built-in cards. Personal cards show the portable cover first,
then a saved thumbnail or neutral no-screenshot state; broken covers fall back
without altering project data. The working Soundly image remains unverified.
User gallery scroll/selection excludes built-in cards. Cover editing remains 3A.

Validation: complete Node regression (1787/1787), followed by 65 focused tests
including the final physical-details wording; refactor closure 136/136 and
protected Legacy references 6/6. Isolated Chromium DOM validated gallery
controls, keyboard copying callbacks, personal cover rendering and details.
All 13 full browser smoke cases were attempted but navigation was blocked by
ERR_BLOCKED_BY_ADMINISTRATOR; CI and Opera acceptance are still required.

### Project cover editor (patch 3A)

Saved personal cards support Upload cover, Capture frame and Remove cover.
PNG/JPEG/WebP uploads are decoded locally, bounded to 20 MB input and 50 MP,
resized to fit 960 × 600 and re-encoded as a portable JPEG (750,000-character
limit); a temporary object URL is released. Capture frame requires the opened
personal project and a successfully rendered, paused preview. It captures
the last displayed frame, even if the playback clock advanced on pause. It copies the actual scene Canvas (both A/B for Compare),
without HUD, using the existing screenshot composition. No physical rerender.
Removing a cover restores the normal thumbnail/placeholder fallback. Unsaved
projects must be saved before cover editing. Built-in cards remain read-only;
cover editing is disabled while the detached demo viewer is open.

Cover changes commit immediately as metadata-only, revision-checked library
transactions; physics, thumbnail, name and quality are not changed. Local
workspace revision is advanced only when it matches the previous saved
revision. Save As, copy and portable export retain the cover. Existing import
content-deduplication is unchanged (an already present project is not overwritten).

Canvas Direct is the default Studio optics choice for new drafts and built-in
projects authored with Auto; Soundly opens and copies with Canvas Direct,
without changing the original JSON. Explicit non-Auto authored or saved user
choices are honored, and existing capability checks and Accurate fallback
remain in place. No change to physical or export accuracy policies.

Validation: complete Node suite 1791/1791 before the final paused-frame
capture clarification; final focused suite 86/86 including a displayed-frame
A/B capture test. Refactor closure 136/136, protected Legacy references 6/6,
and both boundary checks passed. Isolated Chromium decoded and re-encoded
Soundly's PNG and composited two real canvases. The new full-page browser smoke
case was attempted but blocked at navigation (ERR_BLOCKED_BY_ADMINISTRATOR);
CI/Opera acceptance is still required.


### Synchronized Soundly comparison (patch 4)

The manifest selects `displayMode: "compare"` for Soundly; the runtime
project and contract reference are validated together. Open, Create copy and
portable export use this same detached Compare project. The byte-identical
Soundly authoring source remains Scene/Auto, with its original description
(provenance of the globe-only study), camera trajectory, spline and timing.
A generic Scene/Compare editor toggle is not introduced in this patch; the
project's authored reference remains locked in the existing editor.

The existing player samples one time for both A/B models and renders within
one synchronous paint. Labels identify the actual surface and atmosphere.
Canvas Direct is used by default; the existing paired Accurate fallback is
retained. If either paint throws, opaque failure notices cover both canvases
and rendered time stays invalid until a successful retry. A frame cannot be
captured while the pair is incomplete. PNG/video export remains Accurate,
with the existing A/B and combined/separate plans and exact endpoint.

Evidence: test every 100 ms of the 59.1 s trajectory against the original
Camera sample, all keyframe arrival/departure points through the production
Canvas Direct renderer (mock drawing context), and shared clock, failure,
retry, export/reimport and fallback regression paths. Isolated Chromium with
real 800 × 500 canvases and production Studio Preview renderer rendered nine
selected times (A and B), both Canvas Direct and Accurate. After compositing
transparent pixels onto white, 0.71–2.57% of pixels differed by more than 20
in any RGB channel; this includes styling/decorations and is not a bound on
physical projection error. Sixty separately timed pairs along the trajectory
had median 13.4 ms and p95 29.0 ms in that environment. This is synchronous
render cost, not measured live playback FPS, and is not an Opera guarantee.
Full-page smoke for opening, seeking, play/pause and restart was attempted
but navigation was blocked (ERR_BLOCKED_BY_ADMINISTRATOR). Manual Opera/CI
acceptance, actual FPS and broader numerical qualification remain open.

### Keyframe navigation (patch 4A)

Clicking a filmstrip card selects it and jumps to the validated active
sequence's `arrivalMs`, not a rounded slider position or a source History ID.
The playback controller cancels outstanding live RAF and paused initial
paint, pauses, sets exact milliseconds, checkpoints only personal workspace
state, synchronizes the clock and slider, and schedules the existing
layout-aware paused paint. A compatible unprepared draft is prepared on demand
without scrolling to the player. Incompatible/unfinished projects and excluded
cards retain selection-only behavior. A read-only Soundly jump never writes the
built-in or outgoing user workspace. Selection does not create an Undo entry.
The clock displays hundredths of a second; underlying seek retains the exact
numeric milliseconds. Manual slider scrubbing still retains a running clock.
The last rendered timestamp is invalidated before painting; failure/retry
uses the existing preview lifecycle. Thumbnail capture and persistence are
separate steps (4B/4C), not implemented here.

Validation: 110 final focused tests passed, including exact Soundly arrival
samples, subsequences, stale live RAF cancellation, rapid paused jumps,
auto-prepare and incompatible-card selection. Refactor closure 136/136 and
protected Legacy references 6/6 passed. Chromium was launched using the
system executable, but full-page navigation was blocked by
ERR_BLOCKED_BY_ADMINISTRATOR. The new end-to-end case is retained for CI;
manual Opera acceptance remains open.

### Paused keyframe rendering (patch 4A.1)

Opera feedback: keyframe navigation was reported to work only after Play,
and the editor filmstrip is too far below the playback view. The 4A.1
change directly paints a selected paused frame when the preview host has
a usable layout width, reusing the lifecycle renderer and completion/error
callbacks. Hidden or not-yet-laid-out views retain the deferred path.
The rendered timestamp must equal the requested paused playhead before
announcing success. Covering stale RAF callbacks must not clear newer
requests. No animation clock start is necessary. The actual Opera failure
mechanism has not been reproduced here; manual acceptance is required.
4A.2 will put a shared-selection Storyboard next to playback before adding
keyframe thumbnails; it is deliberately separate from this correction.

### Horizontal Storyboard (patch 4A.2)

The navigation strip sits directly under the playback controls and displays
only the prepared active sequence, with original draft numbering and exact
arrival times from the validated playback timeline. Both editor cards and
Storyboard buttons invoke the same key-based selection/jump path. Selection
is revealed horizontally without scrolling the page. Read-only demos do not
repeat the keyframe list below playback. Owned projects keep the original
editor, including reorder/delete and excluded frames, in a collapsible panel;
it reopens when no preview is prepared. No thumbnail capture or persistence
is introduced yet (4B/4C). Canvas width and physics remain unchanged.


### Lazy keyframe thumbnails (patch 4B)

The Storyboard and detailed editor share previews of the actual keyframe state.
An explicit jump requests a screenshot only when neither an exact-state cached
image nor a validated, matching History screenshot exists. Capture runs after
successful rendering at the requested arrival time, with the same player,
selection and physical sample, while paused. It uses the existing bounded
Scene/Compare Canvas compositor (both A/B, labeled); no additional optics render
is made simply to encode the image. The Capture thumbnail button explicitly
jumps and refreshes the selected image, including in read-only demos.

The cache is a transient, state-keyed LRU (200 entries, 12 million total key and
image characters). Names, IDs, travel/hold durations and order are not identities;
changed camera/physics/display snapshots never inherit stale thumbnails. The
exact validated snapshot is deliberately conservative about display differences.
Optical preview quality and detail are not part of the physical identity: an
existing preview can be retained after a quality change and manually refreshed.
History source IDs alone do not establish a matching snapshot or valid image.
Cache eviction or a failed screenshot leaves a missing image, never a failed
physical frame. Opening a project, playing and ordinary scrubbing do not eagerly
capture images. Read-only projects and their copies can reuse identical cached
states in the same browser session. No cache contents enter the project, Undo,
Library, export or draft checkpoint. Persistence and portable assets are 4C.

### Durable keyframe thumbnail cache (patch 4C)

An independent IndexedDB database (`curvature-modern-keyframe-thumbnails`,
version 1, `images` store) holds validated thumbnails keyed by the exact
serialized frame experiment used by the transient cache. This avoids storing
raster data in project records, Undo, physical fingerprints or LocalStorage
recovery checkpoints. Built-in demos, named copies and independent drafts
share only exactly matching states. No eager physical renders are introduced.

Startup hydrates the cache; captures made while the read is pending win over
restored images. Captures (including explicit reuse of matching History images)
are written asynchronously after the successful paint. The store is bounded to
200 entries and 12 million combined key/image characters; each write prunes
invalid and oldest-written rows transactionally. Reads do not refresh durable
recency. Deleting a project does not remove shared images: they are evicted by
the bounded cache. Storage failures leave the in-memory cache usable and log a
warning; the cache is disposable and cannot block project saves or playback.

Portable Library JSON and built-in demo exports automatically include available
`keyframeThumbnails` attachments (optional array of `{index, image}` per
animation). Index refers to the exported project's own keyframe order. Import
validates unique indices, mode, image shape and size before writing projects;
only after the project transaction succeeds are images added to the shared cache.
Existing exact-state cached images take precedence. Import failure in optional
thumbnail storage is reported separately from the successful project import.
The physical project schema and deduplication fingerprint are unchanged. Files
without attachments remain valid; older readers that reject unknown optional
fields require an export without attachments from the underlying Library API.
Attachments are limited to 12 million image characters per animation and the
existing 50-million-character whole-file limit still applies. Export does not
render missing images. Cache persistence is best-effort, not a permanent photo
archive. Browser storage commit must finish before reload to restore a newly
captured image.

### Presentation view
The Presentation button on a prepared preview opens a viewport-filling,
viewer-only layout of the same mounted stage. Play, Pause, Stop, seek,
Storyboard, camera HUD and target visibility remain available; editing and
export controls are hidden. The project title and the last painted keyframe
or transition identify the image; the actual optics quality remains visible.
Fullscreen is optional (browser permission); Escape after exiting native
fullscreen, or Open Studio, restores the ordinary layout and focus without
resetting the playhead. Create copy exits into the existing durable copy flow.
Resize uses the existing paused repaint or live playback path. No additional
player, physical state, autosave format or authored fields are introduced.

### Portable JSON filenames (7A.1)

Catalog, Storyboard and Animation Library exports share one naming function: a filesystem-safe project title (Unicode letters and digits retained), local timestamp `YYYYMMDD-HHMMSS-mmm`, and `-with-thumbnails` if any keyframe images are included. Library-wide backups use `curvature-animations`. The suffix does not promise completeness for library exports; complete Storyboard export retains its existing guarantee. The JSON content and project name are unchanged.
