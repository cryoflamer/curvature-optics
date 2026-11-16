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
contract description when an existing v2 project is opened. The **New project** command now opens the v2 creation wizard, which writes
validated contracts and can save unfinished projects. See
[Project creation wizard](modern-animation-project-wizard.md).

## Still outside this stage

- The five-step creation wizard is implemented. **Editing an existing locked
  contract** remains unsupported; create a new project to change its invariant
  parameters.
- The ordinary Studio Snapshot Picker now enforces the currently opened v2
  contract in addition to the independent History search/physics filters.
  Only compatible records are shown by default. **Show incompatible** reveals
  blocked cards and diagnostic paths for inspection / Open in History, but
  never enables checking or dragging them. Hidden, compatible selections remain
  checked across searches; incompatible selections left from a prior project
  are cleared before rendering. All insertions are revalidated by Studio.
  Project v1 retains the former unrestricted Picker workflow.
- Experimental stores collections only; it does not make mixed Scene/Compare
  or hard-cut exports available. The existing v1 `build()` path remains the
  sole Preview/Export preparation path for ready Camera/Physical drafts.
- No physics, RK4, refraction, image generation or IndexedDB schema migration.

Animation Library search by project type, reference physics and metadata is
implemented. Stabilization tests now cover first-keyframe thumbnail identity,
portable/library duplicate detection and static Legacy/Modern dependency
audits. Actual visual interaction and IndexedDB behavior still require
acceptance testing in the target Opera/Chromium installation.


## Animation Workspace recovery boundary

Modern Animation has three distinct state owners. None is the physical Scene/Compare
experiment, History archive, or named Animation Library:

- `src/animation/ModernAnimationDraftAutosave.js` owns checkpoint/collection
  formats, tab-scoped synchronous recovery keys, migration, tombstones and atomic
  IndexedDB merging. It must not render the UI or manage browser lifecycle events.
- `src/animation/ModernAnimationWorkspaceRecovery.js` owns **startup ordering**:
  local and session-backup collection reads, legacy v1 migration, first-workspace
  creation, async durable reconciliation, generation-guarded late reads and
  `pagehide`/`beforeunload`/hidden-page flush notifications. It receives explicit
  callbacks rather than borrowing the editor's mutable variables.
- `src/animation/ModernAnimationWorkspaceSwitch.js` owns **outgoing switch
  sequencing**: validate the destination, synchronously checkpoint the outgoing
  editor, await its durable write, recheck the edit generation before and after
  a saved-project lookup, then request activation. Wizard creation follows the
  same checkpoint barrier and subsequently saves the named project. It calls
  back into the UI rather than accessing IndexedDB or the DOM directly.
- `src/animation/ModernAnimationWorkspacePersistence.js` owns the **serialized
  durable write queue** and its transaction reconciliation result handling:
  atomic merge against the latest IndexedDB collection, baseline advancement,
  pruning completed session backups, active-workspace conflict forking,
  stale-delete warnings and local-backup fallback after a failed write. The
  module reports conflicts to the UI but never edits DOM or Studio models.
- `src/ui/modern/ModernApp.js` still owns the active Animation Studio editor,
  selection, Library actions/UI, `restoreStudioDraft`, staging of synchronous
  checkpoints, and the state updates presented after a conflict fork.

### Recovery, switching and persistence invariants

1. The local/session backup restores synchronously before the IndexedDB read.
2. A remote read arriving after the current editor generation changed **never
   replaces the active draft**. It is passed to `absorbLateStudioWorkspaces`.
3. A fresh unsaved placeholder may be replaced by a durable collection. Other
   local-only workspaces are merged and then committed with the existing
   conflict-aware writer; recovery cannot simply overwrite IndexedDB.
4. Lifecycle notifications flush only when the editor has changed, invoking
   the same synchronous backup and durable-write entry points as before.
5. A switch cannot replace the active editor until its outgoing checkpoint has
   been saved and the durable write succeeded. Edits racing with that write or
   a subsequent Library fetch cancel the switch rather than dropping work.
6. Writes are queued per page. A queued transaction takes a snapshot of the
   outgoing collection but reads the baseline **after** previous writes settle.
   A committed write cannot overwrite a newer editor generation; its remote
   collection is absorbed into independent drafts and scheduled for another
   checkpoint. A same-ID concurrent edit forks the local branch; a stale
   deletion is rejected. Failed IndexedDB writes preserve tab-scoped backups
   and prevent switching when no backup is available.
7. An unedited scratch workspace can be discarded only after successful
   activation of another workspace. A saved-project lookup failure leaves the
   current editor intact; a Wizard save failure leaves the new draft available
   for a later explicit Save project.
8. No Animation Project v1/v2 JSON, IndexedDB keys/versions, Scene/Compare state,
   History entries, or optics/rendering behavior changes at this boundary.

### Checks

```sh
node --test tests/ModernAnimationWorkspaceRecovery.test.js \
  tests/ModernAnimationWorkspaceSwitch.test.js \
  tests/ModernAnimationWorkspacePersistence.test.js \
  tests/ModernAnimationWorkspaceConcurrency.test.js \
  tests/ModernAnimationDraftAutosave.test.js
node tools/check-refactor-closure.js
```

The ordinary GitHub Actions Node and Chromium smoke jobs remain the integration
checks for restoring and switching Animation workspaces in a real browser.

## Animation Library actions boundary

The named Animation Library is distinct from the crash-recovery Draft collection.
`src/animation/ModernAnimationLibrary.js` continues to own the portable
schema, records, IndexedDB transactions, duplicate matching, and revision
checks. `src/animation/ModernAnimationLibraryActions.js` now coordinates the
application's **list/refresh, export selected/all, validated JSON import,
rename, Save Changes, Save As/Duplicate, and confirmed delete** operations.
The coordinator owns busy-state completion and status/error propagation, not
DOM rendering or the active editor's data. Its callbacks into `ModernApp.js`
retain these invariants:

- **Save Changes** uses the exact `updatedAt` revision of the opened Library
  record. A rejected write never changes the active named revision.
- **Save As** deliberately permits a duplicate animation; it promotes the
  working draft to a new named project and preserves the old named workspace.
- **Rename** is metadata-only. The active editor's unsaved title/physics edits
  remain intact; a checkpoint tied to the old revision is rebased after an
  accepted rename, including for inactive project workspaces.
- **Delete** is confirmed before the record is removed. Detached saved-project
  working edits remain recoverable as an independent local draft.
- **Portable import/export** retain validation and size limits. Import adds
  Library records without changing the live editor; export serializes selected
  or all named records, not autosaved drafts.
- Missing IndexedDB or a failed transaction produces an error message and
  releases the busy flag without discarding unsaved editor work.

This is a coordination refactor, not a Library schema migration. The new
classic-browser script loads after `ModernAnimationLibrary.js` and before
`ModernApp.js`. Verify with:

```sh
node --test tests/ModernAnimationLibraryActions.test.js \
  tests/ModernAnimationLibrary.test.js \
  tests/ModernAnimationWorkspaceConcurrency.test.js
node tools/check-refactor-closure.js
```

## Animation Preview lifecycle boundary

`src/animation/ModernAnimationPreviewLifecycle.js` owns **only the timing and
cancellation of the first/paused Animation Preview physical frame**, separate
from the Animation Studio editor and the playback/optical pipeline. It holds
one pending `requestAnimationFrame` handle, a generation token, bounded retries
for initially hidden GraphX3DX canvas layout and measured viewport widths.
When an old callback runs after a Prepare, Stop, Seek or workspace change, its
generation guard prevents it from painting into the newer preview. Hidden
workspaces preserve the repaint request without painting; paused-frame resizes
schedule a fresh image only when the visible canvas width changed.

`src/ui/modern/ModernApp.js` retains the live playback position, physical
renderer invocation, frame/HUD overlays, loading/error/ready messages and the
explicit Preview-navigation gesture. The coordinator calls back into these
existing operations; a restore cannot scroll to playback, but an explicit
Preview click can do so **only after a successful rendered frame**. On a renderer
exception it leaves the frame retryable and sends the pending navigation to
the error message instead of a stale canvas. The renderer, data schemas,
IndexedDB, interpolation math, Scene/Compare and Legacy stay unchanged.

Run the focused tests and architecture gate:

```sh
node --test tests/ModernAnimationInitialFrame.test.js \
  tests/ModernAnimationStudio.test.js \
  tests/ModernAnimationSplinePreview.test.js
node tools/check-refactor-closure.js
```

The Chromium smoke job on GitHub Actions remains the browser integration gate;
Node tests alone do not establish visual frame equivalence.

## Animation Studio editor state boundary

`src/animation/ModernAnimationStudioEditing.js` coordinates the Studio draft
edit history and selection transitions. `commit()` records a meaningful edit,
ends a live text-edit group on change, normalizes selection to a surviving
keyframe, checkpoints the working draft, and rerenders. The final `change`
after a successful `input` does not trigger a second save or rerender.
`live()` records coalesced text input without replacing the focused DOM control;
`step()` restores draft and selection using the same bounded Undo/Redo history.
`remove()` records the deleted keyframe with the **original selection** so
Undo restores both the frame and the user's prior selection.

`ModernApp.js` retains browser key bindings and native input Undo priority,
DOM focus/scroll, Preview invalidation, message display and actual local/durable
persistence. State is read live from the currently active workspace, never
cached in a closure that can outlive project switching. Named Library records,
History snapshots, JSON schemas, interpolation math, optics and Legacy are
unchanged.

Run focused regression checks:

```sh
node --test tests/ModernAnimationStudioEditing.test.js \
  tests/ModernAnimationStudio.test.js \
  tests/ModernAnimationDraftAutosave.test.js
node tools/check-refactor-closure.js
```

## Animation Playback control boundary

`src/animation/ModernAnimationPlaybackControls.js` coordinates Play, Pause,
Stop, Seek, the single active `requestAnimationFrame` tick and tab visibility
pausing. It reads the **currently active** playback clock on every operation,
never a captured project/player; cancelled callbacks have a generation guard.
Changing camera interpolation cancels the prior tick before swapping clocks
and schedules at most one new tick, preserving elapsed playback position.
Natural completion saves the paused position and explicitly reports finish;
Stop resets the playhead and requests a first-frame repaint without navigating
away from the editor. Seek renders the exact selected position, while the
on-screen clock distinguishes its value from the last physically painted frame.

`ModernApp.js` continues to own the actual camera/physical renderer, DOM
controls and status text, animation project construction, draft autosave,
Preview layout/resize lifecycle and initial frame painting. The deterministic
`ModernAnimationPlayback.js` interpolation and clock model is unchanged; Scene
and Compare never receive a playback sample. No storage, JSON, optics or Legacy
contract changed.

Check this boundary with:

```sh
node --test tests/ModernAnimationPlaybackControls.test.js \
  tests/ModernAnimationPlayback.test.js \
  tests/ModernAnimationSplinePreview.test.js \
  tests/ModernAnimationInitialFrame.test.js
node tools/check-refactor-closure.js
```

## Animation refactor closure audit

The seven opt-in, classic-script coordinators extracted from `ModernApp.js`
are now a bounded architecture rather than a reason to keep adding modules:

| Owner | Responsibility | Explicitly remains outside |
| --- | --- | --- |
| `ModernAnimationWorkspaceRecovery` | Local/session/IndexedDB startup reconciliation and page lifecycle flushes | Active editor, storage schema |
| `ModernAnimationWorkspaceSwitch` | Outgoing write barrier and generation-checked activation | Actual activation/UI |
| `ModernAnimationWorkspacePersistence` | Serialized atomic write reconciliation, conflicts, backup fallback | Checkpoint construction and editor state |
| `ModernAnimationLibraryActions` | Named-project list/import/export/save/rename/delete sequencing | Named Library record schema, active draft |
| `ModernAnimationPreviewLifecycle` | Pending first/paused-frame RAF, layout retries and resize tracking | Optical renderer and view messages |
| `ModernAnimationStudioEditing` | Draft edits, keyframe selection, bounded Undo/Redo | DOM focus, native keyboard shortcuts and persistence |
| `ModernAnimationPlaybackControls` | Play/Pause/Stop/Seek and live playback RAF lifecycle | Player math, optical renderer and preview UI |

The browser still loads these as **seven separate scripts before**
`ModernApp.js`. Each exports a `CurvatureModernAnimation*` global and has a
`create()` API. Do not silently bundle them, reorder them after the app, or
copy their lifecycle logic back into a large UI callback.

### Findings and cleanup decision

- `ModernApp.js` decreased from **6593 lines before recovery extraction**
  to **6432 lines** at this audit. Raw line count is not an architectural
  correctness metric: its remaining work includes Scene/Compare physical
  renderer dispatch, Camera/History interactions, input/DOM composition,
  and integration of the active Animation draft with UI and renderer.
- Its private `handleHistoryRestore()` error wrapper had no callers. The
  live `ModernHistoryRestore` click already calls the guarded `handle()`
  helper, which catches async restore errors and displays History status.
  The wrapper was removed; the real Restore success/failure tests remain.
- A static one-occurrence scan of top-level named function declarations found
  no other plainly orphaned declarations. This is **not** complete dead-code
  analysis (dynamic use, closures, object properties and comments complicate
  reachability); deletion beyond this one proven wrapper is deliberately
  deferred until call sites and browser behavior can be demonstrated.
- **Do not split `ModernApp.js` again just to shrink the file.** A next
  extraction needs a specific fault or measurable maintainability benefit,
  a named owner, a bounded interface, and end-to-end regressions. High-risk
  boundaries are History restore/navigation, the optical render dispatch,
  DOM focus handling, and cross-tab writes; do not mix those in one patch.

### Refactor acceptance gate

```sh
node --test tests/ModernAnimationRefactorBoundary.test.js \
  tests/ModernHistoryPickerNavigation.test.js \
  tests/ModernExperimentHistory.test.js
node tools/check-refactor-closure.js
```

The architecture test checks the script load order, exported factories, and
actual `ModernApp.js` bindings; it also guards the single Restore path and
flags plainly unreferenced top-level named functions. GitHub Actions continues
to cover the full Node suite and real Chromium smoke tests after push.
Static checks do not certify Opera interactivity, visual pixel parity or a
race-free browser implementation.
