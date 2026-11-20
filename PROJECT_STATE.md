## Active roadmap — Photo-based Physical Research (2026-11-20)

User approved prioritized GitHub Issues #8–#20 and explicit calibration
targets Scene / Compare A / Compare B. See the approved roadmap at the
top of docs/landmark-editor-audit.md. P0 order: #8 foundation, #9 Scene
apply, #10 Scene overlay, #11 shared-camera Compare apply, #12 Compare
overlay, #13 provenance/History and milestone verification. P1 #14–#17
projects/navigation/reopen/bundle; P2 #18–#20 future comparative research.
P3 existing technical debt #1/#2/#5. #6/#7 retained pending scope review.
Native milestone/priority label creation unavailable through current
connector; grouping and priorities documented in issue bodies/titles.
Baseline 6ee1829 full CI passed (44741109985). No runtime or test changes
in this planning commit. Next active issue #8, step 8F.7b.1. Origin
contract must support Compare side association from the start; shared
camera and objects, chosen-side physics, fixed common photo registration.
Independent-camera Compare is deferred to #19.

## 8F.7a.2 — Photo-centric research workflow audit (revised plan)

User approved a Scene overlay with independent photo aspect, Canvas Direct
fit as a starting point for normal Accurate experimentation, and reciprocal
navigation between History, Reference Image Library and unfinished
calibration projects. See docs/landmark-editor-audit.md 8F.7a.2; it supersedes
the mandatory arbitrary-Scene-aspect and renderer-equivalence gates of
8F.7a. Existing photo links belong to Animation keyframes, not History
snapshots; reuse the existing original library and History, not a second
physical journal. Keep the four Scene aspects; register original photo
angular coordinates against an applied baseline and real renderer pixel
transform, not fit-to-canvas stretching or tracking current camera edits.
Proposed content-bound photo identity, immutable archived calibration
result, bounded optional experiment origin, distinct current vs derived
fit status, protected apply and existing explicit Save Snapshot. Unrelated
old Scene recovery must commit before applying. Existing active draft
remains usable; migrate later to independent Calibration Projects, with
guarded switches, per-project UI and non-cascading deletion. Use Animation
workspace concurrency patterns, not its concrete schema/localStorage
payload. History and reference-library reverse lookups reuse authoritative
records; full research bundle later. No runtime/schema changes; source
audit only. Next: 8F.7b.1 minimal identity/result archive/state and pure
transfer mapping; then 8F.7b.2 Apply/recovery, c Overlay, d History,
e Calibration Projects, f Reference Library related navigation, g closure.
Full revised acceptance in audit.

## 8F.7a — Calibration to Scene architecture audit

User confirmed the 8F.6 tests passed and approved completing the original
workflow: apply the fitted calibration to ordinary Scene, then deliberately
Save Snapshot. Verified baseline 5c33675 GitHub Actions run 44683469032 success.
See docs/landmark-editor-audit.md (8F.7a) for the source audit, transaction
contract, provenance and staged acceptance criteria. Major blockers:
Soundly is 1176x791, not an accepted fixed Scene aspect; Scene uses a graph
viewport transform instead of the centered calibration raster; Canvas
Direct fit is not identical by definition to Accurate rendering; old
calibration captures only atmosphere/temperatureProfile plus model.
Reuse canonical experiment validation/apply and protected History recovery
rather than copying the seven camera values into the live Scene. Exact
framing + Eye-Lvl, captured geometry/physics, asynchronous stale-state
guards, explicit recovery, preserved calibration draft and manual Snapshot
are required. No runtime or schema changes in the audit. Next: 8F.7b.1
exact framing and serialization/viewport compatibility before adding
the apply action. Full tests required for implementation stages.

## 8F.6 closure — final Compare harness correction

CI on a7e8d84 (2026-11-20): Node 2168/2169, Chromium 37/37; five architecture gates passed, representative regressions 135/136. Both failing jobs shared the same new Compare integration fixture, not a separate product regression. Reproduced the actual error with the full failing test callback and real ModernApp/CompareModel/playback modules in an isolated JS harness: the ready DOM canvas reaches drawCompareHorizon, but ModernHorizonStatusA was absent from the test DOM. Added both horizon readouts, Canvas context methods and error forwarding; verified the original callback fails and the corrected callback passes, including the expected horizon fallback readout. Production code unchanged. Native full Node/Chromium CI rerun remains required before tagging.

## 8F.6 closure — CI regression correction

CI on c7284d8 (2026-11-20): all 37 Chromium tests passed; Node 2144 passed / 25 failed. Two Node failures and the architecture gate concerned the stale isolation inventory; 23 concerned Compare rendering. Reviewed the inventory against the current source tree and literal require references, including CalibrationPointerGestures and Soundly fixture tests. Corrected Compare readiness so actual DOM canvases require a valid layout and legacy transform while renderer adapters retain their original contract. Extended the existing Compare integration test to cover unready and ready DOM callbacks. No physics or calibration changes. Full CI rerun remains required before tagging.

## 8F.6 closure — Browser-confirmed physical calibration

On 2026-11-20 the user confirmed a fresh calibration run after 8F.6l,
not merely import of a previously saved result: Soundly Globe/vacuum,
14/14 Fit projections visible, RMS 6.82 px, largest residual #2 15.35 px.
No held-out Validation points. Result and residual table were verified
visually. This confirms the principal workflow, not formal convergence
or complete acceptance of every editor gesture.

CI on 84f0ce6: 2125 Node passes / 44 failures, two Chromium failures,
and stale static isolation inventory (protected Legacy preservation passed).
Closure restores the shared photo-select populate helper accidentally
removed with legacy controls, corrects browser assertions for draft state,
reviews the gesture helper inventory, and narrows the Compare readiness guard.
Full CI must pass before declaring a stable baseline; remaining failures
are not waived. No physics changes were made.

## 8F.6l — Physical-only editor and legacy removal

The user explicitly retired both the old modeless Free View / Magnifier and
Flat correspondence editor. Removed their HTML, CSS, editor handlers,
picking/ownership raster APIs, window positioning and storage, crop panning
and zoom, old optical-viewer mount/open/park/resume paths. The integrated
physical viewer is the only correspondence editor. Kept the mathematical
geometry helpers, original pose/solver and physical scene/Compare rendering.
New Fast Vertex observations use full material anchors; old Globe vertex
rows and existing v1/v2/v3 Globe exports remain supported. Physical viewer
session schema v4 is retained; obsolete window/crop states are ignored.
Retired Flat captures/imports are rejected; replacing a stored Flat draft
requires explicit confirmation. Flat optics outside Photo Calibration were
not changed. Result now draws initial markers from original-pixel physical
projections and caches against the actual scene and rows.

Targeted adapter execution: 69/69 regression checks passed (physical viewer,
photo editor, pair workflow and pointer gestures). Updated Chromium smoke
coverage, including the original 14-point Soundly numeric fixture and
manual-to-physical workflow replacement. Real browser and complete CI
qualification remain pending. Next: verify live direct editing, restored
physical view and Result on the user's experiment; investigate regressions
before declaring 8F.6 qualified.

## 8F.6k — Viewports-first UI and compatibility cleanup

The user confirmed a working real-browser Soundly fit after 8F.6j-fix:
Globe/vacuum, 14 Fit points, seven free parameters, RMS 314.76 → 6.82 px,
120 objective evaluations, status stalled (step tolerance, not gradient
convergence). Camera East -50.7536 m, North -9.425493 m, Height 42.83384 m,
Pan 0.6143418°, Nick -0.2929151°, Roll -0.1109909°, Focal field 1996.718 mm.
The original invalid_initial cause was not proven; no physics changed.

8F.6k implementation: reference/session, manual pair controls, view/pick
settings and pair/residual tables are disclosures. Physical Globe starts
with the minimal mouse-first UI; manual optical and Flat retain open
manual controls. Calibration shows the Fit/Validation table and Worker
failures open diagnostics automatically. Result keeps summary diagnostics
visible. Removed the unreachable inline best-optical-camera route; retained
compatibility routes and original physical-view storage format. Updated
browser smoke assertions for physical-first startup and disclosures.
Full CI and browser acceptance, including the documented 20-pair workflow,
remain pending; do not declare 8F.6 fully qualified until they pass.

## 8F.6j fix — Fit failure diagnostics and hidden Compare draws

The reported Soundly experiment (14 mixed legacy/material anchors, vacuum)
was evaluated with the current physical fit code: initial RMS 314.7555 px;
one accepted iteration reduced it to 68.3650 px. The reported invalid_initial
was not reproduced in that isolated run. Failed Worker evaluations now retain
per-row status/reason, stable row numbers and Locate actions rather than
silently discarding invalid results. No observations are automatically excluded.
Worker entry and dependencies use a fresh cache key; failed results log the
actual Worker revision. Compare skips callbacks for hidden workspaces and
zero-sized/unready canvases. Browser/CI verification remains pending.
The user subsequently verified the fit in-browser; see 8F.6k above.

## 8F.6j — Nonlinear calibration stages

Correspondences, Calibration and Result have independent visible controls
in one persisted workspace. Reference photo and exchange stay shared.
Correspondences retains physical Free View / legacy Flat and independent
drafts; Calibration owns free fields, Fit/Validation and explicit worker
start/stop; Result owns read-only initial/best optical previews and residuals,
with independently persisted optical pan/zoom. Stage changes cancel transient
gestures, not draft/history/view/fit state. Completion opens Result only from
Calibration. Stage and camera preference persist in the existing draft; older
best-camera drafts migrate to Result. Imports with fit open Result; otherwise
Correspondences. Browser smoke updated for navigation; full browser/CI
execution pending. Next: 8F.6k.

## 8F.6i — Context menus and independent Undo/Redo

Integrated physical Globe editor has shared right-click menus on photo/model:
draft link/remove endpoint/cancel; saved selection, model pivot, weight,
Fit/Validation role, delete; background history, cancel, photo fit/model
reset, model pivot reset, wireframe, owner inspection and automatic picking.
Right drag remains pan. Menu clamps to viewport, closes outside/Escape/blur,
supports arrow keys and pointer-hover focus on enabled items, with a single
highlighted action. Weight uses the native prompt; explicit edit mode
remains transitional. Both history stacks persist in the browser draft,
validate on restore, are limited to 50 entries each and clear on replacement;
new committed change clears Redo. Undo/Redo keeps unrelated draft, weight,
camera and pivot; an explicit edit whose target disappears is cancelled.
Ctrl+Z / Ctrl+Shift+Z and toolbar alternatives remain. Legacy Flat keeps
its existing picking controls. Full CI/browser pending.

## 8F.6h — Independent pivot and background reset

Physical Free View now separates row selection/synchronization from
the orbit centre. Explicit model marker clicks (including already
selected rows and draft markers), new accepted picks and successful model
drags repivot without moving the current projection. Photo/table selection,
link, cancel, delete and passive row refresh leave the pivot unchanged.
Double-click truly empty model background resets only the orbit centre to
the captured Scene-frame origin (or stable fallback centre), preserving
camera pose, zoom, pan, projection and draft. Both clicks must be classified
as empty; painted, ambiguous or near-snap geometry is not empty.
Signed eye depth is supported when rebasing to the original centre behind
the camera, including persistence in the existing physical v4 session.
Legacy optical behaviour and full Reset View remain unchanged.
Next: 8F.6i context menus and Undo/Redo. Browser/full CI pending.

## 8F.6g — Independent endpoint drag transactions

Integrated Globe saved and draft markers are draggable on either viewport.
Model drag uses automatic visible material picking, CSS hysteresis and Ctrl
surface bypass independently of manual pick mode. Transient ghost moves,
without changing the camera, rows or draft; invalid targets show a red
cross. Release validates the canonical anchor (duplicate protection),
updates only that endpoint, and repivots to the accepted model point
without shifting its projection. Invalid/outside release, Escape,
pointer cancellation, capture loss and window blur leave the original.
Saved changes preserve ID, opposite endpoint, weight, role, order and
unrelated draft/selection; exactly one Undo entry (no entry for no-op).
Draft moves never change saved rows. Fit invalidates only on real changes.
Legacy routes unchanged. Undo preserving unrelated draft and Redo remain
8F.6i; empty-background pivot reset next (8F.6h). Full CI/browser pending.

## 8F.6f — Implicit correspondence wizard

Integrated Globe Automatic now sends a selected physical material point
directly to the editor draft (no Confirm point). Click either viewport
first; a new valid background click replaces that endpoint. Double-click
either draft marker with both endpoints present commits using the existing
canonical duplicate/Undo/fit validation path. Failed commits leave the
draft; double-clicking saved markers or background does not link. Fast
Vertex no longer automatically saves on the integrated route. Photo-side
saved-marker drag during an Add draft preserves the unrelated draft.
Manual controls, explicit Edit and legacy Flat remain transitional.
Ctrl replaces Alt (Opera menu conflict); hover updates on key down/up
even when the cursor is stationary. Existing v4 sessions retained;
old locally staged points may still be confirmed with manual controls.
Next: 8F.6g independent drag transactions for model and photo endpoints.
Browser/full CI pending.

## 8F.6e — Automatic picking and hover preview

Integrated physical Free View defaults to Automatic: visible Vertex,
authored Edge, then Surface. Existing depth/painter validation and work
bounds remain authoritative. CSS-normalized frame (including edge
interpolation) makes snapping independent of backing raster density.
8 CSS px acquisition, 11 px release hysteresis retains the same visible
feature; Alt bypasses snapping for surface-only picking. A translucent
hover marker previews the candidate, and click revalidates with the
same hysteresis state. Geometry and canonical anchor contracts unchanged.
Automatic local staging and session restore supported; old Navigate-only
physical sessions switch to Automatic when no staged point exists.
Manual modes and Confirm point remain transitional until 8F.6f; no
automatic linking yet. Legacy optical magnifier unchanged.
Next: 8F.6f implicit pairing wizard and double-click commit.
Browser/full CI pending.

## 8F.6d — Unified pointer gestures

User validated Scene-derived initial framing (8F.6c.1). Photograph and
integrated physical viewer now share CalibrationPointerGestures:
pointer-down targets, 5 CSS px threshold, click/double-click recognition
(400 ms / 5 CSS px; second click does not repeat the first action),
right-click vs right-drag, pointer capture and cancellation. Right drag
pans either view. A physical model marker drag is reserved for endpoint
movement, not orbit. Photo draft markers can already be moved on valid
release (transient ghost, no saved-row edit); saved-marker drag retains
existing commit semantics until 8F.6g.
Double-click and context actions are classified but not yet wired to
link/reset/menu; legacy Flat canvas and magnifier rectangle remain
unchanged. Next: 8F.6e automatic picking/snapping and hover.
Browser/full CI verification pending.

## 8F.6c.1 — Initial Free View framing corrected

Manual feedback: fitting all authored geometry made a long bridge nearly
unusable. Restore the original Scene-camera framing: the full optical
region's nearest visible-owner seed, physical pivot, camera axes and focal
scale are reused directly in Free View, without opening Initial Camera.
All physical primitives remain available. That initial pivot is the
default centre for the future empty-background double-click gesture.
If no valid optical owner seed exists, use the independent full-scene
frame as fallback. No selection or correspondence-based framing heuristic.
The physical viewport is opened only after the initial seed pass finishes.
Physical view session v4 validates the scene-derived base frame; v3
overview snapshots are intentionally invalidated once. Saved pairs and
drafts are unchanged. Best Camera/legacy routes unchanged.
Next: 8F.6d unified gestures. Browser/full CI pending.

## 8F.6c — Independent physical Free View

The agreed mouse-first implicit wizard roadmap is recorded in
docs/landmark-editor.md and supersedes the previous 8F.6c–g plan.
Globe correspondence editing now opens directly in physical Free View
with both authored banks, deterministic world east/up/south axes and
a bounding-box centre; no optical owner seed, visible region or
initial camera is required. The existing physical painter, picker,
anchor identities and solver are reused. Reset stays physical.
Physical session v3 validates its stable frame; old optical editor
view snapshots are intentionally discarded on source mismatch (saved
observations and draft endpoints retain the existing storage format).
Best Camera still temporarily parks the physical editor pending 8F.6j;
legacy Flat and optical magnifier remain available. Optical preview
is still calculated for legacy/fit, but failure no longer forces
the physical editor out. Transitional buttons and pick modes unchanged.
Next 8F.6d: unified gesture and marker hit-test contract.
Browser/full CI verification pending.

## 8F.6b — Shared correspondence toolbar

One workspace-level toolbar above both viewports replaces the integrated
viewer buttons and duplicated legacy save/cancel controls. Explicit Add
starts a draft, defaults the integrated picker to Vertex when necessary,
and requires Create pair rather than automatic Fast Vertex pairing.
Existing implicit point-first and Flat fallback remain compatible.
Toolbar mode, point readiness, action availability and labels are derived
from the workflow; weight input is shared. Empty explicit Add persists
using an optional backward-compatible draft field. Enter commits when
available from workspace focus; viewer confirmation remains unchanged.
Next: 8F.6c unified picking with one confirmation. Browser/full CI pending.

## 8F.6a — Calibration UX redesign: correspondence workflow

Baseline: 770df7dfd3a2d6d8d411ff4c269f573337e5a18f (user-validated Undo).
A pair workflow owns committed observations, selection, Browse/Add/Edit
draft and Undo history. Existing point-first and explicit edit controls
adapt to it; geometry, navigation, picking, fit and storage formats are
unchanged. Weight input remains a UI adapter until shared controls.
Selecting another marker during edit no longer changes the edit target.
Legacy Flat, Fast Vertex and explicit Confirm behavior are retained.
Add transition is available for the next toolbar.

Agreed roadmap: 8F.6b shared toolbar; 8F.6c unified Vertex/Edge/Surface
selection with one pair confirmation; 8F.6d independent photo/model move;
8F.6e navigation and double-click pivot; 8F.6f Inspector and UI cleanup;
8F.6g persistence and UX validation. Functional Parity and legacy Globe
removal are deferred. Baseline tag must be created locally (connector
does not expose tag creation).

## 8F.5d.1 — Undo consistency

User confirmed model-side editing works but reported Undo failure. Added inline Undo, moved workspace Ctrl+Z before legacy mode guards, made history snapshots independent, cleared current and parked local overlays and material marker cache on undo. Existing correspondence cache is already rebuilt on setCorrespondences; no change to geometry rendering. Browser reproduction and full CI remain pending.

## 8F.5d — Integrated correspondence editing

The integrated pair action row includes Edit pair. Existing observations are
copied into an explicit editable draft, including their weight and photo
pixel. Confirming a new Vertex/Edge/Surface or Fast Vertex replaces only
the draft material point; Update pair commits through the existing Undo and
fit invalidation path, preserving observation ID, role and row order.
Changing a legacy vertex's identity upgrades it to a material anchor.
Photo dragging outside explicit edit retains the existing immediate Undoable
edit; inside an edit it updates only that draft. Cancel edit leaves the
committed observation unchanged. Draft restoration uses the existing storage.
8F.5c was manually validated by the user. Next: Functional Parity before
legacy Globe cleanup. Browser and full CI verification remain pending.

## 8F.5c — Explicit material pairing (before parity)

Integrated Vertex, Edge and Surface confirmation now supplies a validated material landmark via CameraMaterialAnchorResolver. Create pair explicitly commits a selected photo and material point; Fast Vertex retains automatic pairing. Pending material anchors survive draft restoration, and duplicate canonical anchors (including legacy vertices) are rejected. Pair actions share a compact row. Functional parity and full editing remain subsequent work. Browser and full CI validation pending.

## 8F.5b.4a.4 — Draft lifecycle

The editor's pending model vertex is the sole source of truth for a
Fast Vertex draft; its cyan marker is derived in the viewer independently
of staged/confirmed local material points. Local staging survives Navigate,
Owner Inspection and other pick mode switches; only its originating mode
can confirm it. A new successful pick replaces the single staged point;
empty clicks retain it. Reset/navigation/Best Camera parking do not cancel
the pair. Cancel draft pair (or Escape outside local staging) cancels the
editor draft without resetting the camera or deleting observations.
Clear point clears only local inspection. Deleting an unrelated pair
preserves the draft; failed saves retain the draft for retry or cancel.
Old optional Fast Vertex confirmed markers are not restored as local points.
Persisted pending vertex and pixel are checked against the current scene
and photo. Legacy Flat pairing remains supported. Remaining: .5 Functional
Parity, .4b cleanup, then 8F.5c/d/e.

## 8F.5b.4a.3 — Integrated Owner Inspection

Owner Inspection in the integrated Globe Pick menu selects the top painted
owner (object or individual span) using the existing optical/physical
painter paths, including line coverage and horizon masks. It neither stages
a material point nor changes the orbit or observations. It reuses the
editor's existing owner packages, labels and selection, exposes the selected
owner's primitive list and approximate range, and shows a dashed contextual
outline (which may include occluded portions). Owner identity and mode
are persisted with the existing draft/session. Best Camera remains read-only;
legacy tools and Flat are retained. Remaining: .4 Draft Lifecycle,
.5 Functional Parity, .4b cleanup, then 8F.5c/d/e.

## 8F.5b.4a.2 — Integrated session persistence

Integrated viewport snapshots are stored in the browser beside the existing
IndexedDB calibration draft, bound to its session ID, photo ID and optical
source. Initial/Free View and Best Camera have separate snapshots. Free View
rebuilds the original physical frame before restoring orientation, projection,
zoom, pan, wireframe, rebased orbit pivot and validated local picks/candidates.
Legacy magnifier session v1 remains unchanged. Undo history (last 50 states)
is included in the atomic draft and validated on restore. Photo view, active
pair and incomplete pair were already stored there. Orbit sensitivity is
already a global UI preference. No new panel persistence or independent
Initial/Free optical-region history is introduced; Free View retains its
entry region and Reset View deliberately returns to the full optical source.
Invalid optional viewport/history state is discarded without deleting pairs.
Regression coverage added; browser and CI validation pending.

Remaining order: .3 Owner Inspection, .4 Draft Lifecycle, .5 Functional
Parity, then 8F.5b.4b legacy cleanup and 8F.5c/d/e.

## Fast Vertex interaction follow-up (8F.5b.4a.1)

Integrated model selection and Delete pair / Delete now use the editor's
existing delete and Undo operations; Ctrl+Z is forwarded when focus is in
the viewport, except editable controls. Numbered markers take selection
priority even in picking modes. Local material markers and the pending
photo pixel use larger contrasting rings in CSS pixels; the orbit pivot
uses a distinct yellow broken crosshair. The Free View title follows the
active representation. Fast Vertex remains distinct from local inspection;
a model-first selection remains visible until the pair is saved or reset.
The user reported a failed pairing in local Vertex mode; actual Fast Vertex
browser behavior still requires verification. Added shortcut/button checks
and adjusted the Free View fixture's camera framing. CI pending.

## 8F.5b.4a.1 — Integrated Fast Vertex pairing

8F.5b.3c navigation was manually confirmed by the user. The integrated
Globe viewer now offers Fast Vertex separately from local Vertex/Edge/Surface
inspection. A unique visible vertex enters the existing legacy vertex identity
and chooseModel/savePair path; ambiguous candidates require Use vertex.
Photo-first and model-first pairing use the same observations, Undo and
draft storage. Best Camera remains read-only on the model side. The existing
floating viewer and Flat workflow remain unchanged. Added Free View pairing
callback regression to the DOM fixture; CI and manual validation pending.

Remaining migration: 8F.5b.4a.2 Owner Inspection; .3 Draft Lifecycle;
.4 Session Persistence (including pivot); .5 Functional Parity; then .4b
legacy Globe cleanup and 8F.5c/d/e.

## 8F.5b.3c — Selected physical point orbit pivot

Integrated Globe Free View uses the staged/confirmed material point or selected
correspondence on entry, otherwise the existing visible-owner seed. Selecting
another material point or correspondence in Free View rebases the orbit without
moving the current camera, changing its zoom, or changing calibration data.
The crosshair marks the pivot; the last valid pivot remains until a new point
is selected or the optical view is reset. Invalid/behind-camera pivots cannot
replace a valid pivot. Canvas Direct and the effective-radius optics are
unchanged. Initial/Best parking retains the orbit in memory. The old floating
crop session contract remains unchanged; durable integrated session restoration
is still 8F.5b.4a. Added math and DOM lifecycle regressions; full CI and manual
Soundly validation are required before 8F.5b.4a.

## 8F.5b.3b — Integrated Globe model viewer

The Globe route now defaults to the integrated Model Viewer beside the
photograph (Initial Camera, read-only Best Camera, physical Free View).
Legacy model tools and manual controls remain usable during migration.
Initial viewport state is retained in memory while the fitted source is
displayed; source updates preserve Best zoom. The current Free View pivot
uses a visible owner seed near the viewport center, not yet a selected
anchor pivot. Inline material points are still local drafts, not committed
observations. Full inline draft migration, fast vertex pairing and owner
inspection remain 8F.5b.4a. Previous 8F.5b.3a full CI succeeded.
34 focused viewer tests (including DOM mock) passed; new Chromium
coverage added, full CI pending.

## 8F.5b.3a — Host-neutral viewport and optical navigation

Added an opt-in openScene source contract to ModernLandmarkViewer, including
inline host lifecycle, full-frame source region, cursor-anchored bounded
optical zoom, pan, rectangle API and full Reset. Scene wheel/drag remains
optical in this new path; Free View requires explicit entry and a host
physical-pivot callback. Optical capture/picking uses a pivot-independent
authored mesh, and local material hits are rebound across physical frames
with world parity validation. Read-only source disables authoring/free
entry but not marker selection or navigation. Existing floating openCrop
and isolated object behavior remain unchanged. No current UI mounting
change; integrated session restore and its migration remain 8F.5b.4a.
Previous audit CI failed only the bounded active-doc count; merged audit
into existing landmark-editor-audit.md instead of relaxing the test.
All 34 focused viewer tests passed in a headless JS assertion harness,
including viewport math, material frame parity and inline host lifecycle
with a DOM mock (not Chromium). Full CI pending.
Next: 8F.5b.3b inline Globe Initial/Best source routing.

## 8F.5b.2 — Integrated model viewer architecture audit

User confirmed 8F.5b.1 selection UX works, then proposed eliminating the
floating Magnifier as a separate normal workflow. Audit baseline 53386a6,
CI 44646834128 success. See docs/landmark-editor-audit.md#integrated-calibration-model-viewer--architecture-audit for
source dependencies, risks, target contract and staged plan.
Do not start material authoring until the integrated viewport is ready:
8F.5b.3a host-neutral optical navigation; .3b inline Globe Initial/Best
and Free View; .4a legacy vertex/inspection and draft migration; .4b
remove redundant Globe paths after parity; then resume 8F.5c/d/e.
Keep calibration state, fit/worker, resolver, portable schemas and legacy
Flat compatibility unchanged. Audit only; no runtime change or new
browser benchmark. Next: 8F.5b.3a.

## 8F.5b.1 — Magnifier selection UX

Navigate now shows existing correspondence markers only; local candidate
controls, staged/confirmed marks and weight editing are hidden (local
draft retained when switching modes). Hover uses the same CSS-pixel hit
test as selection, changes cursor to pointer and highlights marker with
contrast ring and tooltip. Empty geometry uses grab and drag grabbing.
Dedicated fixed-height selected correspondence status shows ID label, kind
and visibility, even when hidden. No mutation of committed pairs or fit.
8F.5b full CI 44645416002 passed. Next: 8F.5c Use in calibration.
Updated browser regression to require Navigate hides local controls and
retain explicit picking-mode Clear point. JS syntax checked; browser
verification pending.

## 8F.5b — Cross-view correspondence selection

The editor owns activePair; both Magnifier views receive it with read-only
committed descriptors and render a selected ring, including selected status
when hidden. In Navigate mode a short left click on a displayed marker
selects the same ID in the editor, photograph, model and pair/residual
tables. Overlapping markers cycle deterministically on repeated clicks;
hidden markers are excluded. Pick modes retain their local staging behavior.
Selection preserves pending edits, committed rows, fit and Undo. Pair table
row clicks select without starting an edit. No new authoring controls.
Next: 8F.5c explicit Use in calibration. Browser CI pending.

## 8F.5a.1 — Magnifier raster stability

User reported oscillation at particular wheel zoom increments after 8F.5a.
Inspection found a possible ResizeObserver feedback loop: dynamic
visibility text could change flex canvas height, triggering rendering
which changes visibility again. Reserve fixed scrollable two-line slots
for view, correspondence, pick and coordinate status, remove intrinsic
canvas size from flex layout, skip unchanged status writes and ignore
ResizeObserver notifications if the required backing raster already matches.
No changes to projection, picking or correspondence geometry. Added
Chromium regression for short/long/empty status text and wheel increments.
JS syntax checked; actual browser reproduction and CI pending.
Next: 8F.5b after stability verification.

## 8F.5a — Existing correspondence markers in Magnifier

8F.4d.2 CI: architecture and Node passed, Chromium failed on the recurring
Scene workspace timeout and a status-text race in the new draft reload test
(actual status already Draft saved). The reload assertion now checks restored
row count, fit availability and exact data instead of transient status.

Globe Magnifier receives read-only descriptors from the editor's canonical
rows. Legacy vertices are resolved/upgraded transiently, never rewritten.
Bind bank/primitive/owner and original material indices to local mesh.
Scene markers use actual optical painter coverage and horizon mask; Free
View uses its existing depth/painter visibility and wireframe semantics.
Use the same row numbers, Validation suffix and palette as the photo/table.
List hidden/out-of-crop/unresolved status; no committed marker picking or
editing yet. Refresh on row changes and rebuild on view/geometry change.
No extra correspondence persistence. Flat authoring unchanged.
All 30 viewer headless tests passed, including the new committed marker
identity and optical mask regression. Full Node/Chromium CI pending.
Next: 8F.5b synchronized selection.

## 8F.4d.2 — Material observation persistence and editor read paths

Portable v3 supports mixed canonical material and legacy vertex observations;
vertex-only export remains v2 and v1/v2 import is preserved. Draft payload
v2 accepts canonical observations, still reads v1. Normalize material rows
and validate actual Globe topology before replacing an imported session.
Reject stale/duplicate descriptors, kind mismatches and non-Globe material
data. Material fit candidates carry a canonical binding to rows, roles,
weights, captured camera/layout, atmosphere, raster and free fields;
reject stale stored results even when observation IDs are unchanged.
Existing legacy result validation is retained. Main Model committed
markers use the material projector (terrain eligibility, not certified
painter visibility) separately from fast vertex candidates. Photo-side
edits, role, weight, deletion and residuals work for imported material
rows; material model-side authoring/editing is deliberately deferred to
8F.5. Draft restores committed observations rather than inventing vertices.
Four new focused persistence tests and sixteen existing editor tests
passed in a headless JS assertion harness with real geometry/resolver
modules. Added a browser v3 import, worker fit and draft reload scenario;
not executed locally. Full Node/browser CI pending. Next: 8F.5a existing correspondence markers in Magnifier.

## 8F.4d.1 — Material anchors in the physical calibration objective

8F.4c CI 44640312556: Node regressions and architecture/Legacy passed;
Chromium failed only on the previously observed Scene workspace restore
timeout (all photo-calibration smoke tests passed). Keep this failure
visible; no unrelated navigation changes here.

Split 8F.4d into 8F.4d.1 (fit/diagnose/worker) and 8F.4d.2
(draft/portable/editor integration). Mixed metric, legacy vertex and
canonical Vertex/Edge/Surface observations now enter the same weighted
point objective, with structural validation, stable result IDs and
physical horizontal range scaling. Existing UI Fit/Validation filtering
and residual projector dispatch remain unchanged. The headless API still
uses every supplied observation; callers select the Fit subset.
Per-fit opaque material context reuses physical resolver and bank
signatures across evaluations; one bounded target binding per bank
reused only for matching method/radius/height. No global cache, no
optimizer changes. Invalid material anchors invalidate the objective
rather than being silently removed (invalid ranges cannot set scaling).
Legacy paths stay unchanged. Worker imports/cache keys updated. Added
mixed synthetic fit, diagnostics, scale, cache parity, invalid topology
and held-out residual tests. All five passed in a headless JS harness
using the actual solver, camera, geometry, projection and ray-shooting
modules. Seven unused scene/Flat dependencies were guarded by throwing
stubs (connector call limit); native Node/Chromium CI pending.
No new portable/draft formats or authoring UI yet. Next: 8F.4d.2.

## 8F.4c — Globe optical material anchor projection

8F.4b CI run 44639073304 passed. CameraLandmarkProjection accepts canonical
Vertex, Edge and Surface descriptors in the existing Globe projection
paths. Bind each method-specific bank once against physical ordered
owner/primitive topology; retain a private coordinate snapshot and
interpolate corresponding authored vertices with the same weights.
Accurate uses physical Height-subtracted geometry and existing shooting;
Canvas Direct uses virtual effective-radius geometry at Height=0.
Explicit invalid_anchor status for invalid signatures/topology or
degenerate target primitives; terrain and raster statuses unchanged.
No mutual mesh occlusion claim. Legacy metric/vertex and Flat behavior
unchanged. Browser/worker dependencies prepared; fit/editor and portable
schemas not switched. Added focused painter/inverse, Accurate metric,
bank validation and projection status regressions. All four passed in a
headless JS harness, including 54 material forward/inverse painter round
trips. Actual point projection, ray shooting and Canvas Direct modules
were executed; six unrelated full-scene dependencies were guarded with
throwing stubs and never accessed (connector call limit). Native Node and
Chromium full CI pending.
Next: 8F.4d.

## 8F.4b — Physical material anchor resolution and legacy parity

8F.4a CI run 44636614904 passed. Added CameraMaterialAnchorResolver:
lazy immutable Globe bank snapshot at Height=0, stable owner/primitive
lookup, explicit legacy vertex upgrade preserving ID, bank SHA-256
signature and topology-checked interpolation in physical ENU metres.
The signature binds ordered bank layout plus owner/primitive/vertex
structure and micrometre-quantized coordinates of a fixed neutral
authoring reference (zero curvature, fixed reference radius 6371000 m);
this is an encoding convention only, not a calibration hypothesis.
Physical and neutral ordered topology must agree; reject truncated or
ambiguous banks, stale signature, out-of-range indices, nonauthored
edges/triangles. Shared indexed topology adapter moved from viewer to
CurvatureEarClip; existing 2D triangulation behavior unchanged. No
editor, fit, projection or portable schema integration yet.
Seven focused resolver tests passed in a headless JS assertion harness,
including four standard SHA-256 vectors. Full Node/browser CI pending.
Next: 8F.4c Globe optical projection.

## 8F.4a — Canonical material anchor representation

Added the dependency-free CameraMaterialAnchor module and focused structural
regressions. Canonical Vertex/Edge/Surface indices and weights, validated
object/span owner context, versioned bank signature token, independent
observation IDs, legacy vertex adapter and viewer-pick conversion. Exact
descriptor keys exclude observation IDs and transient view state. Current
editor, worker, projector, fit and portable/draft schemas unchanged.
Eight focused tests passed with repository JS evaluated headlessly using a
strict assertion harness; 10,000 deterministic randomized normalization
round trips passed. Static isolation fixture updated for the new pure
module and test caller. Full Node/browser CI pending. Signature generation,
topology validation and actual physical coordinate resolution are not
implemented yet. See docs/landmark-editor.md for the contract.
Next: 8F.4b — physical resolution and legacy vertex parity.

## 8F.4.0 — Material anchor architecture and calibration integration plan

User approved a unified correspondence editor and reported 8F.3d.2 working.
CI run 44634760850 for d10fefb8 completed successfully. The canonical
implementation plan is [docs/landmark-editor.md](docs/landmark-editor.md).
One correspondence collection for the table, photo, main model and both
magnifier views; camera-independent Vertex/Edge/Surface anchors; explicit
Use in calibration in either click order; synchronized selection; transactional
model-anchor editing with Apply/Cancel/Undo preserving photo pixel, ID,
weight and role. Globe-only real-photo authoring; retain old vertex workflow
and Flat forward comparison. Complete physical projection, solver integration
and persistence before enabling new correspondence authoring.

Commit sequence: 8F.4a canonical representation and validation; 8F.4b
physical resolution and legacy parity; 8F.4c Globe projection; 8F.4d
fit/residuals/worker/persistence; 8F.5a existing markers; 8F.5b synchronized
selection; 8F.5c new pairs; 8F.5d transactional editing; 8F.5e browser
qualification. Retain 8F.6 compatibility audit and 8F.7 real-photo research.
Documentation only; no runtime or schema changes. Next: 8F.4a.

## 8F.3d.2 — Globe optical picking UI and visibility

Real-photo landmark authoring is Globe-only by user decision. Reuse
captured Canvas Direct paths and perspective-correct physical material
weights, respecting the actual painter order, opaque horizon mask and
stroke coverage. Translucent later coverage is unresolved; guides are
annotations, not occluders. Scene View and Free View share local points,
adjustment, confirmation and session persistence. Scene markers are
reprojected into the source crop, clipped to its bounds. Flat optical UI
and nonlinear refinement are not pursued; existing Flat diagnostic core,
forward comparison, fit and portable schemas are unchanged. Geometry
still requires a visible owner seed. Architecture fixture updated for
the reviewed CameraPhysicalPose test dependency. New focused optical
coverage regression added; full Node/browser CI pending. Next: manual
Globe verification and 8F.4 stable anchors.

## 8F.3d.1 — Optical picking audit and inverse core

Canvas Direct is not Free View. Globe authors at an effective radius;
Flat authors at Height=0 with a physical planar basis and maps each
vertex through the signed nonlinear embedding before drawing straight
segments and polygon fills. The renderer uses whole-package horizon
classification, a tangent-disk mask and painter order, not a depth buffer.
Capture optional original camera-space vertices, exact clipped paths,
physical identity, actual painter order and pixel transform from the
production paint pass, including its mask. No change to normal paint.
Inverse per authored primitive uses optical camera ray and original
physical topology; carries perspective-correct material weights to the
physical scene. Globe uses corresponding effective vertices; Flat checks
the interpolated physical point through the continuous signed embedding.
Reject round-trip disagreement over 0.1 source pixel instead of inventing
a match. Distinct surface hits remain explicit. This is only a primitive
inverse, not a visibility certificate. UI and painter/mask/stroke
resolution, nonlinear refinement and cross-scene integration follow
in 8F.3d.2. 28 strict viewer tests passed; renderer capture parity test
added (CI pending). Previous persistence Node/architecture passed;
Chromium had the existing Scene tab restore timeout, while user verified
Magnifier restoration. No portable schema or fit changes.

## 8F.3c.1 — Magnifier session persistence

Store versioned local magnifier session synchronously on UI interactions
and pagehide, linked to the captured calibration draft ID in IndexedDB
and exact crop source parameters. Restore after draft geometry and visible
workspace are ready. Restore region, mode, camera, raster-relative pan,
wireframe, pick mode, draft/confirmed point, candidate list and unapplied
numeric inputs. Window rect and sensitivity retain separate preferences.
Rebuild geometry; validate stored indices, weights and coordinates.
Close, photo replacement, new capture and import invalidate saved session.
No portable experiment changes. 26 strict headless tests passed; reload
browser regression added, CI pending. Previous metric snap CI Node and
architecture passed; unrelated workspace scene-mode reload smoke test
timed out. Next: 8F.3d.

## 8F.3c follow-up — Metric vertex snap

Snap vertex minimizes actual 3D distance: edge endpoints for an edge,
all original authored polygon vertices for a surface, lowest original
index for exact ties. Barycentric weights are not a distance metric.
25 strict headless viewer tests passed; previous 8F.3c full CI passed.
No calibration or optical inverse change. Next: 8F.3d.

## 8F.3c — Local point adjustment and confirmation

Free View draft and confirmed local point remain fixed through camera
navigation, pick mode changes and optical Reset View / re-entry. New
rectangle or viewer close clears both. Show local and authored-world XYZ
(in metres, captured observer-height convention), original indices and
weights. Edit edge t or surface w0,w1 (w2=1-w0-w1); reject invalid
weights transactionally. Snap to a selected simplex vertex, authored edge
midpoint or nearest original perimeter (not triangulation diagonals).
Confirm locally, cancel draft without changing confirmed point, or clear
both. Marker hidden when occluded, outside view or visibility unresolved;
wireframe permits inspection. Optical view remains exact crop with no
point overlay yet. No correspondence, optimizer or portable schema change.
23 strict headless tests passed; browser coverage extended, CI pending.
Next: 8F.3d optical inverse picking.

## 8F.3b — Free View point picking UI

Free View now offers Navigate / Vertex / Edge / Surface, hover preview,
click-to-stage, explicit candidate list and Clear point. Three CSS pixels
distinguish orbit drag from click. Scene View remains navigation-only.
Topology cached per region; actual clipped painter paths/order shared with
screen-bounds picking and conservative fill-visibility reconciliation.
Geometric depth conflicts and invalid later fills block picks; coplanar
candidates remain explicit. Wireframe permits hidden vertex/edge inspection,
not surface picking. Pointer hover coalesced by animation frame; bounded
overlap work rejects oversized queries. Staged points are local only,
not correspondences; marker/precise adjustment remains 8F.3c. No optical
inverse or experiment schema changes. Twenty-one strict headless tests
passed; browser regression added (CI pending). Previous 8F.3a CI passed.
Manual cross-scene qualification remains outstanding. Next: 8F.3c.

## 8F.3a — Mathematical local picking core

User approved the slower orbit in 8F.2e. Split 8F.3 into a–d: mathematical
core, Free View picking UI, marker/snaps/adjustment, optical Scene View
inverse. Added pure region camera unprojection, indexed planar EarClip
adapter, ray/triangle barycentric intersections, original-edge candidates
with perspective-correct parameters (including near clipping), vertex and
edge snapping, front-depth filtering and coplanar candidate enumeration.
Original owner/primitive/vertex identities preserved; no new serialized
descriptor yet. Invalid/nonplanar/wire-only fills cannot generate surface
hits. Rejected fills are reported, not certified as transparent; geometric
visibility is not painter parity. No UI changes, no optical inverse, camera
fit or JSON change. Nineteen headless viewer tests passed with strict
comparisons, including mixed bridge/non-bridge physical geometry on Globe
and Flat. Updated reviewed dependency fixture for existing EarClip import.
Previous 8F.2e Node and architecture CI passed; browser test failed after
off-centre photo zoom left its framing changed. Restore fit before existing
centre-marker drag assertion (not a production fix); CI pending. Cross-scene
manual verification remains outstanding. Next: 8F.3b.

## 8F.2e — Orbit sensitivity refinement

User verification of Free View on Soundly found mouse orbit too fast.
Use CSS-pixel deltas independently of raster resolution and device pixel
ratio. Default sensitivity 25% of the former 0.008 rad/pixel coefficient
(0.002 rad/CSS pixel); range 5–100%, step 5%, explicit reset to default.
Persist the preference separately in localStorage; camera reset does not
change it. Pan remains in backing-store coordinates and zoom unchanged.
Twelve headless viewer tests passed; browser angle/persistence assertions
added. Previous CI Node and architecture jobs passed; Chromium failed
on workspace restore timeout and a photo marker drag assertion, neither
resolved by the sensitivity change. Next: user verification before 8F.3.

## 8F.2d — Free View and exact optical Reset View

The rectangular magnifier now has Free View, direct drag-to-orbit, wheel
zoom, standard views, pan and Reset View. The optical crop is retained
unchanged; reset replays it at the current window dimensions. Select the
nearest visible owner pixel to the rectangle centre from the existing owner
raster, then estimate a physical pivot on that owner (planar intersection
or nearest perspective-correct edge, nearest depth for ties). Empty or
unavailable ownership explicitly disables orbit, without losing Scene View.
Free View uses the original rolled camera basis, physical geometry and
off-axis eye rotated about the pivot; the initial screen alignment is
geometric, not optical, and anchored at the visible raster seed. No special
station or scene rules: all authored primitives across both banks are
retained (budget 100000 primitives / 1000000 vertices, reject above it),
with original indices and owners. Depth and viewport clip fill polygons
and original stroke edges separately; painter order remains approximate.
Free View does not simulate atmosphere or terrain masking. No anchor
creation or fit/experiment mutation. Headless geometry/viewer tests passed;
browser orbit/reset regression added, CI pending. User verification on
Soundly and another scene type required before 8F.3.

## 8F.2c — Rectangular Scene Magnifier

Photo Calibration Pick: Magnifier accepts a drag rectangle including empty
space or multiple owners. The selection is normalized/clipped in original
projection raster coordinates through the current main canvas pan/zoom.
The modeless window replays fresh Canvas Direct vector paths with a uniform
crop transform and letterboxing. Source camera, projection dimensions,
Earth model, atmosphere, painter order, horizon mask, guide label placement
and stroke widths in source coordinates are unchanged. The renderer uses
the original logical viewport with a native Canvas transform and crop clip;
no bitmap stretching or large intermediate image. The captured render inputs
are independent of the experiment and recomputed after window resize.
No owner selection or geometry isolation required. Existing object/vertex
modes retained. Free View controls hidden for a crop until 8F.2d; no new
point picking yet. Canvas Direct remains an approximate optical painter,
not a depth-certified renderer. Antialiasing can differ at higher scale.
Headless crop/rectangle math checks passed; vector replay and browser
regressions added (full CI pending). Next: 8F.2d independent orbit/reset.

## 8F.2b — Modeless movable inspector

The current object/span inspector now opens as a nonmodal fixed-position
window; main photo/model controls remain available. Drag the title bar,
resize using the corner grip, or use arrow keys on focused title/grip.
Position and dimensions are clamped to viewport and stored in a dedicated
localStorage UI preference, not the experiment JSON. Canvas redraws at
actual resized dimensions with bounded device-pixel scaling; camera state
is separate and pan scales with the backing store. Only inspector-focused
Escape closes it; workspace shortcuts remain active elsewhere. Changing
selected owner updates the open window; clearing selection, leaving the
workspace, switching to best-camera preview or replacing the captured
scene closes it. Pointer capture is released on cancellation/close.
Existing object/span content is deliberately retained until 8F.2c.
Seven headless geometry/viewer tests passed; browser move/resize, photo
interaction and remembered-position regressions added; full CI pending.
Previous 8F.2a CI 44614959167 passed. Next: 8F.2c rectangle and optical
crop rerendering. No changes to anchors, fit algorithm or portable JSON.

## 8F.2 — Revised direction: 3D Scene Magnifier (planned)

User verification after 8F.2a confirmed the need for recognizable scene
context: even a correctly identified 300 m road span is difficult to
recognize in isolation. The agreed primary workflow is now a generic
rectangular region selection on the main model preview, opened in a movable
modeless magnifier with a fresh higher-scale rendering in the SAME optical
camera/view. No mandatory object selection or Soundly-specific neighboring
stations. Free View permits independent rotation, pan and zoom of actual
local scene geometry, including surrounding owners; Reset View restores
the saved optical rectangle/framing. Keep existing object/span/primitive
identities as internal anchor/picking infrastructure and preserve the legacy
vertex path. No changes to physical camera, fit or observations by navigation.

Next stages: 8F.2b modeless movable/resizable window; 8F.2c rectangle selection
and optical re-rendering; 8F.2d independent local orbit and exact initial
view reset. Then verify on Soundly and another scene type before 8F.3.
Detailed contracts and tests: [landmark editor plan](docs/landmark-editor.md),
Issue #7. This supersedes earlier single-owner framing and isolation plans.
Documentation only; no runtime changes or new CI results in this commit.

## 8F.2a — Exact object/span selection

Object / span mode now has a dedicated owner identity raster, using the same
Canvas Direct painter order and horizon mask. The separate legacy package
raster, vertex IDs and correspondence workflow remain unchanged. Each support
and each individual incoming road/shore span has its own transient color key
and snapshot owner descriptor. The selected owner alone opens in the viewer;
adjacent context is optional (both endpoint supports for a span, incoming
spans for an object), drawn faded. A selected span defaults to Top so its
surface is visible; scene-relative framing belongs to 8F.2c. Manual owner
selection remains available when the raster is unavailable or ambiguous.
No physical camera, anchor, JSON or optimizer changes. Five geometry/viewer
headless tests passed; renderer and browser coverage added, full CI pending.
8F.2 Chromium CI passed; its remaining architecture/Node failure was the
reviewed Modern helper inventory, updated here. Next: 8F.2b modeless window, then the revised magnifier stages above.

## Historical 8F.2 follow-up — superseded by Scene Magnifier

User verification of 8F.2 in Soundly revealed that clicking a road span
opens its support package with spans hidden; the modal dialog obscures
the photo/scene and the default front view requires manual rotation.
Before 8F.3 implement three bounded commits: 8F.2a exact object/span owner
selection, 8F.2b modeless movable/resizable inspector with remembered UI
geometry and live selection, 8F.2c scene-relative initial camera orientation
(including roll), automatic framing and Scene View reset. Keep geometry,
physical camera, fit and anchors unchanged by inspection. See the revised
landmark editor plan and #7. User verification on Soundly is required
before proceeding to local point picking.

## 8F.2 — Isolated authored-object viewer

Object mode now opens Inspect object (3D), a modal local Canvas viewer.
It uses the selected package's captured authored vertices and placement
basis; no invented solid thickness. Front/Back/Left/Right/Top/Bottom, orbit,
pan, zoom, orthographic/perspective, wireframe, reset and optional incoming
spans are independent of the experiment camera. Local dimensions in metres
and front/back/edge-on status are displayed. Default is face-on orthographic,
spans off. Viewer is inspection-only; no changes to observations, fit, JSON,
optics or picking. Group-depth painter is approximate for overlapping
surfaces, not a certified depth test. Added three headless checks (passed)
and browser navigation/pose isolation coverage (CI pending).
8F.1 CI 44611576966 failed on stale static dependency inventory and docs
count (updated here, reviewed topic exceptions), and a Scene workspace
restore timeout (not diagnosed or suppressed). Object selection smoke passed.
Next: 8F.2a–c refinements, then 8F.3 after verification.

## 8F.1 — Explicit object selection and snapshot owner metadata

Photo Calibration now offers Pick: Vertex / Object. Object mode selects a
painted package without a nearby vertex, holds its highlight after pointer
leave, and provides an independent manual selector and clear action. The
selected descriptor reports bank/type/station/column, representative
horizontal range (first authored object vertex, physical initial tangent
frame), incoming spans and identity-pass visibility. No photo is required;
object selection does not mutate pending pixels, correspondences, camera or
fit. Best-camera view remains read-only. Selection is transient per captured
scene; Vertex mode and its existing pair workflow remain the default.
Geometry metadata identifies full-sequence object owners, local primitive
ordinals and span endpoint/side identities; painter indices/order, coordinates
and draw modes remain unchanged. Truncated sequences have no new owner.
Topology signature and persistent anchors remain 8F.4/8F.6 work.
Headless JavaScript checks: two new unit cases and exact pre/post geometry
comparison (all ten types, Globe/Flat, excluding only new metadata).
Node/browser CI pending; additional Chromium selection and fit preservation
smoke coverage added. Next: 8F.2 isolated viewer.

## 8F.0 — Landmark editor architecture audit completed

See [8F.0 audit](docs/landmark-editor-audit.md), Issue #7. The current
Canvas Direct identity raster already supports object ownership/highlights.
Local geometry is planar polygon/line data with affine placement; connected
road spans need their own two-endpoint identity. Chosen design: independent
local Canvas 2D viewer with pure 3D camera/picking, no invented geometry.
The audit specifies snapshot-scoped owner/topology guards, fixed edge/surface
anchors, projection/range integration and migration. Bounded repository-JS
checks: one rejected fill among sampled local geometries; Soundly 128 objects,
1558 primitives and 254 road quads have matching ordered topology across four
geometry variants. No production changes, no browser/full test runs.
Next: 8F.1 reuse object-identity selection and add stable metadata/descriptor;
do not start viewer or new anchor schemas yet.

## 8F — 3D Landmark Editor (planned, next priority)

Issue #7, related to Camera Calibration #6. The real-photo experiments after
8C.4b motivate improving correspondence authoring before changing the solver.
Select a placed object in the main scene, inspect its actual geometry with an
independent orbit camera, and pick a fixed vertex, edge or surface anchor.
See [the 8F implementation plan](docs/landmark-editor.md) for stages 8F.0–8F.7,
contracts, tests and the Soundly numerical baseline. Start with 8F.0 (audit).
Existing 8C.5/8C.6 and 8D/8E identifiers are retained; robust loss and multistart
are deferred until the improved authoring workflow is evaluated. SVD UI and
automated influence analysis remain planned. No runtime feature is implemented
by this documentation change.

## 8C.4b — Explicit Fit and Validation correspondences

Each correspondence has a persistent Fit checkbox (default on); turning it
off keeps the point as a held-out Validation observation. V-suffixed markers
preserve original point numbers in both views. The worker receives only Fit
rows, including their existing positive weights; authored range scaling,
least-squares solver and physical models are unchanged. The necessary
scalar-observation count uses Fit rows only, not a uniqueness test. Best
and initial residuals remain in original photo pixels; held-out projections
are computed separately, never used in the objective. The table shows Fit,
Validation and All points unweighted RMS, with explicit projected/total
counts. A missing projection makes its group RMS unavailable, not zero.
Role changes invalidate stale results, cancel running fits and support Undo.
Drafts preserve roles; portable experiment version 2 stores them and imports
version 1 as all-Fit. Stored solver results are checked against Fit rows only;
validation diagnostics are reconstructed from the stored pose on import.
Added pure role/statistics/migration tests and extended Chromium smoke for
role toggling and Undo. Previous 8C.4a CI passed (44590712939); new CI pending.
Next priority superseded by planned 8F (see above).

## 8C.4a — Photo residual visualization

Photo Calibration displays observed crosses, predicted rings and dashed
residual segments with the existing pair colors, in the original photo
viewport (pan/zoom aware). A selector switches between Best camera, Initial
camera and Off independently of the model preview. The table shows observed,
initial and best pixel coordinates, initial and best Euclidean errors, signed
best ΔX/ΔY (predicted minus observed), and best projection status. Click the
point number to select its markers in both views, including the best-camera
preview. The largest best-camera error is bold, not automatically rejected.
Initial projections are recomputed once per fit from the captured scene with
the same Canvas Direct projector at original dimensions; best projections
come from the current stored/worker result. Missing projections are explicit,
not zero. Draft restoration/import rebuilds diagnostics; stale results are
cleared on changes, and the overlay choice persists in the local draft.
No optimizer, weights, correspondence schema or experiment file format changed.
Unit tests cover sign, order, missing projections, and viewport mapping;
Chromium smoke covers live fit, overlay selection, import and invalidation.
Previous 8C.3 CI succeeded; new CI pending. Next 8C.4b: explicit inclusion/
held-out controls and validation residuals, not automatic outlier rejection.

## 8C.3 — Authored-vertex horizontal fit scaling

The exported Soundly experiment reproduced the original RMS exactly:
289.7676330971701 → 255.05611604565223 px, iteration limit 80,
1201 evaluations. The vertex-only default used the camera's distance from
the scene origin (25.3 m), not the distance to the landmarks: a 2.53 m
horizontal scale coupled to the normalized step cap. The fix measures
horizontal ranges of the authored vertices in the initial observer's
physical tangent frame (one geometry build per bank), combines them with
metric landmark ranges, and takes the median times 0.1 (minimum 1 m).
Explicit scales and locks are honored; height, angle and log-focal
defaults, objective, bounds and step cap are unchanged. The same scaling
is used in local diagnostics. No scene or correspondence is changed.

Headless verification using repository JS: median range 12796.09 m,
horizontal scale 1279.61 m, RMS 22.20164517678955 px in 13 iterations/
220 evaluations (stalled at step tolerance, not certified convergence).
A synthetic camera on the same seven authored vertices recovered all seven
parameters to within 0.001, RMS 1.64e-9 px in 7 iterations. Explicit scales
and locks passed. Added both regressions using minimal numeric data, without
photo bytes. Full Node/browser CI still pending. Remaining real-photo
residuals are not explained by this fix; #1 is inconsistent with the others
but an incorrect correspondence has not been established. Next: residual
overlay and verification of the first landmark, before robust loss or
multi-start integration. Cache keys bumped for the worker and its imports.
Previously saved results remain historical; rerun calibration after upgrade.

## 8C.2 — Portable calibration experiment exchange

Export experiment (JSON) packages format/version, captured full scene/model
and atmosphere, original embedded reference asset and provenance, authored
observations (original pixels and weights), free parameters, Canvas Direct
fit configuration and latest valid fit (pose, residuals, objective, progress
and termination status). Running exports are explicitly marked. Import
validates the version, asset, dimensions, scene, topology, free fields and
fit/observation consistency before confirming replacement of the calibration
draft. No Scene, reference library or saved project is modified. Import does
not rerun the optimizer. Fit result and free fields are now saved in the
local draft after completion/stop and ordinary editor changes. Old drafts
remain readable; prior ephemeral fit may need rerunning once after upgrade.
The previous isolation inventory was reordered by locale instead of lexical
sort; restored audit ordering. Added round-trip browser download/import test
and validation unit test. Browser/Node CI pending.

## 8C.1 — Local Canvas Direct camera fit

The Photo Calibration workspace exposes the seven captured camera parameters,
with independent free/locked checkboxes. Run invokes the existing bounded
CameraPhysicalFit local solver in a dedicated worker using original-photo
pixels and the fixed geometry/atmosphere. Progress reports the initial and
each accepted weighted least-squares candidate. Stop terminates the worker,
retaining the latest valid candidate. A separate read-only best camera view
renders predicted numbered landmarks; return to the initial view to edit.
Changing correspondences, photo, scene or free parameters invalidates results.
No Scene or saved keyframe is modified. Result/locks are ephemeral in this
first integration. Local fit from captured camera only; global reseeding,
residual overlay, acceptance/export and identifiability assessment follow.
The Accurate multi-seed calibration API is unchanged. Added progress and
browser worker regression; CI pending.

## 8B.6 — Object-first picking

The visible painter identity under the pointer now determines the highlighted
logical object even away from a vertex. A bounded edge tolerance handles
blank/antialiased pixels; occupied pixels take precedence. Snap candidates
are restricted to that object's vertices with local painter-identity support.
The chosen object's eligible vertices are shown automatically. No global
vertex fallback is used when ownership is absent; manual landmark entry is
still available. Existing pairs are not rewritten. The raster is at preview
resolution and uses approximate painter visibility, not exact mutual or
self-depth; very thin edges may be unavailable. Added overlap and ownership
regressions and updated browser picking test. CI/manual Soundly validation
pending.

## 8B.6 — Logical object highlighting

Hover, Tab candidate cycling, pending model selection and selected pairs tint
the visible logical object (bank + placedObjectIndex), not a single
primitive. During marker drag the proposed target takes priority. Vertex
markers remain above the tint. Canvas Direct paints a separate identity
raster once per preview with the same object order, clipping and ground mask,
without guides. Exact identity pixels are grouped in row spans and the overlay
is cached until the selected object changes. Thin antialiased edge pixels
may remain untinted; painter visibility is approximate, not a depth test.
Photo, solver and ordinary rendering are unchanged. Added logical grouping
and identity span test; CI and manual UX validation pending.

## 8B.6 — Model marker drag refinement

Model marker preview now follows the pointer continuously, even without a
nearby vertex. The snap candidate is highlighted separately with a dashed
connector and committed only at release. Invalid drops preserve the original
pair. Model pointer updates are coalesced with requestAnimationFrame; pointer
release processes the final coordinates synchronously. A raster-coordinate
spatial index narrows candidate searches without changing snap/tie semantics
or rebuilding on viewport changes. Photo interaction is unchanged. Added
index equivalence regression coverage; browser smoothness requires manual
validation. No solver changes.

## 8B.6 — Direct correspondence interaction

Either canvas can provide the first point. A click on the highlighted model
vertex or the corresponding photo pixel completes a pair automatically. No
Add pair button or below-canvas confirmation in the normal pointer workflow.
A hover tooltip shows overlapping candidates; Tab / Shift+Tab cycles them,
and clicking confirms the highlighted ID. Existing marker clicks select the
pair; dragging the photo marker changes only original pixels, dragging the
model marker snaps to a new authored landmark, preserving row order and
weight. Invalid drops leave the pair unchanged. Drag empty space to pan.
Inline counter, selection hint, Undo (last 50 row edits in memory), Delete
selected and keyboard shortcuts (Escape, Delete, Ctrl/Cmd+Z) are available.
Numeric/manual controls remain as fallback. Committed changes and partially
chosen model landmark are persisted using the existing draft store. Undo
history is not persisted. Camera initial guess controls, magnifier and
verified mesh visibility remain deferred. Restored required Scene/Compare
tab bindings in isolated Node hosts: newUiEl deliberately returns null in
hosts without querySelector, which caused the previous navigation regressions.
Added marker hit test, extended browser pointer test; CI pending.

## Deferred persistence architecture consolidation

TD-003 in [technical debt](docs/technical-debt.md) tracks the full application state persistence/recovery audit and lifecycle unification, beyond the completed shared workspace selection. Deferred until the photo-to-camera workflow is usable and validated. No runtime changes; 8C remains next.

## Unified top-level workspace selection and recovery

Scene, Compare, Animation, Photo Calibration and Demos now share one tab
mapping, activation-success preference write, active-tab synchronization
and startup selection policy. Individual render/Studio/calibration lifecycle
and draft storage remain separate. The common browser preference is
`workspace.mode`. New explicit workspace/shared-experiment links retain
priority on first arrival. A subsequent deliberate tab choice in that same
history entry survives refresh without changing the public URL; ordinary
local startup uses the common preference. Startup itself does not remember
a selection, and late photo draft recovery cannot override a newer user
navigation. Resetting workspace/application preferences clears the entry
override. Tests cover all five modes and explicit-mode navigation/reload.
CI pending.

## 8B.5 — Local calibration draft recovery

The active workspace preference includes Calibration. Explicit shared scene URLs retain priority. A separate IndexedDB record stores the original photograph, fixed scene, correspondences, selection and both viewport transforms. Recovery runs before enabling the calibration tab. New session replaces the draft. Storage errors are shown in the editor. Browser-local only; no cross-device sync. CI pending.

## 8B.4 — Full-scene model preview and interactive correspondence picking

The Photo Calibration workspace now paints the actual Canvas Direct renderer
on a detached raster, using the fixed scene and shared photo camera/projector
convention (Eye-Lvl). The preview has the photo's approximate aspect ratio
at a bounded 1200-pixel long edge; before photo selection it uses the panel
aspect. Each canvas has independent pan/zoom/fit, with no changes to camera
pose. On the photo choose an original pixel, then hover/click a model vertex
to create a numbered, color-matched pair immediately. The existing table
supports editing/reselection, weights and deletion; manual bank/object/
primitive menus remain a fallback. Optional landmark dots make the available
targets visible. Coincident authored vertices are deduplicated by their
physical position; distinct nearby 3D candidates require explicit selection.
The model raster is repainted only when starting a scene or loading a photo;
pan/zoom and markers operate on the cached raster.

The picking list contains in-frame, terrain-eligible projected authored
vertices, not depth-tested visibility. Canvas Direct painter ordering/masks
are approximate and self/mutual occlusion is not certified. No new optics
algorithm, camera solver, overlay, keyframe scene import, durable draft or
automatic visibility segmentation. Photo points can be edited via the table;
direct marker dragging and temporary exclusion remain later refinements.
Added Node tests for viewport transforms and ambiguity, plus a real Chromium
pointer-picking test. Previous renderer-path parity tests remain unchanged.
JS syntax checked; CI pending.

## 8B.3 — Dedicated Photo Calibration workspace

The former modal is now a peer workspace in the main navigation. It reuses the
photo picker, original-pixel viewport and correspondence draft. Enter from
Scene, Compare, Animation or Demos; the retained Scene is the source, never a
Compare clone or Studio preview. Its snapshot is reused until New session,
which confirms discarding the draft and captures the latest retained Scene.
Back to Scene and other workspace tabs leave the draft intact, including zoom,
selected photo and pairs. Physical navigation, pending draws and shimmer stop
while hidden; Studio playback is stopped through the normal workspace exit.
Calibration is UI-only, not a physical mode, URL or persisted startup choice;
a reload discards this session-only draft. Existing Scene/Compare preferences
are not overwritten by entering calibration. The larger two-column layout
uses the existing selected-object preview for now, not a full-scene renderer.

8B.4 remains full-scene model rendering and landmark picking. Associated
keyframe scene selection, solver, overlay and durable acceptance are not yet
implemented. The shipped Soundly bundle is version 1 with no linked reference
originals; its cover is not an observation. Corrected the 8B.2 Chromium test
to exercise an explicit embedded test original rather than assume one is
shipped. Previous 8B.2 Node and architecture jobs passed; Chromium failed
on that incorrect fixture assumption. Workspace navigation/draft tests
extended. New CI pending.

## Approved Photo Calibration Workspace design

The existing 8B/8B.2 modal is a prototype, not the final interaction model. Build a dedicated workspace alongside Scene, Compare and Animation Studio. The goal is a usable photo-to-camera authoring workflow, not determining Earth's shape or atmosphere.

1. Select an original photo from existing project/keyframe links, built-in demos, Reference Image Library or local upload. Offer the associated keyframe's scene and camera as the initial context when available; otherwise use current Scene. Explicitly select and freeze geometry and atmosphere for fitting. Preserve original raster and provenance.
2. Two full-scene panels: original photograph and actual model renderer (Canvas Direct acceptable). Independent viewport zoom/pan/fit must not alter physical camera parameters. Model picking uses authored landmark IDs and projected visible vertices, with hover snapping and disambiguation for coincident points. Primitive/vertex menus are fallback, not primary interaction.
3. Pair a photo click with a model landmark click; matching numbered/color markers on both panels and an editable list. Support moving photo points, reselecting model landmarks, deletion, temporary exclusion and weights. Preserve original photo pixels. Recommend diverse points across objects and heights; six to ten is a starting suggestion, not a universal sufficiency guarantee.
4. Collapsible camera parameter controls: East, North, Height, Pan, Pitch, Roll, focal length; initial values from scene or explicitly accepted photo metadata, optional locks. Run existing solver with progress, cancellation and best candidate preview. Keep original scene untouched until acceptance.
5. Side-by-side and overlay modes; align model projection with original raster, adjustable opacity, optional point markers and residual vectors. Assess entire model including unused landmarks. Allow edits and reruns; good pixel fit alone does not guarantee unique physical pose.
6. Accept camera explicitly; apply to Scene, save a normal experiment or update a selected keyframe with explicit consent. Retain correspondence data and photo identity/provenance for later editing; persistence format to be designed, not yet implemented.

Implementation order: 8B.3 dedicated workspace and lifecycle using existing photo sources; 8B.4 full-scene rendering and interactive landmark picking; 8C solver controls/progress/cancel; 8D overlay and residual review; 8E acceptance and persistence. Prefer a minimal usable vertical slice and real-photo validation over exhaustive controls. Further numerical qualification (8A.4.4b/c) stays deferred technical debt. This is a design decision, not a claim that these features already exist.

## 8B.2 — Existing reference originals in the photo editor

Photo calibration now offers a read-only source picker covering local Reference
Image Library records (including project/keyframe links from the saved Animation
Library) and embedded original images in built-in demos such as Soundly.
Project associations are shown as labels; multiple links to one local ID do
not duplicate the choice. Built-in IDs have a separate catalog namespace.
Selecting a photo decodes its original and checks dimensions, retains its ID,
source and metadata, and does not import/copy assets or mutate projects.
Local uploads remain supported. A photo replacement requires confirmation if
pairs exist; reselecting the active original retains the draft. Sources are
refreshed on opening or explicitly; storage failures do not hide other sources.
The current Scene has no direct reference-image relationship: selecting a
photo does not apply a project/keyframe's camera or scene. Direct Studio entry
with matching scene and keyframe context remains future work.

Added pure catalog and Chromium original-selection tests. Previous 8B CI:
Chromium passed; Node/architecture failed only on the reviewed Modern helper
inventory, now updated to include ModernPhotoCalibrationEditor.js. New CI pending.

## 8B — First photo correspondence editor

Open a Modern Scene and choose **Photo calibration** in the header. The modal
captures an independent scene snapshot with fixed geometry and supported
atmosphere (Vacuum, Standard, Temperature lapse). Import a local PNG/JPEG/WebP
using the existing reference-image ingestion code; decoded orientation and
original raster dimensions are retained. Click, drag, wheel/fit or enter
original pixel coordinates numerically. Select a bank, far-to-near placed
object and authored primitive vertex, either via its ID menu or magnified
Canvas Direct object preview. Add, edit, weight and delete unique landmark
pairs. The preview is not a full rendered scene and coincident points may
need the ID menu. The draft survives closing/reopening the modal in the
session; New session intentionally discards it after confirmation. No solver,
persistent draft, existing-library import or experiment/keyframe save yet.

Node tests cover coordinates and pair editing; Chromium smoke covers local
photo import and editing. The static dependency inventory includes the new
Modern-only scripts and the previously omitted 8A.4.4b test require edges.
Local execution unavailable; CI pending.

## Photo authoring priority — proceed directly to 8B

Decision: deliver a minimal end-to-end photo-to-camera editor before further numerical research. 8A.4.4a is complete. Remaining renderer parity/Direct-versus-Accurate qualification (8A.4.4b) and termination diagnostics (8A.4.4c) are deferred technical debt, not prerequisites for 8B. Retain existing tests and investigate concrete failures as needed; do not relax assertions merely to pass CI.

Use the existing calibration API and supported optical methods; Canvas Direct is acceptable for practical authoring, with Accurate optional when needed. Geometry and atmosphere are fixed inputs during estimation. No requirement to benchmark or refine RK4 before UI work.

8B MVP: load a local reference photo, preserve original raster coordinates through zoom/pan, select known scene landmarks and pair them with image pixels, edit/delete pairs. Then 8C invokes the existing solver with optional known-parameter locks; 8D shows projection overlay/residuals and lets the user accept a candidate; 8E saves accepted pose/focal length as a normal demo experiment or Studio keyframe. Prefer a usable vertical slice over exhaustive controls. Validate on a real photograph and prioritize issues exposed by actual authoring. A good image match does not guarantee unique physical pose.

## 8A.4.4b — Production renderer parity (CI pending)

Four new cases in CameraLandmarkProjection.test.js: Globe vacuum near horizon, Globe partially hidden vacuum/Standard tower at 22 km, Flat Standard portrait telephoto. Independent photo-camera reconstruction, default Accurate renderer field/step vs 200 m calibration shooting; 16 preselected vertices per case, nearest same-authored-primitive painter endpoint and recorded Canvas command coordinates, 1 px landmark tolerance. Report status/coverage and errors; no production changes. Local checkout unavailable, execution pending CI. Review before convergence work (8A.4.4c).

## 8A.4.4a — Completed; next 8A.4.4b

CI 44568506091 passed all three jobs. Near wrong matches ranked first/top three and manual reviewed weights restored held-out RMS to 1.36/1.57 px. Distant wrong matches can rank 10th/11th; three mismatches give 1.56 px training RMS despite 5.54 km position error. Two Huber passes did not improve distant results; reviewed weights restore held-out RMS to 0.84 px but pose remains ill-conditioned. No production robust-loss change; residual vectors/ranking, manual correction/weights, locks and independent validation belong in editor. Blind and truth-start scores nearly identical, termination differs; review in 8A.4.4c. Full table in docs/camera-calibration.md.

## 8A.4.4a — Incorrect correspondence qualification (CI pending)

Added two deterministic synthetic research tests in CameraCalibration.test.js: near spatial/vacuum and distant Standard, fixed physics, 1 px noise, one or three incorrect feature matches. Compare unweighted blind recovery, truth-start control, manually reviewed weights using injected labels, and two exploratory Huber reweighting passes. Report residual ranking, pose error, clean-reference and held-out scores without dropping points. No production algorithm changes. Local execution unavailable; review CI diagnostics before advancing to 8A.4.4b. See docs/camera-calibration.md.

## Camera calibration — confirmed authoring scope and next step

The primary deliverable of 8A–8E is a reusable photo-to-camera authoring tool: given a reference photograph, known scene geometry and manually identified correspondences, recover a usable camera pose and focal length under a selected, fixed surface geometry and atmospheric profile, inspect visual alignment, and save the accepted camera as a normal experiment or Studio keyframe. Geometry and atmosphere are inputs, not estimation targets. Cross-hypothesis, noise and conditioning experiments qualify the camera solver and expose pose sensitivity; they are not a program to infer Earth's shape or reconstruct the atmosphere. After accepting a camera, normal demo controls can vary geometry and atmosphere without recalibrating it. Finish bounded checks of incorrect correspondences, renderer parity near the horizon and convergence diagnostics, then proceed to 8B; defer broader numerical research until practical photo authoring reveals a need.

8A.4.3 full CI passed (run 44565389806). No production changes in this scope clarification.

## Modern Demo Catalog — Equal-budget camera hypothesis comparison (8A.4.3)

Issue #6: two new research tests in CameraCalibration.test.js; Standard truth
Globe and Flat, each fit blind under Globe/Flat x Standard/Vacuum with equal
7-free-field bounds/search budget, zero and one paired Gaussian sigma=1 px
draw. 12 training + 3 nearby held-out + 4 wider-depth validation points
(approximately 11–36 km); shared true-camera score is diagnostic only.
16 searches, 3 valid candidates each; 7 best fits converged, 9 stalled.
Noiseless wrong Standard geometry ~0.027 px fit RMS in either direction
(vs 14.993 px shared camera), but ~4.42 px wider-depth validation; height
40 m truth -> 1.95 m Flat fit or 77.99 m Globe fit. With noise correct
geometry/atmosphere need not rank best; wider-depth validation also
degrades, Flat fits to Globe truth hit 0.001 m height floor. Synthetic
self-consistency only, no general discrimination claim. Full table in
docs/camera-calibration.md. Two new tests passed (32.6 s); parent full CI
green, 28 parent source/test hashes and new test hash checked. New full
CI pending; architecture fixture unchanged; no production or UI changes.
Remaining 8A.4 qualification: outliers/repeated features, independent
renderer/near-horizon tests and convergence review, then 8B editor.

## Modern Demo Catalog — Paired Gaussian calibration sensitivity (8A.4.2)

Issue #6: two research tests in CameraCalibration.test.js, two synthetic
Globe Standard scenes (near ~670 m, distant ~22 km), 12 fitting and 3
noiseless held-out points. Paired per-coordinate Gaussian sigma 1/3 px,
12 local starts at truth and first 4 blind searches per scene/sigma,
plus 12 known-focal local trials per distant sigma. Explicit equal broad
physical bounds and finite iteration budget. 88 valid fit/validation
trials; 26 converged, 61 stalled, one iteration limit. Distant median
position errors 2246.5/5932.99 m despite held-out RMS 0.613/1.818 px;
known focal reduces position errors to 199.03/592.49 m. See
docs/camera-calibration.md for full table, denominators and limitations.
Small synthetic paired sample, not confidence intervals or global recall
guarantee. Two new tests, 14/14 CameraCalibration (~151 s), 53/53 other
four suites, 67 total. No new require edges/fixture changes. Parent
full CI green; new full CI pending; calibration dependencies verified
against remote tree. Next 8A.4.3 equal-constraint Globe/Flat and atmosphere
comparison. No production code/UI changes.

## Modern Demo Catalog — Local camera conditioning (8A.4.1)

Issue #6: added opt-in CameraPhysicalFit.diagnose using shared weighted
scaled finite-difference Jacobian, direct one-sided Jacobi SVD, numerical
resolution floor from two step sizes, singular modes/physical tangents and
boundary/derivative diagnostics. Spatial rank 7/7, frontal plane 6/7,
collinear 5/7. ~22 km synthetic Standard Globe: condition ~7275;
deterministic +/-1 and +/-3 px observation perturbations shift pose by
588.43 and 1821.67 m (latter stalled); held-out RMS 0.151 and 0.452 px.
Wrong Vacuum hypothesis fits noiseless Standard data to 0.00725 px but
height shifts +9.61 m. Local tests start at truth, not global search.
7 new tests; 65/65 five suites; 32 parent dependency/test blob hashes
verified. Existing files only, unchanged static require edges/fixture.
Full current-tree CI pending; local checkout stale outside calibration and
network unavailable. Next 8A.4 broader sensitivity/recall and independent
renderer qualification. No covariance or uniqueness claim, no UI changes.

## CI repair after multi-seed calibration

GitHub CI logs for bf87738 reported seven Node failures and one Chromium
video smoke failure; the architecture gate also stopped at the stale
isolation fixture. Calibration suites themselves passed. Updated the static
isolation inventory to 212 modules and reviewed the literal require changes;
updated the PNG destination test control to support preference binding
and the target indicator source assertion to follow the current export
handoff. The video smoke test now separately checks source-frame colors,
seeks to the middle of the first and last coded intervals, waits for decoded
current-frame readiness and reports color diagnostics without relaxing the
existing thresholds. The exact decoder failure has not been reproduced
locally; this is a test synchronization/diagnostic change, not a verified
production encoder repair. Production optics, export implementation and CI
gates are unchanged. Full current-tree regression and browser results must
be confirmed by GitHub CI before resuming 8A.4.

## Modern Demo Catalog — Multi-seed camera calibration (8A.3.2)

Issue #6: added `src/calibration/CameraCalibration.js`, unifying perspective
DLT/homography and P3P sweep, physical pose conversion, bounded diverse
seed selection, optional Canvas Direct proposals and Accurate fitting.
All final candidates scored by the same Accurate weighted objective;
approximate proposals accepted only after Accurate rescoring. Metric and
authored vertex correspondence inputs, explicit locks/bounds, distinct
no-seed/no-valid-fit states, and held-out evaluation after ranking.
12 new integration tests; 58/58 with seed, pose and local fit suites.
~22 km Standard Globe synthetic scene: three starts converged to
1.654e-11 px RMS; 28 authored bridge vertices reached 1.333e-11 px RMS.
Four distinct focal/distance solutions reproduced a frontal vertical
plane within 1.03e-12 px; no unique answer asserted. Noiseless synthetic
consistency, not photo accuracy. 30 dependency/test blobs verified against
remote parent. No full repo/browser regression or UI/production optics
changes. Finite synchronous search, not exhaustive. Next 8A.4: conditioning,
uncertainty, noise and atmospheric sensitivity, then 8B editor.

## Modern Demo Catalog — Local physical camera fit (8A.3 baseline)

Issue #6: added `src/calibration/CameraPhysicalFit.js` with explicit weighted
per-landmark residuals, fixed/free fields, bounds, scaled finite differences,
log focal, damped augmented QR, decreasing valid trial acceptance and
termination diagnostics. Invalid observations invalidate the objective rather
than being dropped. Out-of-frame finite projections remain scored.
12 new tests; 46/46 with previous seed and physical pose suites. ~22 km
Globe Standard synthetic Accurate observations: DLT seed Accurate RMS 5.983
px, Canvas Direct fit own-objective RMS 0.002348 px, Accurate refinement
1.657e-11 px. These are noiseless self-consistency tests under a known
atmosphere, not real-photo accuracy or uniqueness. 28 dependency/test blobs
matched remote hashes; no full repo or browser regression. Next: orchestration
of multiple seeds, same-objective comparison and qualification/uncertainty.
No changes to production optics or UI.

## Modern Demo Catalog — Physical camera pose bridge (8A.2.3)

Issue #6: added `src/calibration/CameraPhysicalPose.js` to convert Cartesian
perspective seeds to physical East/North/Height and Pan/Nick/Roll, with
reversible conversion, proper rotation validation and explicit domain rejection.
Preserves focal pixel scale for original centered full-canvas raster, including
legacy 3:2 aspect scaling; does not change production camera/FOV or claim
exact registration to GraphX3DX viewport margins. 15 new tests; 34/34 with
the previous two seed suites. Sampled vacuum projection round-trip within
~2.55e-13 px; DLT/P3P recovered physical camera on both sides with maximum
errors ~6.89e-12 / 1.009e-6 px. Refracted projection invariance at ~22 km
(Standard/Temperature lapse, Globe/Flat, both methods) within ~1.03e-12 px,
not a refracted unknown-pose fit. Dependencies checked by remote blob SHA,
no full repo/browser regression. Next 8A.3 bounded physical optimization.
No production optics or UI changes.

## Modern Demo Catalog — Alternative perspective seeds (8A.2.2)

Issue #6: added `src/calibration/CameraFocalSweep.js`, independent calibrated
P3P candidate generation over a bounded logarithmic focal sweep with local
focal refinement. Three deterministic triplets at most, quartic real roots
checked against original distance equations and all-point positive depth/RMS.
Retains alternative focal/pose candidates and explicitly declares incomplete
search. Ten new standalone Node tests passed; both sides of a synthetic
near-planar 1.5 km bridge at ~10 km recovered with <4e-6 px RMS in noiseless
fixtures. Adding deterministic +/-0.5 px noise gave 0.444 px RMS but 51 m
position error, highlighting weak conditioning. Only new standalone tests
were run; no full repository regression or real-raster test. P4Pf and robust
subset/global search remain deferred research. Next 8A.2.3: convert perspective
seeds to the existing physical camera convention and check round-trip parity;
then physical refinement. No production optics or UI changes.

## Modern Demo Catalog — Perspective camera seeds (8A.2 baseline)

Issue #6: added `src/calibration/CameraPerspectiveSeed.js`, dependency-free
normalized spatial DLT and planar homography with unknown focal length,
positive-depth filtering, focal bounds and explicit degeneracy diagnostics.
Input is Cartesian world/image correspondences; output is a perspective seed,
not a physical camera or exhaustive solution. Nine new Node tests passed
including both sides, telephoto, frontal/collinear cases and noisy observations.
Noiseless ordinary cases <=1e-6 px RMS, telephoto <=1e-5 px; noisy seed fixture
3.058 px RMS. Only the standalone module's tests were run in this session;
no renderer/whole-repository regression claim. Next: P4Pf/focal-sweep candidate
generation, weak geometry qualification and physical camera conversion.
No changes to optics or UI.

## Modern Demo Catalog — Camera calibration point projection (8A.1)

Issue #6: added headless `src/calibration/CameraLandmarkProjection.js` for
metric landmarks and authored mesh vertices on a fixed scene topology. It
uses camera snapshots and the actual physical and effective-radius geometry
paths, analytic vacuum or point-to-point RK4, and continuous backing pixels.
Initial scope: Globe/Flat, Vacuum/Standard/Temperature lapse, eye-level camera.
Statuses distinguish blocked, grazing, behind/near-plane, out-of-frame and
failed solves; no mesh-occlusion or global multipath certification. No UI,
optimizer or production renderer changes. 22 new tests, 148 targeted tests
passed; 40 sampled painter-path endpoints differed by at most 0.000191 px
(mock Canvas path coordinates, not a browser raster comparison). See
`docs/camera-calibration.md` for the contract and remaining qualification.
Issue #4 accepted/closed; #5 encoding research deferred. Next: 8A.2 perspective
initialization with unknown location/focal length, after extending the
projection qualification as needed for distant and near-horizon landmarks.

## Modern Demo Catalog — Export preferences (#4)

PNG and video preferences are independently stored in browser-local versioned keys.
Only known controls and supported option values are restored; unavailable storage,
invalid JSON and disabled options retain safe defaults. Jobs, progress, generated
files and filesystem handles are not persisted. Dependent UI updates use existing
initialization and change handlers.

Opera acceptance for #3 / 7D.2.3A: Soundly Causeway, Full HD, Fixed/Auto, four
workers, VP9: Accurate RK4 296 frames at 5 FPS in 238.1 s; Canvas Direct 1773
frames at 30 FPS in 71.7 s (24.72 output frames/s, ~19.9x normalized throughput).
Canvas Direct optics averaged 5.55 ms/view vs 1214.52 ms/view for Accurate.
The runs differ in FPS and bitrate (2 vs 12 Mbps), so this is not a controlled
codec benchmark. Encoder/handoff optimization is deferred; no physics changes.

## Modern Demo Catalog — Selectable Export Renderer (7D.2.3A)

Issue #3 follow-up: PNG and video exports (Simulation only and Full presentation)
now offer Accurate RK4 (default) or approximate Canvas Direct independently of
interactive playback. Both modes use the existing background workers and
presentation compositor. Canvas Direct capability rejection aborts the export
instead of falling back to Accurate; source Canvas quality is checked before
composition/encoding. The selected method is recorded in manifest quality
(including video profile), presentation footer and progress; approximate export
filenames include `_canvas-direct`, while prior Accurate names are unchanged.
Encoder bitrate quality remains a separate setting. No physics or layout solver
changes. Browser worker tests exercise real Canvas Direct and Accurate PNG and
video-source Canvas parity across portrait/travel/landscape; actual Canvas Direct
WebCodecs encoding and full Soundly performance need user verification in Opera.
Export preference persistence is deferred to #4.

## Modern Demo Catalog — Full Presentation Video (7D.2.3)

Issue #3: implemented a Full presentation video content mode alongside the
existing simulation-only export. Video and PNG share the exact Accurate RK4
presentation Canvas painter (no PNG encode/decode round trip for video),
including original linked photographs, captions, external HUD, narrative,
Auto/manual layouts, Fixed/Dynamic sizing and the presentation guide style.
The output is one fixed 16:9 raster (HD through 4K) for Scene and Compare;
internal viewports can adapt without changing the coded dimensions. Existing
video timing, explicit final sample, bounded RGBA worker queue, VP9/WebM and
H.264/MP4 muxers and codec checks are reused. Filename preview and download
use the `_presentation` suffix. Missing original photos remain a hard error.
The mode defaults to simulation-only for backwards compatibility.

539 animation/guide Node tests passed, including UI filename parity, timing,
4K RGBA budget and mocked encoder tests for both containers. Chromium rendered
three video-source Canvases (portrait, travel, landscape), byte-identical when
PNG-encoded to their corresponding PNG archive entries. Real WebCodecs
encode/decode browser test is installed but was skipped here: managed Chromium
blocks localhost navigation and WebCodecs requires a secure context. No actual
VP9/H.264 presentation file has been validated in this environment. User
acceptance in Opera is pending; start with WebM, 720p, 5 fps, Auto + Fixed,
then Full HD 25 fps. Existing 192 MiB compressed muxer limit still applies.
No physics/FOV/layout algorithm changes. Further layout optimization: #2.

## Modern Demo Catalog — Readable Presentation Guides (7D.2.2.3C)

Full presentation PNG exports now pass an explicit guide-label scale derived
from the output width (width / 1280), independently of the model viewport.
Metric distances and certified angular guide labels use semibold 12/18/24/36 px
at HD/Full HD/QHD/4K, high-contrast translucent white plates, measured bounds
and spacing checks. Dense ring labels are thinned farthest-first without
removing or moving the underlying lines. Eye level and traced horizon labels
prefer opposite sides of their unchanged projected rows with alternate
placement when near edges; if no non-overlapping placement fits, only the
label is omitted. No change to interactive or ordinary raster/video guides,
visibility eligibility, optical solves, projection, FOV, or layout geometry.

560 targeted animation/guide Node tests and three Chromium compositor/worker
checks passed, including preview/archive PNG parity and projection resize.
User visual acceptance on real Full HD observation frames is pending. Layout
optimization remains deferred to #2; renderer unresolved/fillUnresolved is
separate. Resume with Full Presentation Video Export (7D.2.3), reusing the
presentation compositor and guide scale rather than changing the optics.

## Modern Demo Catalog — Full Timeline Layout Validation (7D.2.2.3B.3)

Issue #1: B.2.1 accepted on the four user-exported Soundly PNGs. The full
59.10 s project from the supplied preview manifest was checked at every
25 fps timestamp including the explicit endpoint (1479 positions). With
Auto/Fixed at Full HD, Stacked 736x414 per physical viewport is invariant,
including 1405 positions without a displayed photo and 74 with a photo.
Auto/Dynamic uses 928x522 with no reserved reference (982 positions) and
Stacked 736x414 with a reserved reference (497 positions). No geometry
regression was found; the production compositor and optics are unchanged.

A permanent regression test exercises the built-in Soundly timeline with
portrait/landscape dimensions, four resolutions, Fixed/Dynamic, all 25 fps
positions and arrival/departure boundaries at +/- 1 ms. Independent plans
with reversed asset order agree, even when timestamps are visited backwards.
The Chromium worker test streams a portrait / travel / landscape sequence
using two workers and verifies that a separately rendered preview at the
travel timestamp is byte-identical to its archived PNG. 534 animation and
presentation Node tests and two targeted Chromium tests passed.

This validates the full timeline geometry, not a complete 1479-frame
physical render of the user's project. Original photo bytes were not in the
supplied preview ZIP; browser worker tests use synthetic originals. B.3 is
implemented; final visual acceptance remains with the user. Further layout
optimization is deferred to #2. Resume with C (physical guide readability),
then Full Presentation Video Export (7D.2.3). Investigate renderer counters
unresolved/fillUnresolved separately if needed.

## Modern Demo Catalog — Content-aware Photo Geometry (7D.2.2.3B.2.1)

Issue #1: four user PNGs confirmed Auto/Fixed Stacked at both timestamps,
Auto/Dynamic Stacked at 28.20 s and Photo + HUD below at 35.40 s.
Photo geometry now uses the same visible provenance fields as painting.
For validated originals it reserves only the required rows (two for a source
URL), beneath the contained photo instead of a separate empty column. Fixed
uses the maximum row count across the linked originals; Dynamic uses the
current original, or the linked set in a reserved travel panel. Missing
metadata retains legacy allocation. Infeasible manual layouts fall back to
Side. Both adaptive share search and Auto topology selection enforce the 60%
area floor for each original individually relative to their respective
baselines, rather than a mean-area floor; the objective weights are unchanged.
For the supplied Soundly manifest at Full HD, Auto/Fixed remains 736x414 per
model and both contained images gain about 42% area. Auto/Dynamic at 28.20 s
keeps 736x414 and gains about 62% photo area; at 35.40 s it now chooses Stacked
736x414 instead of Wide 816x459, with about 4.6x photo area. These are geometry
predictions, not user visual acceptance. No crop, stretching, physics, RK4 or
FOV changes. 88 targeted Node tests and two Chromium tests passed (pixel
composition and real render/archive workers, including streaming).

**Resume:** inspect real PNGs with this commit. HUD column/height optimization,
scene text sizing, joint width/height search and physical guide readability
remain separate refinements. Then B.3 full timeline acceptance, C, and
presentation video. Issue #1 stays open.

## Modern Demo Catalog — Adaptive Presentation Topologies (7D.2.2.3B.2)

Issue #1: the user accepted B.1 on two real Full HD frames at 28.20 and
35.40 s (672x378 per physical view with different original aspect ratios).
The PNG export UI now defaults to Auto and offers Side by side, Stacked models
(Compare), Photo + HUD below, Below, and Hidden. Auto compares complete
geometries using physical pixels, mean contained original pixels (weight 0.5),
and empty photo-box area (penalty 0.05); it retains at least 60% of the Side
mean displayed original area. Fixed caches the same geometry for all frames;
Dynamic may change on reference transitions. Infeasible manual topologies
fall back to Side; the selected topology is recorded and validated per frame
in the PNG manifest. Unknown provenance and filename-like titles are omitted
from visible output only; all original metadata is retained in the manifest.
For the supplied Soundly manifest Auto/Fixed plans 736x414 per model with
Stacked at both timestamps; Auto/Dynamic plans Stacked 736x414 at 28.20 s and
Photo + HUD below 816x459 at 35.40 s. These are geometry predictions, not
acceptance of a rendered PNG. No crop, stretching, physics, RK4 or FOV changes.

**Resume:** user acceptance on both actual PNGs, then B.3 (full timeline and
transition acceptance), C (guide legibility and layout polish), presentation
video. Explicit crop/cover is deferred until needed. Issue #1 stays open.

## Modern Demo Catalog — Adaptive Presentation Geometry (7D.2.2.3B.1)

GitHub issue #1 tracks the adaptive layout stages. Full presentation PNG plans
now derive aspect ratios from validated linked original records before rendering.
Within the selected Side/Below layout, a deterministic cached candidate search
scores physical raster pixels and contained observation pixels, penalizing empty
photo area. It never reduces the previous model raster size, and preserves at
least 60% of the previous mean displayed photo area for the considered references.
Fixed considers all linked originals; Dynamic considers the current first original
or the linked set when reserving a travel placeholder. No crop, no stretching,
no physics/RK4/FOV change. Missing dimensions retain the old allocation.
For the user's 1920x1080 Soundly manifest at 28.20 s, Side/Fixed with HUD plans
672x378 per model instead of 624x351 (geometry only, not browser acceptance).

**Resume:** check actual PNG in Opera, then B.2 (automatic layout/orientation
and explicit photo fit controls), B.3 (transition and full linked-set acceptance),
7D.2.2.3C, 7D.2.3 Presentation Video. Issue stays open until user acceptance.

## Modern Demo Catalog — External Presentation Metadata (7D.2.2.3A)

The user accepted the corrected Soundly Full presentation PNG at 28.20 s.
Full presentation now requests caption-free physical rasters, preserving the
camera frame, grid, target indicator and physical horizon/eye-level guides.
The offline compositor paints the experiment title and scene description once
outside the rasters, separately from the project title and chapter narrative.
When Include camera HUD in PNGs is enabled, the compositor measures each actual
rendered camera model through ModernCameraTelemetry. A/B share one telemetry
block only when all eight displayed physical values are equal; otherwise the
blocks are individually labelled. HUD font size scales with output resolution
(21 px at 1920×1080 and default size), not the model raster. Size remains
configurable; opacity and corner position are simulation-overlay settings and
do not affect the fixed-contrast external panel. The manifest records
cameraHudPlacement; existing simulation-only PNG/video HUD paths are unchanged.

The Side/Fixed Soundly example retains 624×351 per model at Full HD and uses
existing whitespace for metadata. Other layouts retain the old raster size
when there is enough room, otherwise reserve space before raster sizing (minimum
320×180, exact 16:9; no stretching or changes to authored FOV). Below may also
reallocate part of the reference row to preserve minimum raster dimensions;
its compact HUD heading shares a row with Height and Origin, retaining room
for photo provenance. No new layout option or project schema change. Fixed
geometry is stable across reference and narrative transitions; Dynamic may resize.
Page, renderer and archive Worker cache keys were refreshed together.

Tests cover HD–4K, Scene/Compare, all reference layouts and fixed/dynamic modes,
metadata/raster non-overlap, identical and distinct cameras, HUD off, caption
suppression, and pixel-exact composition in Chromium with HUD on/off. Real
Chromium render/archive workers also export the edited Soundly copy and a short
streamed sequence with the new HUD. Full presentation video is not yet wired.

**Resume:** inspect the user’s 28.20 s Full presentation PNG with camera HUD on,
then 7D.2.2.3B (layout optimization and horizontal/vertical comparison),
7D.2.2.3C (physical guide label legibility and multi-resolution acceptance),
7D.2.3 Presentation Video, 7E, 8A–8E and 9A–9C. Native direct disk export in
Opera still needs acceptance. Do not change physics, RK4 or authored FOV.

## Modern Demo Catalog — Presentation Export Projection Fix (7D.2.2.2.1)

Full presentation export initially creates each Worker graph at 320×180 and
then resizes its OffscreenCanvas to the compositor's per-frame viewport. The
previous no-op UpdateCanvasSize left GraphX3DX's logical dimensions and window
transform stale. The physical painter consequently projected into the old
viewport while the diagnostic angular guides used the new Canvas dimensions.
Worker graphs now synchronize logical dimensions, Canvas transform and clipping
ranges before rendering every frame, including subsequent dynamic resizes.
Animation eye-level and traced-horizon guide rows now use the physical painter's
captured camera and backing-pixel projection instead of a separate FOV formula.
The traced-horizon diagnostic remains the existing independent RK4 result;
rolled-camera suppression and existing diagnostic-line semantics are unchanged.
HUD and Target indicator already use the output Canvas dimensions and require
no resize correction. Worker and page cache keys were refreshed together.

Regression coverage includes an exact captured-offset/scale/zoom guide test and
real Chromium Worker rendering, PNG encoding/decoding and horizon pixel rows
for 416×234, 960×540 and 640×360 (Scene and both Compare sides, same Worker).
Disabling Worker resize synchronization reproduces the old viewport-center
error. No physics, RK4, atmospheric profile, compositor layout, project schema
or streaming/archive protocol changes.

**Resume:** verify the corrected Full presentation PNG on the edited Soundly
copy at 28.20 s in Opera; verify native direct-disk sequence export. Then
7D.2.2.3 Presentation Export Layout Refinement, 7D.2.3 Presentation Video,
7E, 8A–8E and 9A–9C.

## Modern Demo Catalog — Streaming PNG Export (7D.2.2.2)

The user verified single-frame Full presentation export at 28.20 s on an
edited Soundly copy in Opera. A complete 25 FPS sequence requests 1479
frames, exceeding the old memory-only cap. PNG Destination now defaults to
Save directly to disk when `showSaveFilePicker` is available; the existing
Download ZIP (in memory) mode and single-frame preview retain their limits.
The picker runs before asynchronous reference lookup; the file is committed
only after all entries and the central directory are written and close succeeds.
A bounded dispatch window of at most the render worker count (1–4) prevents
fast later frames from accumulating behind slow early frames or slow writes.
The archive worker validates exact frame metadata, emits STORE ZIP32 parts
with CRCs in order, retains only directory/manifest metadata, and sends the
manifest last. The coordinator waits for disk writes before opening the window.
Progress reports written bytes, timestamp count and a running size estimate.
Streaming supports up to 30,000 timestamps and the ZIP32 size/entry limit
(<4 GiB, no ZIP64 yet); memory mode remains 751 / 192 MiB. Cancel terminates
workers and aborts the writable file (a newly selected file may remain empty);
once final close starts the operation must settle rather than claim cancellation.
Unsupported browsers default to memory. Native picker/actual local file commit
still need Opera acceptance. Tests include a slow sink, synthetic 1479-frame
sequences, cancellation/write failure, and actual Chromium renderer/archive
workers with an instrumented sink and independent Python ZIP CRC validation.
No physics, project schema, compositor geometry or video changes.

**Resume:** verify direct disk export in Opera. Next 7D.2.2.3 Presentation Export
Layout Refinement (actual PNG showed too much whitespace, small HUD and repeated
captions), then 7D.2.3 Presentation Video, 7E, 8A–8E and 9A–9C.

## Modern Demo Catalog — PNG Export Regression Fix (7D.2.2.1)

The user's edited Soundly copy failed with `PNG archive failed: Invalid animation
project fields`. The page and importScripts used independent, stale cache keys for
the same project validator: the old validator (before ordered reference IDs) rejects
both edited V1 playback and V2 saved copies with exactly that message. The actual
Opera cache was not available, so this is a reproduced failure mechanism, not a
claim about the specific cached bytes in the user's browser. Use a shared
`project-fields=reference-narrative-1` URL for page and all export workers, refresh
the worker entrypoints and schema-dependent Studio scripts, and require matching
project-fields revisions in PNG init/ready before dispatch. Persisted versions and
strict field allowlists are unchanged; error messages now identify project/keyframe/
pose and unexpected or missing fields. The existing video encoder also loads the
V2 contract before the shared validator (no new video functionality).

PNG sequence preflight now reports the requested count (Soundly at 25 FPS: 1479,
maximum 751) before original lookup or worker allocation. Current-frame preview
remains exempt. Mocked coordinator coverage includes saved V2 and rebuilt V1,
both export modes, full sequence, originals, captions and revision mismatch.
The isolated Chromium regression uses the production coordinator, edited Studio
copy reconstructed from a normalized library record and real Accurate RK4 render
and archive workers; Blob transport substitutes script URLs only. The full HTTP
browser smoke case also exercises Create copy, photograph attachment, preview and
ZIP save. No physics, JSON schema or layout changes.

**Resume:** confirm the PNG fix on the user's existing edited copy in Opera and CI
before proceeding to 7D.2.3 Presentation Video. Then 7E, 8A–8E and 9A–9C.

## Modern Demo Catalog — Presentation PNG Export (7D.2.2)

The Studio PNG export section now offers **Simulation only** (unchanged default)
and **Full presentation** (16:9 HD–4K, fixed/dynamic photo geometry, Side/Below/Hidden,
optional explanations, existing HUD and target burn-in). The existing render-worker
pool renders the effective project with Accurate RK4 at each compositor viewport;
one composite PNG per timestamp is transferred to the archive worker. Preview
current frame renders a single exact painted timestamp (zero if no prepared frame),
shows the actual PNG in Studio and permits saving it with its manifest as a ZIP.
Sequence export retains the 751-frame/192 MiB limits and explicit endpoint. Worker
count may be reduced for large decoded originals/UHD. The selected project,
export settings and reference record snapshot are owned for the task; cancellation
during asset lookup prevents worker launch, then cancels all workers. All linked
records are required unless photographs are hidden; each worker caches only one
original ImageBitmap. The manifest preserves full project narrative, reference
metadata/dimensions (not embedded original bytes), per-frame reference identity,
count, viewport, diagnostics and text overflow warnings. First photo per hold only.
No live layout, physics, saved project or video changes.

**Resume:** validate 7D.2.2 in Opera and CI; then 7D.2.3 Presentation Video, reusing
compositor and preserving simulation-only paths, encoder dimensions, timing,
provenance and cancellation. Then 7E, 8A–8E and 9A–9C.

## Modern Demo Catalog — Presentation Compositor (7D.2.1)

The user accepted the Presentation Resize Fix in Opera and approved separating
full-presentation composition from export integration. New standalone
`ModernAnimationPresentationCompositor` plans 16:9 output, fixed/dynamic
reference layout, Scene/Compare view sizes and frame-time content; it paints
independent Accurate RK4 inputs 1:1 and contains the decoded original without
crop/stretch. Frame identity and atmosphere labels follow the sampled effective
project; caller must render that exact sample and tag completed inputs with its
clock. Original decoding and lifecycle are caller responsibilities. Text is
bounded with visible ellipses and explicit overflow warnings; provenance has
independent rows. Default fixed layout, side photo, 1920x1080, explanation on;
first linked photo per hold (count shown). No app script, UI, PNG/video pipeline,
project schema or physical algorithm changes. Unit geometry/ownership tests and
isolated real Chromium canvas pixel test added.

**Resume:** 7D.2.2 PNG integration, configuration/preview, frozen effective
project plus original decoding/lookup and complete provenance/overflow reporting
in export manifest; then 7D.2.3 video integration, including fixed-size encoding,
resource budgets and cancellation. Keep existing simulation-only exports intact.
Then 7E, 8A–8E and 9A–9C. See `docs/modern-demo-catalog.md` compositor contract.

## Modern Demo Catalog — Presentation Resize Fix (7D.1.2)

Prepare the reference panel geometry for the requested sample before either
physical graph measures and paints; commit photo content only after a successful
paired paint. Failed/pending frames clear photographs without reverting the
geometry of the attempted frame. Record the actual CSS-pixel widths of the
completed physical graphs, not the previous ResizeObserver notification; check
for a missed resize when the user pauses. No stretch of existing pixels, camera
parameter/physics changes, project schema or export layout changes.

**Resume:** validate photo/no-photo chapter jumps, layout toggles, splitter,
settings/Storyboard, viewport and fullscreen in Opera/CI; then 7D.2 Presentation
Export and remaining roadmap below.

## Modern Demo Catalog — Presentation UI Cleanup (7D.1.1)

Presentation hides all Storyboard author actions (single/batch capture,
regeneration, JSON export, cancellation and author hints), routine success and
progress notices, and Retry unless the physical failure overlay is visible.
Warnings and errors, actual optics quality, photograph inspection and playback
remain available. View settings (atmosphere, photo layout, HUD, target and
explanations) and Storyboard are independent collapsed disclosures by default;
Open Studio restores the full author interface and Create copy stays in the
library. The same mounted controls, timeline and player are shared. The
viewport sizing budget accounts for expanded disclosures; controls remain
visible in fullscreen (no idle timer). No project, physics or export changes.

**Resume:** validate in Opera and CI, then 7D.2 Presentation Export. Continue
7E, 8A–8E and 9A–9C as below.

## Modern Demo Catalog — Narrative UI (7D.1)

An optional `narrativeTitle` (120 characters, plain text) is independent of the
technical keyframe name and optional description. V1/V2 projects, Studio drafts,
Undo/Redo, checkpoints, portable bundles and deduplication retain it. Empty titles
are omitted; old projects and the shipped Soundly source remain unchanged.
Presentation has a chapter selector over the prepared active timeline, using the
presentation title or falling back to the technical name. Explicit jumps pause
and select the corresponding frame; automatic chapter/caption display follows
painted time. Show explanations hides the bounded narrative panel (including
its heading) without changing authored data; the session-local preference is not
exported. Photo layouts share the viewport budget with narrative. No PNG/video
composition changes or calibration yet.

**Resume:** validate 7D.1 in Opera and CI, then 7D.2 Presentation Export (optional
photos and narrative in PNG/video), 7E infrastructure finalization, 8A–8E camera
calibration and 9A–9C real demos. Read `docs/modern-demo-catalog.md`,
`docs/reference-images.md`, `docs/camera-calibration.md`, `docs/technical-debt.md`.
Historical next steps below are superseded. Keep reference deletion fail-closed
until safe cross-workspace ownership is established.

## Modern Demo Catalog — Reference Export & Import (7C.5)

Portable envelopes stay v1 without reference links; linked exports use v2 with
one complete `referenceImages` asset per linked ID. Compact/complete Storyboard
and Library selected/all exports retain original bytes and provenance; missing
originals fail explicitly. Import verifies raster headers and browser decode,
then imports observation assets with quota checks and collision remapping before
committing remapped named projects. No overwrite or wrong-ID association. Legacy
linked ID-only imports require re-export at the source. Separate stores mean a
failed project commit may leave observations present for retry. Read-only catalog
assets resolve from the shipped bundle; create copy imports/remaps those assets.
Soundly source unchanged. No PNG/video photo rendering. No safe deletion yet.

**Resume:** validate 7C.5 in Opera and CI, then 7D/7E generic narrative and demo
infrastructure, 8A–8E Camera Calibration, 9A–9C real Causeway calibration and final
demos. Read `docs/reference-images.md`, `docs/modern-demo-catalog.md`,
`docs/camera-calibration.md` and `docs/technical-debt.md`. Historical next steps
below are superseded. Revisit deletion at 7E; do not weaken protection until a
safe cross-workspace ownership strategy exists.

## Modern Demo Catalog — Reference Presentation (7C.4)

7C.3 was accepted by the user in Opera. The selected-frame editor now shows
thumbnail choices and linked thumbnails, with explicit original inspection
and provenance/metadata. The existing playback stage shares a real-photo
panel in Studio and Presentation: Side by side (default), Below, Hidden,
previous/next photograph and pointer/keyboard resizing. Photos follow the
completed physical frame during arrivals/holds only; travel next to a linked
frame reserves the panel but removes the observation immediately to avoid
misleading comparison. Empty unrelated frames and projects have no panel.
The full original is fit without crop; layout, size and photo choice are
viewer-only, not authored or persisted. No physics, authored demos, camera
pose, portable transport or PNG/video composition changes. Missing local
IDs/errors are explicit; no remote auto-fetch. Overlay comparison is deferred
until calibration. Safe deletion remains disabled.

7C.4.1 corrects the two CI regression fixtures: the isolated Thin outlines
playback harness now supplies reference binding/sync dependencies; the built-in
Soundly browser export expects the authored `-vacuum` filename suffix and checks
both exported atmospheres. Application behavior and the next stage are unchanged.

**Resume:** read this section, `docs/modern-demo-catalog.md`,
`docs/reference-images.md`, `docs/camera-calibration.md` and
`docs/technical-debt.md`. Next: **7C.5 — Reference Export & Import**, including
portable originals/metadata, deduplication, collision/size policy and revisiting
reference deletion safety. Then 7D/7E generic demo completion, 8A–8E camera
calibration, 9A–9C real Causeway calibration and final demos. Historical next
steps below are superseded. Verify 7C.4 in Opera before continuing.

## Modern Demo Catalog — Keyframe References (7C.3)

7C.2 was accepted by the user in Opera. 7C.3 implements optional ordered
`referenceImageIds` on v1/v2 keyframes and the selected-frame editor: load
local photographs, attach, reorder, unlink and explicitly show unresolved IDs.
Links survive Undo/Redo, frame movements, saved/copy projects, local recovery,
portable JSON (IDs only) and atmosphere variants. No raster bytes enter the
project, physical state or thumbnail cache. No final Causeway content added.
Deletion of observations is temporarily disabled, including the storage API,
because saved projects, all workspace drafts, live Undo/Redo and other tabs
cannot yet be checked atomically. Unlinking is always available. Reload all
older open instances after upgrading. Browser storage is not a backup.

**Resume:** read this section, `docs/modern-demo-catalog.md`,
`docs/reference-images.md`, `docs/camera-calibration.md` and
`docs/technical-debt.md`. Next: **7C.4 — Reference Presentation**: show actual
observation image(s), source and metadata in Studio and Presentation with
painted-clock ownership, explicit missing states and no physics changes.
7C.5 adds complete portable image transport and revisits safe deletion;
7D/7E generic demo completion, then 8A–8E camera calibration, 9A–9C actual
photo calibration, Soundly bridge finalization and other demos.

## Modern Demo Catalog — Reference Image Library (7C.2)

7C.2 adds a collapsed independent Reference Image Library in Animation Studio.
Local PNG/JPEG/WebP ingestion checks encoded dimensions before browser decode,
checks decoded dimensions (allowing an orientation swap), generates a small
thumbnail and preserves original bytes. The separate IndexedDB observation
store supports explicit metadata edits, reload, original download and confirmed
deletion, with revision checks and bounded aggregate storage. No observation
links or portable transport yet; no changes to physics or authored demos.
Browser storage is not a backup. See `docs/reference-images.md` for limits and
metadata semantics. `docs/technical-debt.md` is the living deferred backlog;
TD-001 HUD control grouping and TD-002 vertical reference-line geometry/projected
curvature are recorded but not implemented.

**Resume:** read this section, `docs/modern-demo-catalog.md`,
`docs/reference-images.md`, `docs/camera-calibration.md`, and
`docs/technical-debt.md`. Next: **7C.3 — Keyframe References**. Define stable
links and deletion protection BEFORE references can be made; preserve links
through editing, copies, Undo/Redo and recovery. Then 7C.4 presentation, 7C.5
portable transport, 7D/7E generic demo completion, 8A–8E camera calibration,
9A–9C actual photo calibration, Soundly bridge finalization and other demos.

## Modern Demo Catalog — Reference Image Foundation & Roadmap (7C.1)

7B.3 was accepted by the user in Opera. The roadmap has been revised: finish
reusable demo infrastructure first (7C.1–7C.5, 7D narrative, 7E integration),
then build Camera Calibration (8A research, 8B landmark editor, 8C optimizer,
8D uncertainty/held-out validation, 8E Studio integration), then calibrate real
Causeway images (9A), finalize Soundly (9B), and migrate other demos (9C).
Earlier prospective next steps below are historical, not the current plan.

7C.1 adds `ModernReferenceImage.js`: independent immutable observation records,
original raster bytes and optional thumbnail, stable IDs, plain-text provenance,
HTTP(S) citation, measured/reported/estimated/unknown metadata and optional
uncertainties. Structural size, type, signature and ID validation only; full
decode and storage are next. No raster enters projects, History/thumbnail
cache, LocalStorage or the portable envelope in this step. No changes to
physics or authored Soundly assets. No photographs were added.

**Resume in a new chat:** read this section, `docs/modern-demo-catalog.md`
(current staged acceptance table), `docs/reference-images.md` (record and
future Library/link/transport contracts), and `docs/camera-calibration.md`
(methodology and deferred research). At 7C.1 the next compatch was **7C.2 — Reference
Image Library**, not the calibration optimizer; see the current section above. Preserve the original bytes
separately from disposable simulation captures; link by stable IDs later.
Soundly is the two-road Causeway bridge, not the transmission-line experiment.
Its present Legacy-derived camera frames are explanatory rather than calibrated
photographic matches. Create new observation poses after source verification
and numerical calibration. Use calibration vs held-out validation landmarks,
lock known camera facts, document assumptions and uncertainties; compare the
same camera across models and atmospheres without retuning to the held-out
features. Standard atmosphere is not reconstructed weather.

## Modern Demo Catalog — Atmosphere-aware Export (7B.3)

User confirmed the switcher in Opera. Storyboard exports the selected physical
variant (complete or compact); Library export and save remain authored. PNG
and video plans capture effective playback physics at export start, or build
an unsaved draft when no player is prepared. Worker jobs retain their initial
project even if the preview changes later. A complete storyboard uses only
exact-state images and aborts on a workspace/variant change. Built-in variant
exports retain the cover, omit incompatible record thumbnails, and do not
modify the demo. Single-project JSON, PNG ZIP, video and separate video ZIP
entries carry `-vacuum` / `-standard` for common fixed active conditions; mixed
and custom atmospheres and Library-wide JSON have no common-mode suffix.
Accurate RK4 remains the media export quality. Soundly is still authored in
vacuum; the user subsequently accepted 7B.3 in Opera. See 7C.1 above for the current roadmap.

## Modern Demo Catalog — Atmosphere Switcher (7B.2)

Studio and Presentation share a Vacuum/Standard selector, visible only for
eligible prepared projects. The authored `studioPrepared` stays untouched;
`studioPlayback.project` owns the effective variant. Switching retains the
selected keyframe, current clock, playback state and authored settings, and
repaints immediately when layout permits. Variant selection resets on new
preparation, workspace switch or reload; interpolation changes preserve it.
Storyboard and batch captures use effective frame identity; shipped images
are accepted only for the exact matching physical frame. In-flight batch jobs
are cancelled on a variant change. At 7B.2, alternative-mode exports were
temporarily disabled; superseded by 7B.3 above. Soundly remains authored in vacuum.

## Modern Demo Catalog — Atmosphere Variant Engine (7B.1)

After user acceptance of 7A/7A.1, the roadmap was revised to derive atmosphere
eligibility from existing contracts and active optics, not new author flags.
The pure engine supports ready Camera and curvature Physical v1/v2 projects
with fixed Vacuum or Standard atmosphere, requiring equal A/B refraction in
Compare. It rejects atmosphere-channel, Experimental, incomplete and other
profile projects. Runtime variants retain all keyframes and timing, validate
base/reference equality and frame compatibility, and use custom preset status
for the changed active scope. Original projects remain immutable; no schema,
UI, storage, export or physics algorithm changes. Soundly remains vacuum.
Next: 7B.2 switcher and exact-state Storyboard, 7B.3 export routing, 7C reference
images, 7D narrative, 7E standard atmosphere and finalization (see catalog doc).

## Modern Demo Catalog — Export Filename Naming (7A.1)

All portable animation JSON exports use the project title (or `curvature-animations` for library-wide backups), local export timestamp including milliseconds, and a `-with-thumbnails` suffix only when the exported payload actually contains keyframe images. Titles and portable schema are unchanged. Diagnostic, History and media exports are unaffected.

## Modern Demo Catalog — Complete Storyboard Export (7A)

Narrative Support accepted by user in Opera. Storyboard actions capture missing
or regenerate all active keyframes using detached fixed-size Canvas graphs,
current preview optics/detail and paired fallback. No visible playback seek or
project mutation. Progress and cooperative cancellation between renders; complete
portable export retains every image independently of the cache or fails explicitly
within the existing image/file budgets. Compact export omits keyframe images.
Shipped portable demo assets can carry validated images (display override drops
incompatible attachments). Existing Library backup remains best-effort cached
images. Soundly source and vacuum configuration are unchanged; next: Legacy
narrative and sources (7B), then standard atmosphere and final imagery (7C),
optional presentation atmosphere toggle (7D). Browser acceptance remains open.

## Modern Demo Catalog — Narrative Support (6)

Optional plain-text keyframe descriptions (1000 characters, empty omitted in
portable JSON) survive editing, Undo/Redo, draft recovery, copy and import/export.
Presentation displays the explanation of the last arrived keyframe using the
actual painted time, including outgoing travel, with an explicit frame label.
The next arrival replaces or clears the caption; no panel for captionless
sequences. Old projects and physics are unchanged. User confirmed step 5 in
Opera; narrative browser acceptance remains open. Next: Soundly Finalization
(author captions and complete visual/provenance acceptance). No caption overlay
in exported video or PNG is included in this step.

## Modern Demo Catalog — Presentation Mode (5)

A viewer-focused, viewport-filling layout reuses the mounted playback stage,
clock, Scene/Compare canvases and Storyboard. Title/current painted frame or
transition, actual optics quality, transport, HUD toggles, native fullscreen,
Open Studio and built-in Create copy are available. Background controls are
inert and focus is restored on exit. Resize uses existing playback lifecycle;
no edits to source demos or physical contracts. Next: Narrative Support;
full-page browser acceptance remains open.

## Modern Demo Catalog — durable keyframe thumbnails (4C)

A separate bounded IndexedDB cache restores exact-state thumbnails after reload,
shares unchanged frames across Read-only demos and copies, and prunes oldest
writes. Optional portable per-frame image attachments are validated and imported
only after project storage succeeds. No raster data enters project records or
LocalStorage. Cache failures do not prevent playback or project saves. Next:
Presentation Mode; full-page Opera acceptance remains open.

## Modern Demo Catalog — lazy keyframe thumbnails (4B)

Storyboard and detailed editor display matching History screenshots or bounded
transient captures after explicit paused jumps. Compare screenshots contain both
viewports; stale time, player, selection and snapshot requests are rejected.
Manual Capture thumbnail replaces the selected cached view. No eager captures,
project schema changes or storage writes for images. Next: 4C persistence;
full-page Opera acceptance remains open.

## Modern Demo Catalog — horizontal Storyboard (4A.2)

A compact horizontally scrolling navigation strip is mounted directly below
playback controls. Shared key-based selection, exact prepared arrival times,
no duplicated read-only timeline, and a collapsible owned-project editor.
No physics or thumbnail storage changes. Next: 4B capture, then 4C persistence.
Full-page Opera acceptance remains open.

## Modern Demo Catalog — paused keyframe rendering (4A.1)

User reported keyframe navigation dependent on Play and excessive scrolling.
Keyframe jumps now force a paused paint immediately when the preview has
layout, with deferred layout/retry otherwise; success requires an exact
rendered timestamp. Manual Opera verification remains open. Next: 4A.2
horizontal Storyboard near playback, then 4B/4C thumbnails. No layout or
physical algorithm changes in 4A.1.

## Modern Demo Catalog — keyframe navigation (4A)

Click a compatible included keyframe to pause and jump to its exact arrival
(time in milliseconds), including Read-only Soundly. Compatible unprepared
projects auto-prepare; excluded and incompatible cards remain selection-only.
The same paused-frame renderer and retry lifecycle are reused; no authored
project changes, new optical solver or thumbnail writes. The clock displays
hundredths of a second. Next: 4B lazy keyframe thumbnail capture and 4C separate
IndexedDB persistence before Presentation Mode.

## Modern Demo Catalog — synchronized Compare playback (4)

Soundly opens in Globe/vacuum vs Flat/vacuum Compare with Canvas Direct
by default. The manifest overrides the Camera display mode on the detached
validated project and contract; the source JSON and all keyframes remain
unchanged. Copies and portable export use Compare. Existing shared clock,
paired fallback and Accurate exports are reused. Both canvases are covered
by an opaque error notice if a paired paint fails. Isolated real Canvas
checks passed at nine representative times; full-page browser acceptance
and actual FPS remain open.

## Modern Demo Catalog — project cover editor (3A)

Personal saved projects now support uploading/replacing a bounded raster cover,
capturing a paused rendered frame and removing the cover independently of their
physical thumbnail. Changes use optimistic metadata revisions and preserve
working edits; built-in originals remain read-only. Soundly's authored Auto
preview resolves to Canvas Direct on open/copy; original JSON and explicit
user quality choices are unchanged. Browser acceptance remains open.

## Modern Demo Catalog — Studio catalog UI (3)

Animation Library now separates Built-in Demos and My Projects into labelled
card galleries. Soundly displays its working reference photo; user copies
inherit a portable cover and show it before the physical thumbnail. Open demo
uses the existing read-only player, Create copy protects outgoing edits even
when invoked directly from a card, and Export demo is independent of personal
backup selection. Details still inspect physical data. No editable actions on
built-ins; browser acceptance remains open.

> **Current roadmap — Modern built-in demonstrations (2026-11-18):**
> Patches 0, 1, 2A, 2B, 3, 3A and 4 implemented; see
> [`docs/modern-demo-catalog.md`](docs/modern-demo-catalog.md).
> Soundly: 9 frames, 59.1 s, spline, Globe/Flat vacuum Compare; source
> Scene JSON is preserved. Synchronized sample/render paths are tested;
> real full-page playback remains to be accepted. Catalog loading requires no IndexedDB or fetch. Working cover
> rights remain unverified. CI/Opera browser gate is open.
> **NEXT: patch 5 — Presentation Mode (browser acceptance still open).**
> User reported green CI after the obsolete profiler-test cleanup; tag
> relocation has not been independently verified. Stage 5D remains deferred;
> extreme fallback and measured FPS remain open. The Canvas Direct notes
> below are historical baseline evidence.

> **Active implementation roadmap — Canvas Direct interactive migration (2026-11-18):**
> Stages **1–3 complete**: after corrective repair C the user reported normal,
> very fast and smooth Opera interaction (manual observation, no measured FPS).
> Stage **4A — pointer/wheel/keyboard** accepted by the user in Opera.
> Stage **4B — camera sequences** accepted by the user in Opera (reported
> working and visually very accurate; no instrumented FPS).
> **Stage 5A — numerical qualification** completed externally on `fa45a7f`:
> 2572 point cases, 66 RK4 convergence controls, 46 bracketed visibility
> thresholds (43 resolved), five headless Chromium scenes. Standard and
> -6.5 K/km lapse, ranges <=40 km and heights <=100 m: maximum sampled
> visible-point error 0.406 backing pixels at diagonal FOV 1° (1200x800).
> This is a sampled single-branch comparison, not a universal accuracy bound.
> **Stage 5B — virtual Flat horizon masking** accepted by the user in Opera: positive effective
> curvature now activates the existing approximate far/mask/near painter
> order and clips metric guides to the same observer-local tangent distance.
> Flat zero/negative curvature has no virtual mask; Globe is unchanged.
> The physical model, RK4 diagnostics and authoritative exports are unchanged.
> Chromium regression (Flat exponential, 30 km tower, eye 15 m): the
> lowest non-white tower row (RGB minimum <200 over white) changed from
> 439 to 393, matching Accurate's 393 at 1200x800; no general parity claim.
> Validation: 24/24 Canvas Direct tests; 264/264 wider regression tests;
> both static isolation audits passed. Full test suite not repeated.
> **Stage 5C — shared capability and fallback policy** implemented: the
> pose-specific `canvasDirectSupport` inspector covers finite local optical
> parameters, effective Globe sign/range, camera translation and authored
> sequence limits. Flat vertex-domain failures are explicitly classified by
> the painter; Studio retries Accurate without changing requested quality.
> Interactive navigation retains the existing preflight fallback and restores
> selected physical rendering on failure; Compare checks both current poses.
> No new RK4 in supported direct motion and no arbitrary FOV/range accuracy
> cutoffs. Validation: 666/666 targeted and wider regression tests, both
> static isolation audits. Actual Opera performance and extreme fallback
> appearance not measured. Full test suite not repeated.
> **Stage 6 — interactive motion refactor & cleanup** implemented on the
> Stage 5C baseline at the user's request. `ModernCameraDirectMotion.js`
> replaces the misleadingly drag-named scheduler; detached frame preparation
> and side-specific capability checks are shared. Removed the mutable
> fallback-reason side channel, repeated checked drag-pose calculation and
> duplicate wheel settle timer branch. Fast/CSS remain necessary fallback
> routes; no change to optics, quality preferences, interaction timing or
> exports. Validation: all 304 Node test files (1766/1766 across seven shards),
> both static isolation audits and the 136-test refactor closure gate passed.
> **Browser CI cleanup:** the retired playback profiler smoke test was removed
> (profiler deletion: `59139bc`); two obsolete manual timing instructions
> now point to retained Actual FPS telemetry. Other browser smoke tests and
> independent quality-audit profiling remain intact. Targeted Node tests:
> 14/14 passed. All nine remaining Chromium smoke tests were attempted locally
> but navigation was blocked by the environment (`ERR_BLOCKED_BY_ADMINISTRATOR`);
> GitHub Actions subsequently passed, as reported by the user.
> **Remaining Canvas Direct validation:** manual Opera regression (Scene/Compare pointer, wheel, keyboard,
> Camera Animation, Studio and unsupported-case fallback). Stage 5D was
> deferred at the user's request to proceed to cleanup; representative
> requalification and measured browser FPS are still open. Stage 5C extreme
> fallback behavior has not been independently accepted in Opera.
> See [`docs/interactive-rendering-migration.md`](docs/interactive-rendering-migration.md)
> for the source inventory, acceptance gates and historical validation notes.
> Read `git log -1` to identify the applied HEAD.
> **4B:** Camera Animation uses the shared Canvas Direct owner and latest-pose
> RAF scheduler in Scene/Compare; Fast remains a preflight fallback. Absolute
> sequence timing, hold intervals, interpolation, Stop/Cancel and keyframe
> persistence are unchanged. Unchanged held poses do not repaint. Completion,
> interruption or runtime failure restores the selected physical renderer; a
> failed Compare paint or targeted edit restores both sides. No RK4 per direct
> frame. Stale sequence callbacks cannot advance a replacement playback.
> Validation: 68/68 navigation tests, 669/669 broader camera/animation/History/
> architecture tests; both static isolation audits passed. Entire 304-file
> test suite and browser FPS were not measured in this compatpatch.
> Stage 4B manual acceptance subsequently received; see above.
> Newly created Animation Studio previews now prefer **Canvas Direct** with
> checked **Thin outlines ≤ 1 backing pixel** and **Auto FPS**. Explicit quality
> choices in old drafts/Library records are preserved, and newly selected
> Canvas Direct can now survive workspace autosave. It now uses the production
> `n(h)`, `dn(h)` at observer height for all seven existing Modern atmosphere
> profiles on Globe and Flat, including positive virtual curvature for Flat
> inverse profiles. Invalid/unrepresentable geometry still falls back to Accurate;
> Compare does not silently mix direct/accurate frames. The authored project
> schema, authoritative Scene/Compare and Accurate PNG/video export are unchanged.
> Targeted tests: 110/110; wider animation/camera/export regression: 595/595;
> documentation/isolation: 17/17. The attempted entire suite timed out and
> is not claimed green. Real Opera/browser FPS remains to verify. Stage 3 now routes supported
> **Scene/Compare pointer drags** (Pan/Nick and Shift-translation) through
> RAF-coalesced Canvas Direct with 1 backing-pixel outlines; live scene
> physics remains unchanged until release. Both Compare atmospheres must
> qualify. **Flat Standard qualifies** using negative virtual curvature;
> the seven-profile follow-up also covers positive virtual Flat curvature.
> Invalid/unrepresentable geometry retains a safe fallback. This signed
> Flat extension was tested against the Accurate Flat RK4 launch angle at
> representative 1–40 km distances (error under 0.3 µrad in those cases).
> It is a local preview approximation, not accurate Flat ray tracing.
> See the signed Flat and all-existing-profile follow-ups in the migration
> roadmap; Stage 4 (wheel, keyboard and camera sequences) is still next.
> `OpticalEffectiveRadiusPreview.parameters()` remains deliberately limited to
> its original three profiles; only `canvasDirectParameters()` was broadened.
> The live approximation is not an RK4 visibility or mirage reconstruction.
> Seven-profile regression: 1245/1245 tests across three Node shards, including
> Modern, Compare, Animation, optics, export and Legacy; Legacy/Modern isolation
> fixture updated only for a new test import and audit `--check` passed.
> Manual Opera drag/Playback visuals and measured FPS remain unverified.
> Release/cancel/failure restore the configured physical renderer. Wheel,
> keyboard and camera sequences are untouched; Stage 4 covers those paths.
> Stage 3 pointer/Animation/Compare/isolation suite: 635/635; separate
> physical/optical/Legacy suite: 689/689. Local headless Chromium smoke was
> blocked by browser navigation policy, not completed; manual Opera verification
> remains required.

>
> **Stage 3 corrective follow-up A — Flat drag orientation (2026-11-18):**
> Canvas Direct's Flat object mesh used Legacy's mirrored lateral placement,
> whereas Accurate RK4 uses the physical east/north placement. During pointer
> drag this reversed the horizontal object orientation, which recovered after
> mouseup because the authoritative renderer repainted the scene. The direct
> Flat mesh now uses `physicalSurface: true, curvature: 0` for *authored* object
> placement, while its signed atmospheric approximation still bends the virtual
> surface in the observer frame. Globe placement, camera state, physical RK4,
> model/History and exports are unchanged. New pixel-coordinate parity tests
> compare actual direct Canvas strokes to independently projected physical
> Flat geometry across Pan/Nick/Roll, camera translation and Vacuum/Standard/
> Inverse temperature. Regression shards: **1248/1248 passed**; static
> isolation audit `--check` passed with unchanged Legacy/Modern HTML loads.
> No browser visual parity or measured FPS is claimed.
> **Stage 3 corrective repair B — presentation/grid parity (2026-11-18):**
> Canvas Direct now uses `CurvaturePhysicalWorldGeometry.RINGS` and
> `guideExtent()` to generate the same distance landmarks (including manual
> extent) and 24 radial spokes as physical Scene/Compare, plus seven
> view-aligned spokes and metric labels. The geometry is projected through
> the local effective-curvature approximation and batched into at most two
> Canvas strokes (Thin outlines remain capped at one backing pixel), without
> invoking RK4. Globe uses an *approximate* virtual ground limit; Flat is not
> assigned an invented certified horizon. The existing full scene decoration
> module now restores captions, title/description, geometry summary and frame
> during drag, honoring `captionMode: off`. Eye level is repainted, and an
> optical horizon uses a matching existing RK4 diagnosis only; changing
> provisional height avoids a new diagnosis until the accurate settle redraw.
> Roll still uses the existing eye-level convention and omits the traced
> horizon: the accurate sloped/curved isoline needs separate guide work.
> No physical renderer, authoring, History, Legacy or export contracts changed.
> **NEXT: Manual Opera Scene/Compare drag acceptance** — check signed Flat,
> two Compare atmospheres, Pan/Nick/Shift, captions, grid, HiDPI and measured
> motion FPS before unblocking Stage 4. Node regression/isolation results for
> this repair are recorded in `docs/interactive-rendering-migration.md`.

>
> **Stage 3 corrective repair C — Visibility & haze / Flat grid colors (2026-11-18):**
> Opera showed that during Canvas Direct camera drag, atmosphere Visibility & haze
> disappeared and the Flat metric grid briefly became black. Direct painting
> now uses the shared `CurvatureAtmosphericVisibility` extinction/blend law for
> rendered object fills and strokes, including implicitly black strokes, with
> a cached representative distance per authored object package. A small per-
> object swatch cache avoids repeated exponential/hex conversions; camera moves
> update only observer-relative range. It does **not** re-run RK4 or mutate the
> physical/History models. Metric grid rings/spokes use the exact same shared
> physical color fallback as the Accurate renderer on Globe **and** Flat,
> rather than Legacy `FEGridCol`. Atmospheres still control refractive
> geometry independently from haze; Compare visibility remains shared by UI
> contract. Haze is approximate airlight over source range, not a solved
> optical-path integral. **Node verification:** 1739/1739 regression tests
> passed across six shards; refactor closure 136/136; Legacy/Modern static
> isolation audit passed with the new documented import. Browser look/FPS
> after C was subsequently accepted by manual user observation in Opera;
> instrumented FPS remains unmeasured. Stage 4A follows.
>
> **Animation Studio Preview geometry detail (#51, 2026-11-17):**
> Playback now offers `Full` / `Balanced` / `Performance` Scene detail,
> independent of optics quality. The shared Fast-only OpticalPreviewLod maps
> these to fixed strides 1/2/4 for supported repeating tower banks; all other
> object types are retained without invented mesh simplification. Full removes
> artificial object thinning even when Fast is selected; Accurate RK4 remains
> full-resolution. Browser preferences persist independently of Animation
> project JSON / History, and the existing deterministic Accurate PNG/video
> export path is unchanged. Default Performance preserves earlier Fast stride 4.
> Preview diagnostics show requested level and actual selected/original counts;
> test coverage includes cross-mode semantics, preference roundtrip and UI
> changes. Actual Opera frame timing and motion LOD stability remain to verify.
>
> **Legacy storyboard readiness inventory (#46, 2026-11-17):**
> Source-only, repeatable `tools/audit-modern-demo-readiness.js --check`
> now enumerates nine demos, 80 authored states, 71 adjacent transitions,
> 10 Modern preset references to nine distinct Legacy states and the 28
> structurally schema-blocked states. All eight geographic demos remain
> *partial*; zero original states and transitions have complete native
> visual/optical/choreography parity certification. The fixture
> `tests/fixtures/modern-demo-readiness.json` and
> `tests/ModernDemoReadiness.test.js` pin source indices, source/control-helper
> evidence and the no-conversion policy. See `docs/modern-location-migration.md`
> for bounded Animation Studio storyboard prototype and scene-reference gates.
> No renderer, experiment codec, Legacy runtime or Demos routing changed.
>
> **Soundly Causeway partial native Scene (#45, 2026-11-17):**
> Ported a source-backed `soundly` preset from Legacy Soundly state index 12
> (`?demo=Soundly&pos=13`): 128 supports at 300 m intervals, 496 m start,
> 10.8 m observer, 2200 mm focal length and source zero refraction (vacuum).
> Independently supported geometry types 8/9 reproduce local authored bridge
> structures including elevated passages, narrowing, signage and towers;
> source indices are reversed for type 9. Two longitudinal road meshes are
> joined independently in the same physical surface geometry for Globe/Flat.
> The shared ray optics, persistence format and isolated Legacy renderer remain
> unchanged. Source DrawShape comparisons, Scene/Compare placement and JSON/URL
> checks are in `tests/ModernSoundlyPreset.test.js`. Original 18-state narrated
> transition choreography and visual parity are not certified.
>
> **Little Tensas Bayou partial native Scene (#44, 2026-11-17):**
> Introduced source-backed `tensas` from Legacy state index 3
> (`?demo=Tensas&pos=4`), preserving 87 supports at 150 m spacing,
> source 10.8 m camera and 3000 mm focal length, `vacuum`, and exact
> type-7 local pillar, guardrail and center-crossover geometry. Separate
> world-space continuous road and shore meshes follow the same shared physical
> Globe/Flat placement and ray-optics renderer as the other Modern types.
> The original DrawShape was not modified; source-matching shape tests,
> independent A/B render and History/JSON/URL coverage are in
> `tests/ModernTensasPreset.test.js`. The 6-state Legacy storyboard,
> its historical refraction coefficient, and native pixel parity remain
> unported. Next source-backed family is Soundly (types 8/9).
>
> **Lake Pontchartrain Causeway partial native Scene (#43, 2026-11-17):**
> Added `causeway` as a source-backed Modern preset from authored Causeway
> state index 4 (`?demo=Causeway&pos=5`): two rows of 41 bridge supports,
> 967.5 m spacing, near distance 0 m, 5 m support height, camera 100 m and
> 2000 mm, with source zero-refraction represented by vacuum. The existing
> type-6 world-space geometry creates 40 road polygons per row with no
> cross-column connections. Scene/Compare are independently ray-traced on
> Globe/Flat; Modern uses a shared eye-level camera rather than replicating
> Legacy's combined `showModel=3` overlay. The preset participates in the
> existing History/Previous/Reset, JSON and URL mechanisms. No new object
> type, ray solver, persistence format or Legacy behavior was changed.
> Full visual/animation and all-six-state parity remain unverified. See
> `tests/ModernCausewayPreset.test.js` and
> `docs/modern-location-migration.md`. Next: independent type-7 Tensas.
>
> **Platform Grace and long-distance metric grid (#42, 2026-11-17):**
> `grace` is now a **partial** native Modern preset based on authored Legacy
> Grace state index 7: two 28 km type-6 platform supports + a world-space
> road segment, and eleven type-5 Anacapa silhouettes at ~50.1 km. The source
> vacuum/globe physics is preserved; Modern Nick −0.21° is an explicit camera
> adaptation. Object type 6 now validates and renders through the common
> Scene/Compare/History/schema-v1 path; Legacy's zero-interval opening states,
> narrated transitions and constant-k parity remain unported. Metric grid
> extends to a bounded 1000 km with 750/1000 km manual options and a
> camera-dependent 10 px thinning of optically projected distant ring strokes.
> No altered ray optics, surface visibility or invented horizon. See
> `tests/ModernGracePreset.test.js`, `tests/PhysicalLongRangeGrid.test.js`,
> `tests/PhysicalScreenSpaceGuideLod119.test.js` and
> `docs/modern-location-migration.md`. Full Chromium visual check pending.
>
> **Mount Canigou partial native views (#39, 2026-11-16):**
> `canigou` (1000 m / 257 km, vacuum) adapts Legacy Canigou source state 2;
> `canigou-low` (244 m / 257 km, Modern Standard atmosphere) keeps source
> state-4 mountain geometry, but does NOT emulate its Legacy constant
> refraction coefficient. Both use eye-level Modern camera aim, with explicit
> Nick −1° / −0.5° to replace source curvature-dependent horizon centering. Both presets reuse the type-5 shared physical
> Scene/Compare geometry, preserve all 40 source mountains, and round-trip
> through existing History, schema-v1 JSON and experiment URLs. The
> canonical catalog now marks Canigou **partial**. Legacy's narrated eight
> states / seven transitions, original camera projection, inversion and
> pixel/optical parity are NOT ported. Tests: `ModernCanigouPreset.test.js`,
> `ModernSceneControls.test.js`; see `docs/modern-location-migration.md`.
>
> **Chicago distant camera and native mountain primitives (#38, 2026-11-16):**
> `chicago` now opens with a demonstrated ~63 km line of sight from a 2 m
> observer (standard atmosphere, narrow FOV); `chicago-near` retains the
> authored original 3.4 km camera with vacuum atmosphere for source comparison.
> Both are resettable Modern presets, and share unchanged state-0 object
> geometry. Legacy type-5 mountains now use independent world-space geometry
> with all three source silhouettes, bank-dependent variants, alternating
> mirror cycles, visible/hidden colors and height-only variation. Modern
> Objects/Scene/Compare/schema-v1 support type 5, while Canigou/Grace
> scenarios, Legacy composite views, animations and optical parity remain
> unported. See `tests/ModernMountainGeometry.test.js` and
> `docs/modern-location-migration.md`.
>
> **Chicago Skyline partial Modern Scene (#37, 2026-11-16):**
> The shared physical geometry engine now supports authored Legacy object
> **type 4**: three filled/stroked city silhouettes, index-dependent mirroring,
> both palettes and height-only cosine variation. A `chicago-near` near-shore source preset
> adapts state index 0 (`?demo=Chicago&pos=1`) with six buildings, source
> placement/camera/object settings and a vacuum globe. Scene and independent
> Compare A/B use the same object bank; type-4 validation, Objects editor and
> version-1 experiment serialization/History are supported. No Legacy model,
> combined `showModel=3` view, later Chicago states or animation transitions
> changed. This is NOT complete static/pixel/optical parity; see
> `tests/ModernChicagoPreset.test.js` and `docs/modern-location-migration.md`.
>
> **Modern preset navigation / protected return (#36, 2026-11-16):**
> `Custom scene (edited)` is an active experiment label, not a reloadable preset.
> Selecting a Scene preset or **Reset to preset** now saves the outgoing *full*
> validated experiment as an idempotent, pinned `recovery` History checkpoint
> **before** changing the live model. A failed History write or concurrent edit
> cancels the switch. **Previous** restores the last saved outgoing experiment
> using the existing History Restore path (which in turn protects the current
> experiment); after a reload, protected entries remain accessible in History.
> The Scene selector's transient DOM change no longer corrupts the archived
> `scene.preset` value. Compare A/B is refreshed to correspond to the new
> preset. No second archive, experiment-schema change, new preset ID, Legacy
> physics change, or new filename version is introduced. Targeted regressions
> are in `tests/ModernSceneControls.test.js`. Chicago geometry follows as #37;
> subsequent location ports remain source-evidence gated. See
> `docs/modern-experiment-history.md` and `docs/modern-location-migration.md`.
>
> **Modern location migration catalog and tracker (2026-11-16):** A read-only
> `ModernLocationCatalog.js` now records six distinct geographic subjects and
> nine authored Legacy demo scenarios, with stable IDs and explicit partial /
> not-ported statuses. No unsupported native preset was enabled, and existing
> Modern preset/experiment IDs and Legacy Demos remain unchanged. The active,
> evidence-driven checkboxes are in `docs/modern-location-migration.md`; they
> supersede the old archive-only product preference without lifting the Legacy
> preservation or numerical/visual parity gates. The existing compatibility
> audit covers all 80 source states, and 6 archived original-Canvas browser
> frames are *Legacy-only* references. The 71 old transitions are unported.
> #34 adds 27 explicitly indexed opening/middle/final source-backed camera and
> object-layout summaries (`tools/audit-modern-location-evidence.js`) and
> numeric checks of the partial Pontchartrain preset and the `Curve` /
> signed-range Bedford presentation policies. #35 enables a **partial** native
> `bedford` Scene option based on Legacy state index 3 (URL `pos=4`), using the
> supported type-0 geometry with its 18 m lateral variation, a vacuum baseline,
> version-1 experiment persistence and distinct physical A/B views. The
> signed-distance prelude, original `showModel=3` overlay, remaining Bedford
> checkpoints and animation are **not** ported. Stage D remains open; see
> `tests/ModernBedfordPreset.test.js` and the active checklist.
>
> **Animation Studio refactor closure audit (2026-11-16):** Seven extracted
> browser-global coordinators are now checked together by
> `tests/ModernAnimationRefactorBoundary.test.js`: their load order and
> application binding are explicit, before `ModernApp.js` bootstraps.
> One unreachable History Restore error-wrapper was removed; its actual
> guarded click handler and failure behavior remain covered by existing
> integration tests. A narrow static orphan-function check was added to the
> architecture gate; it is *not* a complete JavaScript reachability proof.
> `ModernApp.js` still owns UI/DOM, physical rendering, mutable editor state,
> and integrations with History, Camera, Scene and Compare. No further split
> is justified solely by file length. No physics, storage, project schema,
> Legacy, or exported browser API changed. Details:
> `docs/modern-animation-contract.md#animation-refactor-closure-audit`.

> **Animation Playback control boundary (2026-11-16):**
> `src/animation/ModernAnimationPlaybackControls.js` coordinates one active
> RAF tick, Play/Pause/Stop/Seek, tab-visibility pause and natural completion.
> Every operation uses the active clock supplied by `ModernApp.js`; cancelled
> callbacks cannot revive an old workspace. Interpolation switches retain
> position and cancel the previous tick. The application retains optical
> rendering, DOM, draft persistence and paused-frame Preview lifecycle.
> Physics, JSON/IndexedDB, deterministic interpolation and Legacy are unchanged.
> See `docs/modern-animation-contract.md#animation-playback-control-boundary`.

> **Animation Studio editor state boundary (2026-11-16):** Draft edit
> recording, live input grouping, Undo/Redo restoration, selected-frame
> fallback after deletion and Studio selection checkpoints are coordinated by
> `src/animation/ModernAnimationStudioEditing.js`. The application supplies
> live workspace state and retains actual UI rendering, focused controls,
> preview invalidation and local checkpoints. A subsequent workspace cannot
> reuse an old draft/history closure; undo/redo never touches History records.
> No project or IndexedDB schema, optics, or Legacy changes. See
> `docs/modern-animation-contract.md#animation-studio-editor-state-boundary`.

> **Animation Preview lifecycle boundary (2026-11-16):** The delayed
> first/paused-frame scheduler, RAF generation invalidation, post-layout
> retries and ResizeObserver width tracking have been extracted from
> `ModernApp.js` into `src/animation/ModernAnimationPreviewLifecycle.js`.
> `ModernApp.js` retains the actual physical renderer, playback clock, editor
> generation, loading/error/ready messages, and one-shot Preview navigation.
> A newer Prepare, stop, seek or project switch invalidates queued paints;
> hidden workspaces do not paint; failed frames remain retryable. Existing
> `ModernAnimationInitialFrame` and regression tests exercise the real
> coordinator. No optics, UI state format, project JSON or Legacy changes.
> See `docs/modern-animation-contract.md#animation-preview-lifecycle-boundary`.

> **Animation Library action boundary (2026-11-16):** Named-project
> list/refresh, portable JSON import/export, optimistic-revision rename,
> Save/Save As and confirmed deletion now run through
> `src/animation/ModernAnimationLibraryActions.js`. The coordinator owns
> Library transaction sequencing, busy/error completion, portable limits,
> and download selection. `ModernApp.js` still owns editor project building,
> thumbnail provenance, live draft revisions, workspace detachment and UI.
> Conflicts or storage errors do not replace the editor; import never modifies
> the active draft. V1/V2 JSON, IndexedDB schema, rendering and Legacy are unchanged.
> See `docs/modern-animation-contract.md#animation-library-actions-boundary`.

> **Animation Workspace durable persistence boundary (2026-11-16):** The
> serialized IndexedDB write queue and atomic merge result handling were
> extracted from `ModernApp.js` into
> `src/animation/ModernAnimationWorkspacePersistence.js`. The new coordinator
> advances the durable baseline only after success, forks same-workspace
> concurrent edits, prevents stale deletes, retains per-tab local backups and
> never replaces a newer active editor generation. `ModernApp.js` retains
> editor checkpoint staging, UI presentation, and Library-specific actions.
> Focused race/failure tests and the existing real IndexedDB emulation are
> retained. No project schema, physics, storage key or UI behavior changes.

> **Animation Workspace switching boundary (2026-11-16):** Destination validation,
> outgoing draft checkpoint and durable-write barrier, generation guards around
> async Library opens, and Wizard save completion were extracted to
> `src/animation/ModernAnimationWorkspaceSwitch.js`. `ModernApp.js` still owns
> live editor/preview state, IndexedDB persistence, conflict forks, named Library
> actions and rendering. The existing draft/saved-project/wizard integration tests
> are preserved, with focused pure coordinator race/failure tests added.
> No project schema, storage key, physical algorithm or UI change.

> **Animation Workspace recovery boundary (2026-11-16):** ModernApp's initial
> local/session/IndexedDB recovery ordering and pagehide/beforeunload/visibility
> flushing were extracted to `src/animation/ModernAnimationWorkspaceRecovery.js`.
> The active editor, serialized atomic IndexedDB merge, same-ID conflict forks,
> UI and physical model remain in their prior owners. Explicit generation checks
> prevent delayed reads replacing active edits. Focused Node tests cover startup,
> late reads, local/remote merge, and lifecycle events. No schema or UI changes.
> See `docs/modern-animation-contract.md#animation-workspace-recovery-boundary`.

> **Animation Studio timeline UX (2026-11-16):** Draft-only Undo/Redo now
> covers keyframe insertion, removal, reorder, field changes and sequence
> selection, with a bounded in-memory history (30 steps) and coalesced live
> typing. History is reset on workspace changes and is never applied to
> another project's draft. Editor-scoped Ctrl/Cmd+Z and redo shortcuts do not
> override native text-field editing. Unsaved projects expose only Save project;
> Duplicate remains available for opened saved projects. No changes to
> playback math, physics, IndexedDB schema, project JSON or History records.

> **Animation workspace concurrent recovery (2026-11-16):** Synchronous
> workspace backups are now scoped per browser tab; initial recovery merges
> unrelated tab backups and preserves divergent same-ID unsent drafts as
> independent recovery entries. The existing V2 IndexedDB collection remains
> backward-compatible but is committed through a *single atomic transaction*
> that reconciles only changed workspace IDs against a durable baseline.
> Concurrent edits of different drafts no longer erase one another; same-ID
> conflicts fork the second branch into an independent draft, and stale deletes
> cannot discard newer edits. Tombstones prevent stale backup resurrection.
> Regression tests emulate interleaved IndexedDB transactions, tab-local crash
> recovery, deletion races, and the Studio conflict path. No animation JSON,
> named Library schema, physics or rendering behavior was changed.

> **Contract-aware Studio Snapshot Picker (2026-11-15):** Editing an opened
> v2 project now prefilters the ordinary Picker by its immutable Animation
> Contract after History search/physics filters. An opt-in **Show incompatible**
> reveals unselectable, non-draggable cards with diagnostic paths and **Open
> in History**. Compatible selections survive search changes; stale incompatible
> checks are pruned on render, and programmatic checked/drag insertion remains
> blocked by both Picker and the Studio model. The extra visibility toggle is
> temporary and resets on project switch. V1 Picker behavior and independent
> History/Picker preferences are unchanged. See `docs/modern-animation-contract.md`.

> **Animation wizard usability (2026-11-15):** Step 5 now suggests a
> contextual project name from animation type, reference and physical channel;
> it remains editable, and manual changes are not overwritten. Step 4 uses
> the shared Snapshot Picker's Select all matching / Deselect matching / Clear
> selection controls. Bulk additions only include contract-compatible entries.
> Hidden selections are retained unless explicitly cleared; exceeding the 200-frame
> limit rejects the whole bulk operation. No project format, physics or
> persistent filter state was changed. See `docs/modern-animation-project-wizard.md`.

> **Animation wizard reuses History and Snapshot Picker (2026-11-15):**
> The creation wizard no longer renders separate snapshot galleries. Step 2
> opens the ordinary History panel with a temporary **Use as project reference**
> action (no Restore); Step 4 embeds the shared Snapshot Picker in selection-only
> mode with contract validation, search and physical filters. Ordinary Studio
> Picker preferences and the active editor timeline remain untouched. History
> selection and wizard Picker state are transient; existing v1/v2 persistence
> is unchanged. See `docs/modern-animation-project-wizard.md`.

> **Animation Project creation wizard (2026-11-15):** Animation Library's
> New project opens a five-step v2 wizard for mode, independent reference
> snapshot, supported physical target, optional compatible initial keyframes,
> and metadata. It explicitly backs up the previous draft before saving the
> new project; the old draft remains available. V2 Studio insertions now reject
> incompatible snapshots before changing the timeline. Existing Project v1,
> imports and playback remain unchanged. See
> `docs/modern-animation-project-wizard.md`.

> **Animation Project v2 storage foundation (2026-11-15):** The app now reads
> legacy v1 projects unchanged and version 2 projects with embedded validated
> physical compatibility contracts. A v2 project may hold 0–200 keyframes;
> Experimental stores full snapshots and is not preview/export-ready. Library
> storage, portable JSON, named Save/Save As, Studio open and autosave preserve
> contracts and incomplete projects without any IndexedDB migration. The
> New project now opens the v2 wizard; contract-based filtering inside
> the ordinary Studio Picker is now implemented (see entry above). See
> `docs/modern-animation-contract.md`.

> **Snapshot Picker → History navigation (2026-11-15):** The redundant top-of-Studio
> Choose snapshots button was removed. Every Picker card now has **Open in History**,
> selecting that exact saved record in the History overlay without Restore or
> changing the Animation draft. A temporary focus can bypass History filters
> and collapsed Pinned without changing saved preferences; an explicit Return
> to Animation Studio action is available in History and after a physical
> Restore/edit workflow. No schema or optical algorithm changes.

> **Animation Snapshot Picker filters (2026-11-15):** The docked Picker reuses
> History's pure active-physics search for name/notes/physics, Scene/Compare,
> Globe/Flat, atmosphere and Compare-only A/B geometry/refraction relations.
> Picker preferences are browser-local and independent of History filters.
> Multi-select survives filtering: adding or dragging a checked record includes
> other selected records hidden by filters, in pinned-first order. Selection
> counts show hidden items; Clear filters preserves checks and Clear selected
> discards them. The History archive, IndexedDB schema, experiment JSON,
> Animation draft ownership and physics were not changed. See
> `docs/modern-experiment-history.md` for usage and browser checks.

> **Spline Animation stage-5 closure (2026-11-13):** Camera-only Spline math,
> Linear/Spline Preview selection, autosaved drafts/Library/JSON persistence,
> shared Preview/PNG/WebM/MP4 camera sampling, short-video endpoint behavior
> and inactive-in-Spline keyframe Easing are complete. Final automated gate:
> 1412/1412 tests on the audited baseline. Opera visual/codec/pixel acceptance
> was deliberately not run and is not claimed. See
> `docs/modern-camera-interpolation.md#spline-animation-stage-5-closure-2026-11-13`
> for supported workflow, evidence, caps and known limitations. Documentation
> closure changes no runtime, optical model, renderer or storage format.

> **Modern status presentation (2026-11-13, second integration):** Shared
> `ModernStatusMessage` styling now covers History, Snapshot save, Animation
> Library including JSON import/export errors, working-session persistence,
> preferences, camera sequence/positions, Demos and Scene/Compare rendering
> diagnostics, in addition to Animation Studio and offline PNG/video exports.
> A renderer exception is an error; nonzero unresolved-ray counts are warnings.
> Light status cards remain legible on dark viewport footers, and routine
> progress is subdued. No optics, storage schema or Legacy runtime changes.
> See `docs/modern-status-messages.md`.

> **Saved card details (2026-11-13):** History snapshots, shortlist, picker,
> timeline keyframes and Animation Library projects share a click-only `ⓘ`
> inspector. Hover cannot obstruct drag/drop; click outside, Escape and
> dragstart close the panel. No storage or physics changes.

> **Animation Studio spline foundation (2026-11-13):** Camera-only Animation
> Projects now accept an optional `interpolation: "spline"`, implemented as a
> bounded, timing-aware cubic Hermite camera sampler. Existing projects lacking
> the field retain Linear / per-frame easing semantics. The draft and
> checkpoint models preserve the choice; physical-channel animation, Legacy,
> live optics, and the separate Camera Animation panel are unchanged.
> Preview now offers the Linear / Smooth · Spline switch; see
> `docs/modern-camera-interpolation.md` for export and persistence guarantees.

> **History thumbnail correction (2026-11-08):** The physical painter
> calls `clearRect`, leaving pixels transparent. The main Modern viewport
> appears white via CSS, but History previously copied only the transparent
> pixels, exposing its navy card background. The composer now adds the same
> white backdrop before physical and guide layers in Scene and both Compare
> viewports. Gallery cards and enlarged previews also use white behind old
> alpha thumbnails; already encoded opaque-blue thumbnails require recapture.
> This changes only image presentation, not optics, experiment JSON or IndexedDB.

> **Current Modern UI consistency (2026-11-08):** Scene/Compare now use
> compact contextual help instead of repeated paragraphs around the Compare
> model editor and redraw controls. The selected Compare model's actual
> surface/radius and atmosphere are shown in a live read-only summary; the
> Camera Navigation header reports current speeds. Tooltips stay within the
> mobile viewport, and tiny screens stack cramped editing fields. Existing
> input IDs, experiment schema, application/workspace preferences, physics,
> ray tracing and rendering paths are not modified. See README.

> **Current Objects UI cleanup (2026-11-08):** The Modern Scene/Compare
> Objects editor retains both shared physical groups and all original object
> fields/handlers. Frequently edited geometry stays visible, with offset/size
> variation controls inside nested foldouts and a count/type summary for each
> group. All foldouts persist independently for Scene and Compare via existing
> browser-local workspace preferences; no physical model, optics or experiment
> format changes were made. Tooltip help replaces the persistent group note.
> Automated tests cover object edits, presets and preference normalization.

> **Current Surface / Atmosphere UI cleanup (2026-11-08):** Scene and
> Compare group surface curvature/radius, atmospheric profile inputs,
> model equations, visibility/haze and turbulence into browser-persistent
> native details sections. Physics model selection and active validity
> caveats stay outside the collapsible groups. Selected A/B model summaries,
> active effects and existing parameter IDs are preserved. Layout preferences
> remain independent of all physical experiment JSON and optical paths.
> Full code/tests and patch validation apply to the current branch.

> **Current UI cleanup (#140.12.112, 2026-11-08):** Modern Scene/Compare
> Display retains immediate access to optical quality, Fast Preview LOD,
> geometry backend and reference lines. Explanatory paragraphs moved to the
> existing accessible `?` hints. Advanced settings and nested Diagnostics
> (GPU probe / Render profiler) use native collapsible panels whose state
> persists as browser-local Application Preferences, independent of experiment
> JSON. Recording remains indicated in collapsed Diagnostics; actionable
> optical/backend errors stay outside collapsed sections. All existing
> control IDs, rendering and profiling actions are preserved. See README.

> **Current update — inverse atmosphere performance checkpoint (#140.12.100,
> 2026-11-07):** The #140.12.99 prepared-gradient optimization is accepted as
> the working baseline. User-observed Opera B optics times for 200 towers:
> 647 ms at 100% and 2462 ms at 50%; 100% was 9050 ms before optimization.
> Remaining performance investigations are deferred (low priority) in
> `docs/inverse-temperature-modern.md`. This checkpoint changes documentation
> only, not the physics engine, UI, or experiment format. Historical entries
> below are retained unchanged.

> **Current branch update #140.12.74 (2026-11-04):** Standalone WebGPU optics
> experiments and the Modern CPU optics research panel have been retired from
> the main tree. The full pre-removal state is meant to be preserved using the
> annotated `optics-research-archive-2026-11` tag on #140.12.73. Production
> CPU RK4 fused-gradient, WebGL2, Legacy, Scene/Compare and user-saved experiment
> configurations remain. All older notes below describe historical versions;
> see `docs/research-archive.md` for the current boundary and tag instructions.

## Patch 140.12.47 — Lazy hybrid shooting / attributed hot frame A/B (2026-11-01)

- Explicit-only `shootingOptimization: 'conformal-hybrid'`: the cheap standard Globe RK4 shooting predictor runs first; only a failed predictor invokes a lazy conformal candidate, which is *again integrated and certified* by unchanged RK4. Original angular bracket and strict ground-contact classification remain final authorities. Standard production default, nonstandard profiles, Flat, vacuum, and painter are unchanged.
- Optional per-stage RK4-call, evaluation and timing instrumentation; separate on-demand conformal prediction time and acceptance/fallback counters. No default instrumentation overhead without explicit `profileShootingStages`.
- Modern Compare **Audit lazy hybrid shooting · baseline / hybrid / conformal · 8 hot frames · ZIP** renders three actual independently recomputed physical Canvas frames per round, rotates order, exports JSON with all stage timing/count medians and real PNGs with pixel-difference maps. Strict last-frame pixel parity and structural counts reported independently; this is not a physical multipath proof or production promotion.
- Local 100-target sweeps showed the cheap standard predictor almost always succeeded (98/100), with zero late conformal acceptances on two difficult ground cases; a faster full frame is NOT assumed. See `docs/cpu-hybrid-shooting.md`. Browser export needs user verification if local Chromium navigation is blocked. No WGSL changes or new tools HTML page.

## Patch 140.12.45 — Guarded CPU conformal production shooting + frame parity (2026-11-01)

- Explicit-only `shootingOptimization: 'conformal-experimental'` enables adaptive Richardson conformal **angle candidates** for standard Globe / positive observer height. Disabled by default in ordinary Scene and Compare. Custom, Flat, vacuum and engineered atmospheres are not enabled. Candidate implementation is shared with the #140.12.44 benchmark via `src/optics/OpticalConformalPredictor.js`.
- `OpticalSharedRayField.exact()` can supply the candidate via the existing `shootingWarmStartAngle` input to the **unchanged** `OpticalTargetProjection.solve()`. Strict forward-x RK4 endpoint residual, first ground contact, status and fallback remain authoritative. Candidate creation failures fall back to prior shooting. Statistics expose attempts, accepted warm starts, fallback count, gradient calls, chosen steps and candidate overhead.
- Modern Compare provides an OFF-by-default experimental Compare B checkbox. The setting participates in the physical-scene cache key and cache is cleared when toggled. Do not combine it with a GPU-seeded B frame. The separate `Audit full Canvas frames` action renders the **same actual Compare A Globe model** independently into the A/B Canvas painter with separate cold optical sessions, baseline and opt-in. Exports real `baseline-real-frame.png`, `conformal-real-frame.png`, `pixel-difference.png`, `results.json`, `README.txt` in one automatic ZIP; JSON reports actual pixel channel changes, contour/fill/unresolved counts, predictor acceptance and timings. Times are *single cold frames*, not medians.
- The test is scoped to one current camera and authored scene. Matching pixels does not prove global multipath, hidden-object correctness, or all atmospheric situations. The Canvas painter's known overlapping-mesh Z-order limitation is unchanged; this patch does not introduce a Z buffer.
- No numbered HTML tools pages, WebGPU shader changes or changes to normal default production shooting. Browser end-to-end ZIP capture must be verified on a permissive browser environment if local Chromium navigation is blocked.

## Patch 140.12.41.1 — WGSL reserved identifier hotfix (2026-10-31)

- Fixed actual user-reported WebGPU shader compilation error from #140.12.41: WGSL reserves `final`, which had been used as a `Shot` struct field and twice in member access. Renamed this field consistently to `endState` in `src/diagnostics/CurvatureGpuDsRk4Shooting141241.js`. No numerical or rendering algorithm changes.
- Added a shader-source regression test to catch the exact reserved-word failure that JavaScript syntax tests missed. Real WebGPU shader validation/compilation remains required on the user's adapter; the test checks text, not the WGSL grammar.
- The existing #140.12.41 button and success/error ZIP output names are intentionally unchanged; this is a minimal follow-up fix.

## Patch 140.12.41 — Independent GPU double-single RK4 shooting and ground-event audit (2026-10-31)

- Added `CurvatureGpuDsRk4Shooting141241.js`: **separate** WGSL classic-double-single port of tangent-frame `[x,z,vx,vz]` RK4 and first-forward-x target shooting, with angular bracket/regula falsi and fixed-x endpoint correction. Uses a sampled DS first-ground crossing/grazing detector and endpoint ground uncertainty. The old Bouguer #140.12.32 solver is untouched. Input direct-angle seeds are **not CPU solved angles**.
- Added `CurvatureGpuDsRk4Audit141241.js` and an opt-in Modern Compare button to run the 48 original physical points from #140.12.40 with independent CPU f64 reference. ZIP contains JSON, a real CPU Canvas screenshot, clearly labeled **sample-only** GPU/CPU point maps, status-error map, timing visualization, README; failure produces an error ZIP.
- All output failures and indeterminate contacts are fail-closed. A 48-point sample match does not authorize replacing the production CPU painter: no full-frame DS reconstruction, no adaptive query scheduling, no cross-platform DS precision guarantee and no general multipath certification.
- Exact scope and verification limitations: `docs/gpu-ds-rk4-shooting.md`. Canonical `tools/webgpu-optics.html`, production CPU/GPU paths and painting remain unchanged. A real WebGPU runtime check is required for generated WGSL, in addition to Node/structural tests.

## Patch 140.12.40 — GPU DS real-scene painter-equivalence feasibility gate (2026-10-31)

- Added Modern Compare **Audit CPU f64 vs GPU DS · real-scene shooting gate · PNG + JSON ZIP** action. It samples 48 deterministic physically authored tower/foundation edge targets from the active Globe scene and compares existing DS radial Bouguer shooting (256/512 quadrature nodes) with CPU f64 RK4 shooting on the **same** targets, reporting angle and pixel-space displacement, candidate visibility disagreements, GPU compile/dispatch+readback vs CPU solver timing, source-lineage metadata, and an actual CPU Canvas reference screenshot alongside correctly labeled ray-only PNGs.
- **Not a CPU-equivalent GPU DS renderer:** the existing #140.12.32 DS solver uses Bouguer quadrature rather than the reference RK4/bracket/contact algorithm; GPU visibility is uncertified and cannot be injected into the adaptive painter. A real `gpu-ds.png` full frame / image difference / 64–4096-target performance ladder is explicitly marked unsupported rather than fabricated. See `docs/gpu-ds-cpu-painter-gate.md`.
- Existing production CPU/GPU renderer, optics, painter, WGSL and canonical `tools/webgpu-optics.html` remain unchanged. No new standalone HTML page was added.

## Patch 140.12.37 — Source-linked optical geometry differences (2026-10-31)
- Extended the existing single Compare diagnostic button / ZIP export, preserving all 44 #140.12.36 PNGs and numerical JSON. Added eight CPU/GPU geometry-edge PNGs and four physical rejected-query trace JSONs (one per camera). The new ZIP is `curvature-compare-140.12.37-geometry-attribution.zip`.
- Opt-in pre-painter captures of projected physical fill triangles / outline segments, mapped to authored `(objectLayer, opticalSourceIndex)`. Per-source counts and angular-vertex signatures (~2e-6 rad resolution) are a **diagnostic proxy**, not proof of missing triangle sets or causal pixel contribution. Per-source screen edge bounding boxes link candidates to the 4x3 difference-tile grid (correlation only).
- Opt-in rejected-leaf hooks report physical sample coordinates and status/reasons for outlines/fills, with explicit `fieldQueried` distinction. Exported sample details limited to 500 rejected leaves per render; per-source counts unbounded. No f32/DS/shooting/rasterizer policy changed. Browser WebGPU still requires a user run. See `docs/gpu-geometry-difference-attribution.md`.


## Patch 140.12.36 — Visual ZIP attribution (2026-10-31)
- The #140.12.35 algorithm attribution action now downloads a single `curvature-compare-140.12.36-visual-attribution.zip` containing the full numerical JSON and 44 PNG snapshots (four camera views × CPU, three GPU variants, three overlays, three CPU/GPU difference maps, and one baseline/direct difference map). Frames are taken from the same RGBA snapshots used by the pixel metrics; no rerendering or GPU changes. Difference colors are occupancy proxies, not physical sky/terrain labels.
- A small browser-side PNG exporter and the existing ZIP writer are reused. No new versioned HTML tools page was created. Browser WebGPU end-to-end ZIP export remains unverified here.
## Patch 140.12.35 — Algorithmic error attribution (research, 2026-10-31)

- Added opt-in Compare action **Audit algorithm attribution · baseline / strict / direct GPU**, automatically exporting `curvature-compare-140.12.35-algorithm-attribution.json`. One 4096-ray scene-derived f32 predictor grid is reused across three real Canvas B variants for four fixed camera views. `baseline` retains nearest-weight visibility selection, `strict` reports mixed/invalid/out-of-domain responses as indeterminate (angle unchanged), and `strictDirect` replaces up to 192 exact original B renderer query coordinates with independent direct GPU f32 predictor results. No CPU-guided GPU sampling and no production changes.
- Independently compare each variant with repeated cold CPU A reference images. Only *after* all GPU variants, solve the same selected renderer target coordinates with CPU f64 to report separate grid-vs-CPU and direct-GPU-vs-CPU status confusion, robust mismatches, camera-pixel angular offsets on status-agreed rays, renderer contour counts and **fillUnresolved**. Results are not additive causal contributions because changed statuses change adaptive geometry queries; an unknown/blocked status is not silently promoted to visible.
- The existing 48-ray DS GPU shooting is **not** integrated into these frames. Tests include a 2×2 synthetic discontinuity and an actual physical scene transform using strict GPU field. No new WGSL; browser WebGPU execution of the new experiment remains to be verified. See `docs/gpu-algorithm-attribution.md`.

## Patch 140.12.33 — Actual-camera pixel-space GPU DS shooting samples (2026-10-31)

- Added Compare action **Audit pixel-space DS shooting · real Compare camera**, with automatic `curvature-compare-140.12.33-pixel-space-audit.json` export. It runs the unchanged independent 48-target GPU DS shooting (256/512 nodes), independent post-GPU CPU f64 RK4 shooting and Bouguer f64 2048-node root, then measures physical camera launch-ray differences in actual Compare A Canvas backing-store pixels. Camera/graph/viewport changes during execution invalidate the report; pixel projection is independently checked against the existing physical painter with nonzero pan, tilt and roll.
- The primary metrics are projected GPU-vs-CPU RK4 displacement in pixels (max, average, RMS, p95, >0.5 px, >1 px), discrete sampled pixel-cell/row occupancy differences, field-of-view coverage and clear/blocked/uncertain classifications. The CPU Bouguer root is an additional separate error diagnostic. Ground contacts within 1 cm remain uncertain, not certified.
- **Strict scope:** the underlying GPU program provides 48 isolated meridian rays, not a GPU-painted frame. No actual full-frame image pixel diff, 2D silhouette or renderer accuracy is established. JSON explicitly sets `actualRenderedImageCompared:false` and `fullFramePixelParityEstablished:false`; the report cannot authorize production promotion. See `docs/gpu-pixel-space-audit.md`. No changed physics, DS WGSL, production shooting or painting, or versioned HTML tools.

## Patch 140.12.30 — GPU Bouguer target-polar precision recheck (2026-10-31)

- Added Compare action **Audit Bouguer precision · f32 d/R vs double-single**, exporting `curvature-compare-140.12.30-bouguer-precision.json`. One independently shot batch of 48 original Globe/standard targets is reused across four GPU variants. The original #140.12.27 256-node Bouguer shader is the unchanged f32 control; three new shaders replace only the target-angle evaluation with direct f32 `d/R` or classic/integer-residual double-single `d/R`. DS low target-angle limbs participate in the final surface margin. No GPU integrand, refraction, RK4, shooting, visibility, or production paint path was changed.
- The independent CPU f64 2048-node invariant reference, 256-node convergence diagnostic and same-angle CPU f64 RK4 replay run **only after** all GPU submissions, preserving the #140.12.27 event/source analysis and allowing target-angle-versus-ground-angle error decomposition. Reports per-mode 48-row comparisons, contact sign mismatches, absolute margin differences, ground-angle invariance, and separate near-surface cases. Numerical results and actual WGSL compilation require a browser/WebGPU run; the new DS modes are not f64, error-bounded, or visibility-certified.
- Added numerical, shader contract, mock WebGPU, lifecycle, CPU-vs-GPU ordering, and UI/export tests. See `docs/gpu-bouguer-precision.md`.

## Patch 140.12.29 — Independent WebGPU Globe/Flat precision geometry and input-split audit (2026-10-31)

- Added Compare action **Audit GPU precision geometry · Globe / Flat / hi+lo inputs**; it exports `curvature-compare-140.12.29-gpu-precision-geometry.json` without changing production shooting, ground contact, atmosphere or painting. Three real WebGPU compute pipelines reuse the exact #140.12.28 f32, classic double-single and integer-residual double-single arithmetic helper implementations and report per-mode errors and warmed dispatch/readback timings on 48 fixed distance/altitude targets.
- The Globe probe uses actual `CurvatureSurfaceGeometry.surfacePoint2(d,h)` Cartesian coordinates and compares the #140.12.27 normalized f32 `atan2` baseline against high-precision direct `d/R` and an independently calculated Cartesian `atan(x/(R+y))` with a bounded small-positive-angle polynomial. CPU f64 references are evaluated independently for the exact arc angle and the Cartesian coordinate calculation; the report separates any source-geometry difference.
- Distinguishes constructing `R+h` from separately packed hi/lo radius and local height from packing `R+h` as a large absolute coordinate **before** transmission; repeats the comparison for Flat global-to-local distance with 15,000,000.125 m origin. This isolates original-input two-limb quantization (including the observed 0.1 m / ~1.86 nm case) from GPU cancellation. Both GPU modes remain non-certified and bounded, NOT binary64.
- New tests cover source packing, separate genuine geometry paths, shader contract, CPU reference, mock GPU readback, resource release and UI/JSON integration. **Actual WebGPU WGSL compilation and numeric results still require the user's browser export.** See `docs/gpu-precision-geometry.md`.

## Patch 140.12.26 — Fixed GPU-angle ground contact vs independent f64 (2026-10-31)

- Added **Audit GPU ground crossing · same-angle f64 replay** in Compare, exporting `curvature-compare-140.12.26-gpu-ground-contact.json`. The GPU predictor first solves the established fixed 48-point geometry ladder at 5-mm tolerance. Only its own 48 angles are used for subsequent fixed-angle GPU replay; missing angles fail closed rather than importing CPU-derived guesses.
- The opt-in, separate WebGPU shader uses the same compensated RK4 and stable local altitude as the independent shooting shader, replays each GPU angle without shooting, and records first sampled signed-altitude crossing, first within-tolerance proximity, first negative sample, minimum sampled altitude, endpoint altitude/residual and signed bracket evidence. Three controlled runs isolate event-substep density and integration step: 500 m / 8, 500 m / 16, and 50 m / 8. No shader or result-contract changes to the regular GPU shooting path.
- **After all GPU batches**, the CPU f64 first-forward-x shooting oracle is computed separately, and `OpticalRayTracer.trace` independently replays every actual GPU angle to the same *GPU replay path length* for each of the three step/substep settings. The JSON retains the six surface/1-micrometre targets at 60, 350 and 1250 m in a dedicated `nearSurfaceCases` section, plus all 144 mode/target rows and contact/endpoint comparisons. CPU trace length agrees with GPU length by design; CPU trace is not an x-terminated endpoint solver, and the report records its x error.
- Sampled f32 crossing/proximity are not equivalent to CPU grazing/minimum detection. A near-terminal contact, contact mismatch or an apparently clear f32 sample **never certifies visibility** or automatically changes `visible`, `blocked` or `indeterminate`. No CPU fallback, repaint, frame logic, or production authorization. Actual WGSL compilation/execution remains to be measured in a WebGPU browser.

## Patch 140.12.25 — Precision-limited f32 shooting candidates / trace ring integrity (2026-10-30)

- Opt-in Compare action **Audit GPU precision-limited shooting · candidate vs CPU** exports `curvature-compare-140.12.25-gpu-precision-limit.json`. The same fixed 48-target ladder compares 5-mm predictor, strict predictor, strict residual-stop sweep, strict angle-bracket sweep and experimental **precision-aware sweep**. GPU batches run first, independent CPU f64 reference afterward; no frame painting, CPU shooting fallback or production switch.
- The new isolated `precision-aware` WGSL refinement retains the lowest-absolute-residual `f32` angle among the initial bracket endpoints and validated midpoint evaluations. It stops at a nonrepresentable midpoint or an approximately 2-ULP interval with no improvement, and independently integrates the candidate with first-ground-event sampling. Targets still outside the 0.1-mm residual tolerance get **raw diagnostic status 4** (`precision_limited`) only if the representability floor was reached. The standard validated batch contract **decodes status 4 as `solver_failed` with null angle**. A separate telemetry object preserves the uncertified candidate angle, residual, ground contact, and endpoint distance for audit. Never treat status 4 or near-endpoint contact as proof of visibility.
- Corrected the *trace-only* strict bracket shader: ring slots are now overwritten with sentinels at the beginning of each iteration, including early break paths. Previously `usedIterations` could count a break before recording a sample, causing an older wrapped trace entry to be decoded as a newer step. This explains apparent giant bracket widening at iteration 21 in the #140.12.24 report; no production bracket math was changed. The new report measures width-monotonicity violations from only valid trace entries.
- All new functionality is diagnostic and opt-in. WebGPU WGSL runtime validation still requires a real browser. Retain CPU and existing GPU renderer defaults until measured parity, contour fidelity, first-contact classification and end-to-end performance are established.

## Patch 140.12.24 — GPU f32 numerical floor / last-iteration audit (2026-10-30)

- Added opt-in **Audit GPU f32 numerical floor · last 12 iterations** to Compare and exports `curvature-compare-140.12.24-gpu-numerical-floor.json`. It uses the existing 48-target physical ladder, retains standard 5-mm predictor and three strict 0.1-mm modes, and runs the independent CPU f64 comparison **only after** all GPU batches. No default renderer, GPU status, angles or CPU fallback are changed.
- Only the opt-in diagnostic refinement shaders write a bounded 12-iteration ring per target (angle, target-vertical residual, bracket width and an alternate **surface-relative local-altitude residual**), with explicit storage/readback allocated only when `traceRefinement: true`. This captures the last attempted refinement steps without retaining all 28 iterations or altering the previous GPU shader variants.
- Summaries distinguish missing brackets, exhausted refinement, repeated f32 angles, unchanged residuals across changing angles, and bracket widths measured in local f32 ULPs. A possible numerical precision floor is **only a hypothesis label**, not proof of convergence or reason to upgrade an indeterminate/failed ray. The alternate residual uses local altitude and may itself be affected by terminal horizontal error; it is not an f64 oracle or proof of higher precision.
- Benchmark timing for trace-enabled batches includes the extra GPU-to-CPU readback and is not directly comparable to the non-trace performance measurements. Actual WGSL compilation and optical measurements must be made on real browser WebGPU hardware.

## Patch 140.12.22 — GPU f32 near-surface precision ladder (2026-10-30)

- Added an **opt-in, diagnostic-only** Compare button `Audit GPU f32 precision · surface / upper towers`; no graphics, production changes, pixel substitution or CPU shooting fallback. JSON: `curvature-compare-140.12.22-gpu-f32-precision.json`.
- Uses 48 geometry-derived targets at six near distances (60–5400 m) and eight altitudes (0, 1 µm, 1 cm, 10 cm, 1, 5, 20, 50 m). GPU predictor compares standard atmosphere 500 m/5 mm tolerance (control), 500 m/0.1 mm tolerance, 50 m/5 mm tolerance, and vacuum 500 m/5 mm. CPU f64 references for standard/vacuum run **after all GPU batches**.
- Reports status disagreements, ground-contact evidence and contact proximity to endpoint (diagnostic 25 cm threshold only, **not** an override), angular errors including separate high-tower heights, and local f32 coordinate round-trip height error. No renderer repaint or code-path promotion.
- Motivation: #140.12.21 diagnostic found 54 near-surface uncertain first-ground contacts, none resolved by 500→50 m RK4. Existing WGSL uses rationalized local altitude rather than subtracting the 6371 km radius, so the audit separates a loose 5 mm target residual from integration step and atmosphere instead of guessing a radius cancellation problem. A target marked indeterminate is never automatically made visible.

## Patch 140.11 — Independent GPU shooting architecture and diagnostic batch contract (2026-10-30)

- Inspected current source call chain: `OpticalTargetProjection.solve` ->
  `OpticalSharedRayField.sample/exact` -> recursive tower silhouette, polygon
  fills and ground guides -> synchronous `CurvaturePhysicalSceneOptics.transform`
  -> `CurvatureMainCanvasRenderer.renderPhysical` -> Scene/Compare redraw.
  **A simple GPU `solveBatch` drop-in is NOT possible today:** the scene and
  field are synchronous and generate new target queries adaptively.
- Added diagnostic-only `src/diagnostics/CurvatureOpticalBatchContract1411.js`
  with a fail-closed first-forward-x batch schema, actual CPU scalar-solver
  reference adapter (`solveCpuBatch`, Promise-shaped), structural first-ground-
  event evidence validation and result comparison. It is **not** a GPU solver,
  nonblocking CPU worker, production path, or new UI. Focused contract tests
  guard target order, Flat/Globe oracle parity, invalid inputs and current
  synchronous integration boundary.
- Defined a separately proposed GPU **parallel angle search + GPU root/event
  classification**, rather than GPU warm starts re-solved on CPU; subsequent
  wavefront/batch scene integration would need new async orchestration,
  generation cancellation and per-configuration caching. See
  `docs/webgpu-batch-shooting-architecture.md` for interfaces, source
  points, precise limitations and prospective numerical/performance gates.
- #140.10 `SCENE_PERFORMANCE_STOP` stays **CLOSED / PARKED**; #140.11 is
  an authorized design exploration, not a production promotion or automatic
  launch of #140.12. CPU optics, Canvas/WebGL2 geometry selection and Modern
  Scene/Compare defaults remain unchanged.
- **Persistent UI rule:** no new `tools/` HTML per GPU experiment. Use the
  existing `tools/webgpu-optics.html` with experiment selection. JS tests
  cannot substitute for browser WGSL compilation and actual GPU validation.

## Patch 140.9.1 — Final bounded f32 precision diagnosis (2026-10-30)

The user-supplied #140.9 Opera/Intel Gen-12LP export measured 18/18 scenarios,
with 10 passing and all 8 long (100-km) cases exceeding the 0.1-m position
tolerance; Vacuum long had a 2.647-m discrepancy with essentially no angular
drift. An opt-in `accumulation: 'compensated'` GPU shader now evaluates RK4
increments before compensated f32 position accumulation while retaining the
original shader as the unmodified default. A Vacuum f64 analytic straight-line
reference separates CPU RK4 error from GPU drift. A browser-only 18-pair
(36-run) diagnostic and hard stop gates are at `tools/webgpu-optics.html`
and `docs/webgpu-optical-precision-followup.md`.
**No real WebGPU result for this correction is available yet.** If the fixed
numerical/performance gates are met, stop isolated RK4 experiments and allow
at most one real-scene integration spike. If not, stop this f32 GPU branch.
Production optics and renderer defaults remain unchanged.

## Patch 140.9 — Finite WebGPU optical qualification and stop gate (2026-10-30)

Added a standalone, opt-in 18-case browser matrix at
`tools/webgpu-optics.html` built on the unchanged #140.8 RK4 benchmark.
All four atmospheres × Flat/Globe are tested at 12.8 km and 100 km
mathematical path lengths; Standard/Flat small and large batches provide two
additional scaling probes. Exports per-case CPU/GPU timings, f32-vs-f64
numerical gates, unavailable/errors and an explicit `INCONCLUSIVE`,
`NUMERICAL_STOP`, `PERFORMANCE_STOP` or `SPIKE_CANDIDATE` recommendation.
Even a passing result permits only **one bounded real-scene integration spike**,
not a GPU production switch. Explicit end-to-end correctness/performance and
one-correction stop rules are documented at
`docs/webgpu-optical-qualification-matrix.md`.
No production solver/rendering defaults have changed; real browser hardware
matrix results are still required.

## Patch 140.8 — Isolated WebGPU optical RK4 batch benchmark (2026-10-30)

- Added a standalone browser-only GPU/CPU fixed-step ray integration experiment at
  `tools/webgpu-optics.html`, with implementation at
  `src/diagnostics/CurvatureWebGPUOpticsBenchmark.js`.
- Tests WebGPU `f32` RK4 on independent rays against the **production CPU f64
  stepper** with matching f32-quantized initial vectors; supports Flat/Globe,
  vacuum, standard and two engineered refractive profiles. Exports measured
  sample timing and fail-closed position/angle deviation gates to JSON.
- GPU timing includes input uploads, compute and full readback; device and
  pipeline initialization are timed separately. It is **not** a full shooting
  solver or a production integration. Hardware acceleration not asserted.
- Added seven focused Node tests (including a mock GPU host path); real WGSL
  compilation and GPU parity require an actual browser GPU adapter.
- Production shooting, geometry, profile and UI defaults are unchanged.
  See `docs/webgpu-optical-rk4-benchmark.md`.

## Patch 140.7 — Forward-x shooting bracket boundary repair (2026-10-30)

Fixed the production bracket-first shooter's near-vertical first probe: an
oversized initial angular step is reduced only when it would leave the
solver's forward-x domain, and later steps are capped inside that domain.
Previously valid probes, RK4 integration, collision classification, and
Scene/Compare predictor defaults are unchanged. The 16 historical near-eye
failures are now resolved, independently cross-checked where the Flat
monotone Snell invariant applies. Repeating the complete #140.5 matrix gave
**1064/1064** ray cases, **3600/3600** warm-start sequence checks, and
**72/72** full scene pairs, including formerly divergent nonmetric guides.
These are finite-sample CPU qualifications, **not** proof of global ray-branch
completeness or approval for default predictor promotion. See
`docs/engineered-shooting-bracket-repair.md`. The two HTML entry points
now version the changed optical script to avoid stale browser caches.

## Patch 140.6 — Short-range shooting bracket and branch diagnostics (2026-10-30)

Diagnosed all 16 near-observer `solver_failed` baseline cases from #140.5 as
oversized first bracket probes crossing the forward-x angle bound. An offline
short-range diagnostic reuses the unchanged bracket-first solver with a bounded
`initialSpan`, checks RK4-step convergence and predictor agreement, and compares
Flat trajectories against an independent Snell invariant (closed-form for the
exponential atmosphere; quadrature for inverse-spherical). All 16 cases were
locally recovered and 56/56 near-eye cases passed these local checks, but
no Globe analytic branch oracle or global multipath certification is claimed.
**No production solver defaults or rendering are changed.**
See `docs/engineered-short-range-branch.md`.

## Patch 140.5 — Expanded engineered-shooting numerical qualification (2026-10-30)

Added offline near-horizon/near-eye target grids, reduced-step numerical
cross-checks, active warm-start sequences and 2/10/85-tower paired scene
comparisons for both modern metric and older nonmetric guides. A wider matrix
revealed an unqualified short-range reference-solver failure (candidate solves)
and mismatched old nonmetric radial guide interpolation at half comparison
radius, while modern physical metric scenes matched. Results are reported
**fail-closed**: the engineered optimization remains offline-only and cannot
be automatically promoted; no production changes or GPU compute were made.
See `docs/engineered-optical-qualification.md`.

## Patch 140.4 — Opt-in engineered shooting qualification (2026-10-29)

Diagnosed why #140.3 reports zero predictor/warm-start attempts for engineered
atmospheres: these shortcuts are intentionally limited to the standard model.
An offline-only opt-in `shootingOptimization: 'engineered-experimental'` now
allows the existing integrated/verified CPU predictor and same-distance warm
starts to be tested for the built-in exponential and inverse-spherical models;
ordinary physical scene rendering remains bracket-first, unchanged. Added
paired full-scene benchmark with topology/visibility/coordinate comparisons,
near-grazing numerical regression tests, and an explicit no-default-promotion
decision gate. This is **not** GPU compute or production certification. See
`docs/engineered-optical-shooting.md`.

## Patch 140.3 — Cold/Warm optical profiling (2026-10-29)

Added explicit cold and warm optical benchmark redraws to the Modern Display
profiler. Cold invalidates **only** the affected optical projection cache
(Scene or independent Compare A/B session) immediately before transformation;
warm requests preserve caches. The profile separates *actual* fresh builds and
warm hits, excludes misses, and exports existing field/ground/outline/fill
stage times, target solves, shooting evaluations and RK4 steps. Normal redraws,
model state, tracing numerics and visual backends remain unchanged. See
`docs/modern-optical-profiling.md` for the test protocol and caveats.

## Patch 140.1.2 — Render profiler API compatibility and cache refresh (2026-10-29)

The browser error `renderProfiler.setEnabled is not a function` is consistent with a
stale `ModernRenderProfiler.js` resource: unlike `ModernApp.js`, it lacked a
versioned URL. Both entry points now carry `?v=140.1.2`. The UI checks the
required profiler API before binding controls and shows a reload instruction
instead of throwing if an incompatible script is still loaded. No physics,
Canvas or GPU backend behavior was changed.

## Patch 140.1.1 — Profiler recording controls (2026-10-29)

Separate Start recording and Stop recording controls were provided in Display.
The recording status is displayed explicitly, and the Stop control is enabled only while recording.
The modern script query version was incremented to prevent stale cached event handlers.
No optics, scene rendering backend, or GPU processing behavior was changed.

## Patch 140.1 — Scene, Canvas and WebGL render profiling (2026-10-29)

The existing bounded CPU physical-stage and Scene/Compare redraw profiler is
now exposed in Display with Start/Stop recording, a median/p95 summary, Clear,
and JSON export. Opt-in Atmospheric Shimmer instrumentation records JavaScript
texture-upload/command-submission wall time, and, *only* when supported, nonblocking
`EXT_disjoint_timer_query` WebGL GPU draw execution. Stale-generation/disjoint
queries are excluded; absent GPU timings are reported as unknown. The scene
backend remains Canvas 2D and optics/painter output is unchanged. See
`docs/modern-render-performance.md` for browser protocol and caveats.

## Patch 138.3 — UI controls for atmospheric turbulence (2026-10-29)

Added visual-only Atmospheric Turbulence switches, Intensity/Eddy scale/Drift
sliders and Pause/Resume to Scene and selected Compare A/B atmosphere panels.
Scene/A/B have independent shader parameters and freeze states; only toggling
On/Off causes a cached physical repaint to separate/restore canvas captions.
Parameter edits and pause/resume do not retrace rays or upload scene textures.
A per-view elapsed-time clock prevents a pause/resume phase jump. Shimmer is
OFF by default and not serialized with physical experiment state. See
`docs/modern-atmospheric-ui.md` for browser checks and limitations.

## Patch 138.1 — optional atmospheric presentation boundary (2026-10-29)

Added disabled-by-default Scene/A/B presentation slots, capturing physical
Canvas pixels before eye-level/horizon annotations; diagnostic overlays remain
separate and sharp when the optional identity compositor is enabled. Camera
CSS preview temporarily exposes the source Canvas; ray tracing and the OFF
path remain unchanged. No shader, physical turbulence model or UI controls yet.
See `docs/modern-atmospheric-presentation.md`.

## Patch 137.4 — Perspective-correct cached raster preview (2026-10-29)

During Scene or Compare camera dragging, an observer-fixed projective homography
now maps the existing Canvas pixels to the shared target Pan/Nick, including
Roll and Scene's aim offset. The shared controller applies CSS `matrix3d`
without re-rendering physical geometry or optics on pointermove; Compare A/B
share the same target angle but use their own viewport dimensions. Large
rotations behind the camera safely fall back to translation. Authoritative
redraw on pointerup, pending-frame guard, compact PNG hand cursors, experiment
serialization and separate A/B optical caches are unchanged. See
`docs/modern-camera-perspective-preview.md` for equations, limitations
and browser checks.

## Patch 137.3 — Single-validated frame handoff (2026-10-29)

The Modern physical Scene and Compare render paths now use an atomic
`renderComposition()` call: one isolated, strictly validated frame snapshot is
passed directly to the shared painter. The public `render(frame)` still fully
revalidates untrusted/modified frames. No physical ray, guide, camera drag or
ordering logic was changed. Paired *synthetic Node* median handoff savings
were ~29–35% for 3653–10000 lines, **not an Opera FPS claim**. See
`docs/modern-camera-redraw-optimization.md` for stage semantics,
benchmarks and browser acceptance.

## Patch 137.2.4 — Compact hand cursors (2026-10-29)

- Open/closed cursor PNG canvases were reduced to 24×24 pixels with the visible hand bounded to approximately 18×20 pixels.
- CSS and JS hotspots were adjusted to (10, 5) and (12, 9); both resource URLs were cache-busted to 137.2.4.
- The shared camera drag, raster preview and optical renderer were not changed.

## Patch 137.2.3 — Smaller camera drag cursors (2026-10-29)

- Both custom hand PNGs were reduced from 48×48 to 32×32 pixels with alpha preserved.
- CSS and JavaScript hotspots were scaled to (11, 5) and (15, 13) respectively.
- Cursor stylesheet/script cache versions were advanced to 137.2.3.
- Camera gesture, preview and physics behavior remain unchanged.

# Curvature optics migration — project state

Updated at compatpatch **128** (2026-10-28), after the first explicit event/visibility contract. Refresh after approximately every 5–10 patches **and** after major architectural decisions. This file is a compact handoff, not a substitute for focused patch documentation.

## Patch 137.2.1 — Camera drag cursor and autoscroll protection (2026-10-29)

- Camera cursors are now applied explicitly to all three canvases as well as
  through the existing CSS classes: `grab` while idle and `grabbing` during
  a gesture, with cursor-host cleanup and previous style restoration.
- The Modern stylesheet URL has a version suffix to avoid stale CSS.
- Middle-click autoscroll is prevented over the camera canvases. The circular
  four-way-arrow cursor observed in Opera may have been Chromium autoscroll;
  this is a strong hypothesis, **not** confirmed by a browser UI test. An
  already active autoscroll mode must be dismissed manually with Esc.
- Gesture preview, physics, persistence, and camera math are unchanged.
- See `docs/modern-camera-drag-autoscroll.md`.

## Patch 137.2 — Cheap Scene/Compare camera drag preview (2026-10-29)

Shared camera drag now moves already-rasterized Canvas pixels via RAF-coalesced
CSS `translate3d` during pointermove; no geometry reconstruction, physical
tracing, or full Canvas redraw occurs until release. Both Compare viewports
move together with normalized displacement, independent of the initiating
viewport. Cursor states are `grab` on hover and `grabbing` during a gesture.
The preview is retained until the authoritative final redraw completes, then
restored in `finally`; cancellation and mode changes restore it immediately.
This is an approximate screen-space preview, not exact perspective remapping.
See `docs/modern-camera-drag-preview.md` for limitations and browser checks.

## Patch 137.1 — Shared final-frame camera drag (2026-10-29)

Primary-pointer drag on the Canvas now controls shared Pan and Nick in Scene and
Compare. The gesture uses the physical diagonal FOV and initiating viewport's
CSS dimensions. Compare A/B always commit one camera and redraw both models.
Only a light Pan/Nick HUD updates while the pointer moves; an authoritative
full redraw occurs **once on release**, not every pointermove. No live image
preview yet (planned for 137.2). Camera aim, optics, compare physics, and save
format are unchanged. See `docs/modern-camera-drag.md` for mapping,
cancellation semantics, limits and test procedure.

## Patch 137 — Modern camera interaction groundwork (2026-10-29)

A shared, pointer-independent camera-gesture controller now exists for Scene and
Compare A/B, and the Modern UI collects bounded renderer-stage and redraw-batch
profiling separately for Scene, A and B. **No drag handlers or fast-preview
rendering are enabled in 137**; existing physical rays and saved experiment
formats are unchanged. Inspect measurements with
`CurvatureModernApp.getRenderProfile()`; see
`docs/modern-camera-interaction-baseline.md` for the contract, timing
limitations, browser measurement procedure and 137.1–137.4 plan.

## Patch 128 — physical continuous-surface verification (2026-10-28)

**Latest verified baseline:** 512 Node tests including 13 new end-to-end tests;
headless Chromium checked Earth, large, near-flat and exact flat with 85+2
towers (0 JS errors, 0 unresolved outlines/fills). Physical object placement
uses one azimuth and metre-based world frame at all curvatures, even when
`showModel = 2` at the slider endpoint; historical Legacy FlatEarth orientation
is unchanged. Physical metric guides now have curvature-independent sampling,
fixed 100 km presentation extent, and only certify a finite optical ground
horizon from a narrow visible/blocked bracket. Solver failures must not be
presented as physically blocked. Original non-metric SHA-256 golden references
remain intact. Local 5-repeat Node benchmark: near-flat `R=10^16 m` changed
from ~154 to ~71 ms median optics and from ~218k to ~40k RK4 calls, but this
is not a frame-rate guarantee. Details and limitations:
`docs/continuous-physical-verification.md`.

## Objective

An independently computed physical comparison of Globe and Flat observations: world geometry + atmospheric refractive index `n(h)` + ray equations + first-hit visibility produce the image, **without hardcoding a horizon law or using the legacy horizon occlusion mask**.

## Current baseline

- **109 atmospheric reliability**: fixed expensive RK4 target shooting (bracketed regula falsi + safeguarded Newton endpoint), qualified long smooth-profile steps against fine-step oracles, removed the default 3.5-second truncation (explicit diagnostic budget still supported), and introduced separate boundary/solver/budget counters and contextual Physical-mode controls. A full 85+2 Standard scene test retains both banks with 3560 visible pieces, 130 narrow boundary leaves and **no** solver/sample-budget failures. True polygon fills, refracted guides, asynchronous work and global error guarantees are not yet provided. See `docs/migration-atmospheric-scene-reliability.md`.

- **108 architecture correction**: the main Physical path no longer uses a separate Canvas painter; its backend `CurvaturePhysicalSceneOptics` transforms the same independent `CurvatureGeometryEngine` scene contract into ray-arrival line primitives and hands it to the existing `CurvatureFrameRenderer` painter, with the existing camera, style and decorations. `composeOpticalMain` preserves both object groups and reference surface/horizon guides **without inserting the legacy horizon occlusion mask**; physical Globe reference guides use `rEarth`, not `legacy-k`. Analytic vacuum fast path prevents old 3.5-second numerical starvation of 85+2 towers. Atmospheric modes still may have unresolved fringes and budgets. Geometric horizon guides are NOT refracted surfaces; object fills and mutual occlusion remain pending. See `docs/migration-shared-physical-scene.md`.

- Latest migration milestone: **107**, opt-in **Physical tower outlines (preview)** Canvas engine (`docs/migration-physical-canvas.md`). Uses physical angular tower lines from 106, actual camera perspective, separate profile/R controls, cold-result cache across camera redraws, and deliberate budget-limited omissions. **No Legacy mask is used on this path.** The physical Canvas still has **no ground/surface drawing, filled polygons, or mutual tower occlusion**. Real 85-tower sample reached the 3.5-second preview budget with unresolved edges: it is not yet a complete real-time renderer. `CurvatureTargetProjection.solve` remains the one-branch physical target oracle; `solver_failed` is never proof of blockage.
- Recent sequence: 95 runtime extraction, 96 render-frame/renderer contract, 97 main Canvas preview, 97.1 two active object groups, 97.2 horizon tessellation and stroke styles, 98 independent vacuum/geometry regression, 99 core audit, 100 RK4 tests and ground-impact accuracy, 101 bounded ground events and 2D vacuum target visibility, 102 engineered atmospheric profiles and analytic tangent/trajectory validation, 103 atmospheric target-angle shooting and ground-only visibility, 104 lazy/eager shared projection cells with conservative exact fallbacks.
- Legacy DrawModel remains selectable/default; Independent painter preview handles Globe and Flat separately, both supported object groups, with some overlays/annotations absent. `Both` uses Legacy fallback.
- Independent geometric composition uses an ordered horizon disk/mask for presentation; this is **not** physical ray-derived occlusion.
- Numerical `CurvatureRayTracer` already exists (2D fixed-step RK4, vacuum/standard/custom `n(h)`), now tested for analytic vacuum impacts, numerical refinement, invariants and reciprocity; a signed one-step `advanceState()` API and bounded first-ground-event search are available for diagnostics. `vacuumTargetVisibility()` gives restricted 2D ground-only `visible`/`blocked`/`indeterminate` semantics. It is **not** the physical primary-Canvas renderer. Optical P4 diagnostics/overlays and effective-radius `legacy-k` are separate mechanisms.
- Patch 99 retained the 270-test baseline. Patch 100 added 12 numerical tests; patch 101 added 11 ground-event/visibility tests; patch 102 added 8 independent analytic profile tests (301 total); patch 103 adds 14 independent shooting/visibility tests (315 expected).

## Source of truth / workflow

Only use the user-supplied `chatgpt-pack-*` archive (choose the explicitly named pack, otherwise newest timestamp). Unpack it into a temporary Git workspace and apply outstanding compatpatches **in sequence** before making further changes. Never mix packs or reconstruct missing files by guessing. Make one focused commit and distribute as Git `format-patch` (prefer ZIP containing `.patch`); use the repository Git author and English passive-voice commit subject. Test on a clean reapplication. Include in chat: commit subject, validation, browser-check instructions if needed, and next patch preview.

## Invariants / guardrails

- Do not conflate `Canvas engine`, `Optical comparison` and optical physics/profile selection.
- Vacuum means straight optical rays, regardless of surface geometry.
- Solver `no solution` is not proof of physical occlusion; distinguish numerical failure from blocked geometry.
- `legacy-k` effective radius is a proxy, **not** a numerical `n(h)` ray solution.
- Keep camera/units explicit: metres, radians, tangent-plane reference.
- Geometry tests and physical ray-intersection oracles take priority over pixel equality.

## Open limitations

2D/3D coupling, global completeness of ground-event isolation for rapidly varying profiles, lack of adaptive error control, global/multipath completeness of atmospheric target shooting (103 covers one forward-x branch), physical mesh intersections, and ray-driven main Canvas visibility for surfaces/fills (physical tower outlines only in 107). Details and proposed interface contracts: `docs/migration-optics-audit.md`.

## Architectural decision after patch 101

The intended optics scope is standard exponential atmospheric refractivity and an analytically engineered positive-gradient profile for Flat horizon occlusion, not mirages or arbitrary multipath rendering. The inverse-spherical profile from Maslovsky (2026), Eq. (73), reproduces the exact spherical *grazing visibility boundary* at equal endpoint heights for configurable R. The simpler exponential-occlusion profile has an exact non-paraxial ray family and is useful as an independent RK4 oracle. Neither is claimed to reproduce all Globe image geometry. The user proposes to accelerate the rendering of all towers by caching a shared optical field covering their common bounding rectangular prism, **not** running an integrator per tower edge.

## Next steps

100–103: complete (fixed-step numerical core, bounded ground events, atmospheric analytical validation, and single-branch target-angle/visibility API). 104: complete (bounded shared-grid projection cache). 105: completed proxy workload with 2/10/85 target points, grid-density comparisons and explicit warm-up vs redraw timings; not a full tower/Canvas FPS benchmark. 106: completed tower **outline** clipping by physical *ground* first-hit visibility; polygon fills and inter-object occlusion remain separate work. 107: completed experimental physical tower Canvas path plus camera projection and real-scene **bounded** workload checks; 85 towers remain incomplete under budget. 108: shared scene/painter optics architecture completed; **109: Standard atmospheric shooting/scene reliability completed with manual browser acceptance still pending**. Next: verify Standard against browser screenshots, then physical polygon interiors, refraction-correct surface horizon, and performance/Globe-versus-Flat validation. Update this file after about 5–10 patches or significant architectural decisions. Recommended effort: High for numerical physics, and potentially Extra High for 103 shooting solver.

## Patch 110 — Physical ground guides and horizon

Physical optics now projects ground guide lines through a radial optical field and supplies a ray-derived finite visible-ground horizon (Globe or engineered Flat atmosphere) to the **existing** shared `CurvatureFrameRenderer`. The previous geometric horizon is no longer copied in the Physical scene. Numerically, observer 15 m / radius 6,371 km gives Globe vacuum ~13.825 km, Globe standard ~16.004 km, and inverse-spherical Flat ~13.825 km. Flat standard/vacuum report no resolved finite horizon in this implementation. The Latin-1 page's UTF-8 middle dot has been replaced with `&middot;`; runtime status uses ASCII separators. See `docs/migration-physical-ground-horizon.md`. Surface guides are approximate sampled curves, not physically filled ground, and tower polygon fills and boundary uncertainty remain future work.

## Patch 111 — Flat ground-guide drawing extent

Before patch 111, Flat + Standard performed ~29,745 ground guide point shoots from world-radius grid segments up to 20,015 km, far beyond a 100 km radial lookup. Ground reference strokes now clip to a finite **rendering** disk before projection; this disk is not a new physical horizon and does not change tower visibility or the physical ground horizon result. It correctly keeps chords crossing the disk. Flat guide subdivision is bounded by retained segment length, and UI diagnostics include skipped/clipped guide edge counts. Tests: `PhysicalGroundGuideExtent111.test.js`. See `docs/migration-flat-ground-guide-extent.md`. Future: viewport-specific culling and screen-error based guide tessellation, plus the shared-prism field.

## Patch 112 — lazy adaptive tower-prism optical field

The physically projected tower scene now refines `OpticalSharedRayField` cells
**on demand** rather than rejecting the entire 13 × 4 root prism grid and
shooting every vertex/edge sample individually. New opt-in API controls are
`adaptiveDepth` (public default 0, scene default 3) and `maxAdaptiveCells`
(scene default 4096). Only checked all-visible cells are interpolated; mixed,
uncertain, out-of-prism, depth-limited and budget-limited samples still use the
exact numerical solver. Independent off-grid tests and real scene comparisons
cover Flat/Globe with Standard and Flat engineered horizons. Measured full
85+2 Flat Standard case reduced 5659 to 1628 exact shooting solves with 3333
unchanged visible strokes, and the same ground-guide calculations. This is a
sampled, **not globally guaranteed**, interpolation error qualification.
Current UI reports adaptive interpolations/fallbacks, qualified cells and the
prism distance/height bounds. Benchmark: `tools/benchmark-adaptive-prism-112.js`.
Full details and acceptance checks: `docs/migration-adaptive-tower-prism.md`.
Next priority: instrument shared optical-field reuse across ground guides and
other geometry, assess boundary completeness, then polygon fills. No new
Canvas renderer, legacy mask or atmospheric model was introduced.

## Patch 113 — shared scene optics cache and performance

The physical ground-guide radial table now uses the tower prism's shared
`OpticalSharedRayField.exact(d,0)` RK4 memoization, with standalone ground-guide
callers retaining their original oracle. Ground and tower exact solve counts
are displayed separately while preserving their combined total. The scene
cache key now incorporates exact physically contributing authored geometry,
styles and metadata, excluding discarded camera-dependent legacy tangent and
horizon guides, preventing stale frames when input geometry changes without model
controls changing. For camera-only redraws, the complete optical composition
is reused without rebuilding thousands of painter-ready strokes; the shared
renderer continues to project and validate the camera frame independently.
An independent real-mesh benchmark covers 2/10/85/200 towers and Globe/Flat
profiles. Flat Standard with 202 towers measured ~0.24 s cold and ~12 ms
cached optics adapter on one Node run; Globe Standard with 202 towers remained
~4.7 s cold, with 276 explicitly unresolved near-horizon leaves. No new
Canvas renderer, atmospheric model or clipping approximation was introduced.
See `docs/migration-shared-scene-cache.md` and
`tests/SharedSceneCache113.test.js`.

## Patch 114 — physical foundation polygon fills in the shared painter

The independent geometry's actual authored fill polygons (`mode & 2`) now pass
through `CurvaturePhysicalPolygonFills` to the same shared `CurvatureFrameRenderer`
used since patch 108, preserving source fill styles and both tower banks.
Source-plane ear clipping handles concave foundation rings; each emitted fill
triangle is checked at corners, edge midpoints and centroid with the same
adaptive `F(d,h)` optic oracle as tower outlines. Near the physical ground
boundary, intersections are bracketed along original world edges and retained
on the **confirmed visible** side. Mixed/uncertain pieces are never filled
blindly; fill-specific triangle/uncertainty counters are shown separately from
outline uncertainty. All previously stroke-only lattice features remain
stroke-only; the patch does not create bogus solid plates. Mutual 3D object
occlusion, formal global/pixel error guarantees and physical ground **surface**
fills are still out of scope. See
`docs/migration-physical-foundation-fills.md` and
`tests/PhysicalPolygonFills114.test.js`. Next: independent optical/visual
validation and remaining horizon boundary cases (115).

## Compatpatch 114.1 — individual tower painter depth ordering

The previous all-fills-then-all-strokes arrangement per bank was replaced by
placed-object batches. `CurvatureGeometryEngine.createObjectSequenceScene`
retains `placedObjectIndex`/`objectBank` metadata on authored primitives;
`CurvaturePhysicalSceneOptics` orders the two banks' objects together far to
near by observer-relative radial distance, emitting each object's clipped
foundation fills and then its outlines. The common painter stays unchanged.
`stats.perGroup` remains a bank aggregate, while `stats.perObject` exposes the
individual object order. Camera-only Pan/Nick/Roll changes do not invalidate
optical rays. No arbitrary intersecting-mesh Z buffer was added. See
`docs/migration-tower-painter-depth-order.md` and
`tests/PhysicalTowerPainterOrder1141.test.js`.

## Compatpatch 115 — physical and shared-painter validation harness

`tools/validate-physical-scene-115.js` adds reproducible numerical and
painter-contract checks, including a `--full --json` suite for 202 authored
objects. It validates independent Globe-vacuum and engineered Flat grazing
limits at two radii and multiple heights; Standard RK4 2000 m versus 200 m
shooting; off-cell adaptive prism errors versus direct fine-step shooting;
vacuum world/camera angle consistency; and per-object far-to-near fill/stroke
batches through the existing shared painter. It also verifies that rebuilding
the source after Pan/Nick camera changes retains the optical composition and
that fully occluded authored towers need not emit Canvas commands. No physics
or renderer code has been replaced. A sampled 1920px/60-degree angular metric
found ~0.015 px maximum in selected cases (not a global pixel guarantee).
Globe Standard at 87 and 202 towers still reports respectively ~130 and ~276
**boundary** leaves. Full browser raster correctness and arbitrary intersecting
mesh occlusion remain unverified. See `docs/migration-physical-validation.md`
and `tests/PhysicalValidation115.test.js`. Next: review any real-browser issues
and focus on horizon boundary closure before claiming full image completeness.

## Compatpatch 116 — bounded near-horizon outline closure and valid fill-painter camera checks

`OpticalTowerSilhouette` now closes sampled single-transition visible/blocked
horizon leaves by bracketing the transition with the existing physical point
oracle. It emits **only confirmed-visible strokes** and leaves the remaining
spatial bracket unpainted; `boundaryClipped`, `maxBoundaryGapMetres`,
`boundaryGapMetres` and `boundaryGrazingStops` explicitly quantify this
conservative approximation. The ordinary 85+2 Globe Standard scene's former
130 `visibility-boundary` unresolved leaves are now 130 bounded clips with
zero unresolved, the maximum measured world gap being ~0.0062 m. The 200+2
scene's former 276 leaves are bounded to ~0.0102 m maximum, with two grazing
samples retained as unpainted intervals. Real `solver_failed`, unbounded,
nonmonotone and sample-budget leaves are **not** claimed as bounded closures.
The numerical integrator, shared ray field and Canvas renderer are unchanged.

The original #115 synthetic painter camera aimed away from all Globe fill
facets: its zero `fill()` count was a viewport-test false negative, not a
missing fill feature. Its validation now checks a third camera pose aimed at
a nondegenerate emitted foundation triangle and independently requires an
actual `fill()` operation. Original camera counts are separately available
in JSON. On Globe/Flat scenes a targeted camera yields nonzero fill calls.
The UI distinguishes genuine solver failures from grazing samples and shows
measured conservative boundary-gap sizes. See
`docs/migration-boundary-closure.md` and
`tests/PhysicalBoundaryClosure116.test.js`. No general pixel-exact guarantee,
multiray completeness, or arbitrary 3D mesh z-buffer was introduced.

## Patch 117 — Physical interactive redraw / Canvas painter profiling

`CurvatureCanvasFrameScheduler` coalesces Physical-only redraw requests on
`requestAnimationFrame`; Legacy/Independent remain synchronous. Adjacent
stroke-only commands of identical Canvas style now share a **bounded** Canvas
stroke batch, keeping fills as painter-order barriers. Slider changes get a
camera-independent, *presentation-only* reduction of dense auxiliary ground
curves; 180 ms after the last model update the full guides are redrawn. Towers,
physical horizon, fills, visibility and the underlying cached RK4 field are
unchanged. Per-stage frame/Canvas metrics are now visible in Physical status.
Stress tool: `tools/benchmark-physical-redraw-117.js` (synthetic 78k line
primitives; no browser FPS claim). Details: `docs/migration-interactive-canvas.md`.


## #118 — Opt-in Physical performance profile in existing geometry ZIP
The existing Export geometry diagnostics ZIP now runs Physical cold/warm/grid-off/preview/Pan profiling with per-stage raw measurements, median and p95. The normal geometry audit is retained; the profiler does not modify the live model. Details: `docs/migration-performance-profile.md`. No optics, occlusion or painting rules changed.

## Patch 119 — camera-aware screen-space ground guide LOD

The browser ZIP profile from #118 isolated ground guides as the primary
redraw cost (~434 ms cached full scene versus ~31 ms without guides; user
hardware). `CurvatureScreenSpaceGuides` now indexes continuous, already
optically projected ground curves and reduces them under 0.5 **backing-store**
pixel sampled-polyline error *before* frame snapshot cloning/validation and
Canvas projection. Whole viewport-outside/near-plane-behind portions are
safely culled, but near-plane crossings and physical horizon remain exact;
missing visibility spans are never connected. Every tower outline/fill and
physical optics cache is unchanged. Original full physical composition is
retained for camera changes. The existing #117 slider preview stays in force;
settled frames use the new LOD path. Timing diagnostics separate LOD and
snapshot; #118 ZIP profiling carries raw `screenLodMs` and selection counters.
A reproducible synthetic 77,600-line benchmark and regression tests accompany
the change. **Browser performance must be measured on real user hardware**;
0.5 px is a bound on sampled vertices relative to the prior polyline, not a
proof against the original continuous optical curve. See
`docs/migration-screen-guide-lod.md`.

## Compatpatch 120 — height-change RK4 efficiency, exact final scheduling, and profiling

The user confirmed that Height changes, unlike cached Pan, remain slow in
Physical/Globe/Standard. An 85+2 tower cold scene requires ~6,258 independent
exact target solves and ~216k RK4 step calls in shooting. #120 reduces
per-step allocation/callback overhead using the algebraically identical RK4
recurrence and prepares the unchanging optical setup/profile once per solve/
shared field. The Physical Height slider now debounces repeated intermediate
updates by 150 ms while displaying an explicit stale-frame warning, then
rebuilds the **last height precisely**; no fake cross-height ray reuse occurs.
The existing ZIP profiler adds a detached height sweep and solver/stage
counters. Full numerical scene hashes and 54 baseline projection points are
regression-checked against #119 at two heights. A Node-only benchmark showed
~29% median cold-build improvement across three warmed height samples,
**not** a browser FPS/latency guarantee. Details:
`docs/migration-physical-height-change.md`,
`tools/benchmark-height-change-120.js`,
`tests/PhysicalHeightChange120.test.js`.

## Compatpatch 121 — guarded Standard shooting and ground-event reduction

On the #120 85+2 Globe Standard cold scene, 6,258 exact target points required
23,611 trial shooting integrations. #121 adds a local, residual-verified
shooting predictor (three attempts max, original bracketed fallback) for
built-in Standard only. Standard ground verification now avoids most costly
substep event probes when an explicit upper bound on ray curvature proves a
step's chord safely above the physical surface, keeping full old ground-event
search for near-contact, grazing and uncertain spans. The RK4 recurrence,
shooting tolerance, atmosphere, physical horizon, tower fills and renderer
are unchanged. A test-only `settings.shootingOptimization:false` retains the
original #120 exact pixel-source scene hashes. Paired Node cold-builds on
85+2 towers reduced 23,611 -> 16,779 shooting evaluations and 36,833 ->
2,878 full ground-event step searches at Height 15 m; wall time varied from
~792 -> ~461 ms in one Node comparison (not a browser latency guarantee).
For standard rays numerical arrival angles may differ by <1e-8 rad; exact
bitwise equality is not claimed on the accelerated path. The ZIP profiler
reports predictor and ground step statistics. See
`docs/migration-shooting-reduction.md`,
`tests/OpticalShootingReduction121.test.js` and
`tools/benchmark-shooting-reduction-121.js`.

## Compatpatch 122 — owned physical assembly and exact-work attribution

Browser diagnostics #121 isolated ~97 ms `assemblyMs` per cold scene with
~82k ground+object primitives; the scene contract's deep defensive clone
accounted for most of it. Physical-only newly projected ground guides,
strokes and fills now transfer exclusive ownership through the new validated
`CurvatureSceneContract.adoptScene` API instead of cloning. External callers'
`createScene` preserves its deep-copy semantics. Reference hashes of all
physical output primitives/ranges match #121 **byte for byte** on four
Globe/Flat and Standard/vacuum scenes; physical equations are unchanged.
The ZIP profiler now also records per-ground/outline/fill increments of exact
target solves, cache hits, shooting trials and RK4 steps. A Node benchmark
observed assembly decrease from ~107–160 to ~13–19 ms on repeated warm
runs; browser timing needs confirmation. See
`docs/migration-physical-scene-assembly.md`,
`tests/PhysicalAssemblyAndSolverAudit122.test.js` and
`tools/benchmark-scene-assembly-122.js`.

## Compatpatch 123 — verified warm starts across nearby target heights

`geometry-diagnostics (45).zip` after #122 measured ~327.3 ms median for a
cold Height change in the user's browser. #123 examined **where** the 6,258
Standard target solves spend their 16,779 shooting angle evaluations. For
faraway targets with almost equal surface distance and different heights, the
field now keeps two previous **validated** target angles and tries their
height/angle secant as the next initial angle. Every candidate runs the same
RK4 and target-residual check, then the same ground-event classification;
failed guesses continue through the unchanged #121 solver. Custom/nonstandard
profiles and near targets retain previous behavior. Test-only
`settings.shootingWarmStart:false` reproduces exact #122 scene hashes.
In the 85+2 Globe/Standard/15 m Node scene this changes 16,779 -> 13,066
shooting angle trials and 159,685 -> 112,076 RK4 shooting calls, while
keeping all 6,258 unique exact target solves. Fully projected scene statuses,
primitive ordering and horizon stay equal across the tested 15 m/15.3 m
scenes; tiny (<1.3e-7 m on the 1,000 m presentation sphere) residual-bounded
coordinate differences mean accelerated scene hashes are not identical.
Wall-clock Node runs have noticeable scheduling/JIT/GC variance; the browser
ZIP is required to confirm end-to-end latency improvement. See
`docs/migration-optical-warm-start.md`,
`tests/OpticalWarmStarts123.test.js` and
`tools/benchmark-optical-warm-start-123.js`.

## Compatpatch 124 — standalone continuous-curvature surface geometry

A new independent module `src/geometry/CurvatureSurfaceGeometry.js` defines
stable local surface coordinates, altitude, unit normal, and *geometric*
horizon for a non-negative curvature `k=1/R`, including an **exact** planar
case `k=0`. Both 2D ray-plane and 3D geodesic-placement APIs are supplied,
with no giant-number radius substitution. Sagitta and altitude evaluations
avoid catastrophic `R*cos(d/R)-R` and `hypot(x,z+R)-R` cancellation in the
observer-facing domain; an analytic tangent horizon avoids large-radius
`acos` cancellation. Tests cover spherical analytic references, 3D round
trips, exact plane, flat-limit convergence, altitude normals, centre
singularity, extreme radii and UMD export. **This patch deliberately does
not change any existing renderer, model, Optical Solver, ground grid, or UI.**
Physical integration is reserved for #125–128. See
`docs/migration-continuous-surface-geometry.md` and
`tests/CurvatureSurfaceGeometry124.test.js`.

## Compatpatch 125 — continuous-curvature optical solver integration

The #124 stable surface kernel is now connected to the physical RK4 tracer,
point-to-point shooting solver and shared-field target coordinate generation.
`curvature: k>=0` is an authoritative optional input; `k=0` is an exact
plane, and legacy `geometry/radius` calls remain compatible. The radial
height/normal metric is evaluated together in each RK4 derivative stage;
contact, grazing and fast-clear-ground checks use the same surface.
Near-flat ground endpoint classification avoids infinite-radius tolerance
overflow. Existing predictor, shooting residual, event verification and
field-local cache semantics are retained. The surface kernel is now loaded
before the tracer in the browser HTML.

A diagnostic-only `surfaceArithmetic:'legacy'` comparison option retains
byte-exact #119/#121/#122 reference hashes; the default stable path
intentionally need not reproduce old floating-point rounding. Two full
85+2 tower scenes retain topology and shooting work with measured, finite
near-grazing coordinate/horizon differences (see migration document).
Atmospheric `occlusionRadius` is not linked to the physical surface
curvature. The UI/model, common source grid and camera will be unified in
#126–128, not in this patch.

See `docs/migration-continuous-optical-solver.md` and
`tests/OpticalContinuousCurvature125.test.js`.

## Compatpatch 126 — shared physical surface world and metric grid

Main Physical Canvas now opts into `CurvaturePhysicalWorldGeometry`, which
uses the shared #124 continuous-curvature surface for placed object anchors,
local tangent/normal bases and bounded metric reference guides. The grid's
ring radii (100 m to 100 km) do not depend on `aDip`, `nLines`, height,
planet radius or a finite horizon. Its spokes share the same metre
landmarks. Surface-arc distances are projected through exact, memoized
radial ground oracles, not the old sparse near-eye angle interpolation.
Contours/fills use stable physical inverse altitude and arc-distance
coordinates; a stable vacuum analytic path is provided for the physical
adapter. Ground-guide culling at 100 km is presentation-only and does not
set the physical optical horizon. Legacy geometry, diagnostics fixtures,
existing model controls and old compatibility hashes stay intact, with
`LineSpacing` clarified as **Legacy LineSpacing**.

The UI still selects `Globe`/`Flat`; continuous curvature slider, infinity
boundary and camera decoupling are reserved for #127. See
`docs/migration-physical-metric-world.md` and
`tests/PhysicalMetricWorld126.test.js`. Real browser grid appearance and
end-to-end profiling require a fresh user Diagnostics ZIP after application.

## Patch 127 — Physical observer-fixed camera and curvature slider (2026-10-28)

`src/app/CurvaturePhysicalCamera.js` supplies a finite observer-fixed
camera for the **Physical** main Canvas: fixed 1000 m view reference, direct
FOV, pan/nick/roll and aspect ratio, stable geometric dip in Horizon mode.
`Eye-Lvl` is independent of the surface curvature. The legacy and Independent
camera are unchanged. The Physical toolbar now contains a logarithmic radius
slider (100 km to 10^13 km), exact flat endpoint (`showModel=2`, k=0), and
`Earth R` reset. The existing `rEarth`/`showModel` state retains Save/Restore
compatibility; only the radius slider adds a visual control. Drag changes
coalesce before a new optical solve; no per-pointer heavy RK4 work.

The huge-radius model reference dip is stabilized above 1e12 m; legacy
ordinary-radius computations and diagnostics remain unchanged. See
`docs/migration-physical-camera-curvature.md` and
`tests/PhysicalCurvatureCamera127.test.js`. Full regression and browser smoke
verification cover Earth, 6000370000 m, 1e16 m and exact Flat with Standard
atmosphere and 85+2 towers. Next: #128 end-to-end convergence, numerical,
visual and performance verification.

## Patch 130 — Modern UI bootstrap and long-term UI split

The new **Modern visualization UI** is developed in parallel with the existing **Legacy engineering interface**; no Legacy controls are removed. The canonical request `CurvatureApp.html?ui=modern` routes to an isolated Modern document using the same `CurveAppClass`, physical scene, ray tracer and painter, while the default and `?ui=legacy` retain the original application. The Modern shell provides Scene (initial Transmission Line Physical view and basic camera/surface/atmosphere/display controls) plus an explicitly unimplemented Compare tab. Detailed RK4, shooting, audits, Physical sanity check and ZIP exports remain Legacy-only. The complete agreed architecture, risks, compatibility contract and patch 130–134 roadmap are preserved in **`docs/modern-ui-plan.md`**. Before the next patch, obtain a manual browser check of both routes; do not treat URL parsing tests alone as a browser acceptance test.

### Compatibility patch 131 — Modern Scene controls

Modern-only Scene control expansion was added without altering Legacy startup,
optical geometry, solver, or painting. The isolated Modern document loads
`src/ui/modern/ModernSceneState.js` (validated shared-model adapter) before
its Modern bootstrap. The Scene sidebar adds camera roll/FOV, direct radius and
exact-flat controls, two editable physical object groups, preset selection,
and automatic debounced rendering. Lake Pontchartrain is the primary preset;
single-tower and two-row samples are explicitly illustrative. Modern edits do
not overwrite Legacy saved state; full experiment persistence stays in patch
134. The architecture/delivery plan is updated in `docs/modern-ui-plan.md`.

### Compatibility patch 131.1 — Modern settings ergonomics

Modern Scene groups were reorganized into five tab panels (Camera / Surface /
Atmosphere / Objects / Display), with the existing presets moved above the
viewport and field help available by hover or keyboard focus. The model, optics,
Legacy interface and 131 field IDs/handlers were not changed. FOV is formatted
for display with four decimals only. See `docs/modern-ui-plan.md` for acceptance
and the continued 132–134 roadmap.

### Compatibility patch 132 — twin Physical Compare viewports

Modern Compare now paints two **independent real Physical Canvas scenes**
side by side with one shared observer, object configuration, FOV and Eye-level
camera. A retains the Scene curvature; B is exact flat (κ=0) using the same
atmospheric model. Their model snapshots are independent and do not mutate
Scene. Both invoke the existing `CurvatureMainCanvasRenderer.renderPhysical`,
not legacy `Globe+FE` or copied raster output. Each comparison graph has its
own equal-sized Canvas and clipping, created at HTML parse time; at mode
changes, dimensions and redraws are synchronized. The reduced half-panel
width changes pixel density relative to single Scene, but A and B retain
identical angular scale within Compare. User-selectable independent A/B
surface and atmosphere parameters are postponed to #133.

Patch 132 also removes redundant native browser tooltips from custom Modern
help buttons, clarifies physical-object help, and drops an unused Modern-only
`SceneFrame` script that previously raised a missing legacy-adapter exception.
`docs/modern-ui-plan.md` is the canonical roadmap; Legacy/physics remain
unchanged. The JS/Physical test suite and inlined Chromium browser smoke
(including 85+2 towers in Standard atmosphere) exercise both panels.

### Compatibility patch 133 — independent physical Compare models

Modern Compare now offers validated independent A/B surface curvatures,
exact-flat endpoints, atmospheres and engineered profile comparison radii,
including four explicit physics-pair presets. The authored Scene camera,
observer, physical objects and grid remain common and are not overwritten by
Compare edits. The 132 `CurveAppClass` cloning and Physical renderer are reused.
The original single-scene optics cache is retained; A and B now receive their
own instances of the existing keyed optical transform cache, preventing
alternating viewports from invalidating each other. The selected Compare pair
persists while switching Scene/Compare in the same page session. No experiments
are saved across reloads: versioned shareable experiments remain planned for
#134. See `docs/modern-ui-plan.md` and
`tests/ModernIndependentCompare.test.js`.


### Compatibility patch 133.2 — forward-traced horizon diagnostic

A separate `OpticalRayHorizon` module scans launch angles through the
existing RK4 ray tracer and accepts a finite first-contact tangent boundary
only after a hit/confirmed interior-clear-minimum angular bracket converges.
Its result is shown numerically under each Compare viewport and optionally
as an orange dashed angle guide alongside the independent green Eye-level
reference. Diagnostic results are cached per model and do not change
renderer/Scene/Legacy physics. If not resolved within finite range, the
readout explicitly says so; no horizon is inferred from clipping, failed
shooting or exhausted integration distance. Camera Roll currently suppresses
the horizontal horizon overlay. See `docs/modern-ui-plan.md` and
`tests/OpticalRayHorizon.test.js`.


### Compatibility patch 133.2.1 — angular guide projection corrected

Corrected the signed-angle-to-Canvas-y mapping in Modern Compare. Negative
optical horizon elevation is now drawn below the 0° Eye-level line, and the
marker matches the actual Physical perspective projection across camera
Nick values (and shared off-axis Pan). No optical or numerical horizon
algorithm was changed. Regression tests include
`tests/ModernAngularGuide.test.js`; the limitations stated for
patch 133.2 remain in effect.

### Source naming convention (compatpatch 133.3)

Source filenames, module exports, browser globals, classes, and functions are named for their responsibilities, not the patch that introduced them. Patch identifiers remain in Git history, patch artifacts, and historical documentation. Historical test case labels and numbered fixtures may retain their identifiers where they describe a specific regression or oracle version. This cleanup does not change physical calculations or rendering behavior.

### Patch 134 — Modern experiment URL/state

Versioned `ModernExperimentState.js` serializes validated *inputs* from the
shared Scene and independent Compare A/B into a reproducible, UTF-8 base64url
`experiment` query parameter. URL configuration supersedes Modern localStorage
and default presets. Debounced autosave and URL copy/reset controls have been
added without modifying Legacy `state`/DataX behavior, physical optics, or
render caches. Explicit incoming share links are not auto-rewritten after
user edits; Copy experiment URL serializes current state. Named experiment
library and JSON import/export remain next in 134.1. Source module names must
continue to follow their purpose, never the compatibility patch number.

### Patch 134.1 — Named Modern experiment library and JSON exchange

Modern `ModernExperimentLibrary.js` stores up to 50 named, validated experiments
under a dedicated localStorage key. Names are unique case-insensitively and
replacements and deletions require confirmation in the browser UI. A separate
library panel supports save/load/delete and import/export of JSON. The JSON
format is exactly the versioned input-only `ModernExperimentState` schema used
by Modern URLs; imports are validated before applying and do not silently
overwrite named entries. Library persistence is separate from the automatic
last-session state. Legacy URL/state and the physical optical engine remain
unchanged. Source names continue to be responsibility-based.

### Patch 134.2 — shared settings tabs in Compare

Scene and Compare now use one five-tab settings sidebar. Camera, Objects and
Display are the same actual input nodes bound to the shared `CurveAppClass`;
Compare-specific Surface and Atmosphere tabs edit only the selected A/B physics
descriptor. Model selection and pair presets remain above the tab list. Compare
Camera aim is explicitly fixed to eye level while retaining Scene's saved aim.
Compare guide toggles were moved to Display. Changing tabs updates ARIA and
panel visibility without recomputing optics; model or shared parameter changes
continue to redraw through the existing Physical renderer and use unchanged
version-1 experiment URL/localStorage/JSON serialization. Legacy is untouched.
Node regression: 558/558 tests, including three new shared-controls checks.

### Patch 134.3 — Atmospheric model help and legacy option cleanup

Modern Scene and Compare Atmosphere panels show a concise description and the
actual refractive-index law from `OpticalRayTracer.atmosphere`: vacuum `n=1`,
standard `n=1+0.000293 exp(-h/7350 m)`, and the hypothetical engineered
exponential `n=n0 exp(h/R)`. The UI calls the latter **Exponential refractive
profile** rather than occlusion, while keeping the stable internal key
`exponential-occlusion` for saved links and tests. The inverse-spherical law
is described when loading a historical experiment; it and the two inverse
pair presets are hidden from the default picker but retained, restorable and
editable when selected by URL, JSON, or named library. No physics formulas,
experiment schema version, Legacy behavior, or cache keys were changed.

### Patch 135 — Refraction scale radius in Modern UI

The existing `occlusionRadius` (metres) is exposed as **Refraction scale radius
(km)** for engineered atmospheric profiles in both Scene and independent A/B
Compare settings. UI values are converted to metres before reaching the optical
solver. The experiment URL/JSON/localStorage schema and cache key remain
unchanged, as does the separate geometry/reference radius.

### Patch 135.1 — Safe radius editing and reference-radius guidance

Radius fields in Scene and Compare now treat `input` as an uncommitted draft.
Only Enter or the native `change` event (including loss of focus) validates
and redraws physical optics; the previous 420 ms typing timer no longer
triggers expensive renders at intermediate values such as `1` or `10` km.
Committed values are idempotent across Enter + change and retain the independent
Compare A/B physics and unchanged metre-based optical state. A visible draft
hint explains how to apply values. For exact flat geometry, the Compare Surface
tab explicitly notes that the reference radius does not bend rays; the
separate atmospheric Refraction scale radius controls engineered refraction.
The optical cache already keys `occlusionRadius`, so no cache or physics changes
were necessary. No numerical time-to-completion guarantee is made for a
purposefully committed extreme profile. Node regression: 566/566 passed.

### 135.2 — Surface radius controls for flat geometry

- Modern Scene hides curvature slider, surface-radius input and Earth-radius reset when Exact flat is enabled; the flat selector remains available.
- Modern Compare hides the surface-radius field for the selected flat model and labels it `Surface radius (km)` on spherical models.
- Underlying surface radii remain stored, including when switching between flat and spherical surfaces, with no changes to experiment serialization or optical physics.
- Tests include switching both modes and preserving a manually entered sphere radius.

### 135.3 — Legacy-style surface curvature slider

- Compare Surface now uses the existing `CurvaturePhysicalCurvature` logarithmic
  step-to-radius mapping (0–999, from 100 km to 1e13 km), with step 1000
  representing exact flat geometry. The former geometry dropdown is removed.
- `Flat` and `Earth R` actions are provided; a precise radius field is available
  for spherical geometry. Slider input changes only the selected A/B configuration,
  and the expensive optical redraw is deferred until slider change/release.
- The Scene curvature slider stays visible at exact flat so that the user can
  leave the exact-zero endpoint without first using a separate geometry toggle.
- The existing compare schema (`surface`, `radiusKm`) and the physical solver are
  unchanged. Flat models retain their previous finite reference radius.
- Node regression: 568/568 passed.

### 135.4 — Compare curvature commit and redraw synchronization

- Compare curvature input updates the selected A/B descriptor and explicitly
  marks the existing viewport as **Pending curvature change**, rather than
  displaying an old `Cached` status beneath a new surface radius.
- Expensive optics are rendered once on range `change`, `pointerup`,
  `pointercancel`, or keyboard completion; a 700 ms idle fallback covers
  controls that emit only `input`. Duplicate release/change events do not
  retrace. Switching the selected A/B model commits pending slider edits.
- The viewport reports `Rendering current model` before the new frame;
  completed cache hits are labelled `Repainted (cached rays)` to distinguish
  painter refresh from recalculating optical ray fields.
- Physical cache and renderer code are intentionally untouched: the cache
  already includes `showModel` and `rEarth`. A new integration regression
  exercises real metric ground and tower optics and verifies that changing
  Model B from flat to Earth-radius sphere invalidates the B cache and
  changes visibility and horizon, while Model A reuses its cache.
- The internal `surface` + `radiusKm` experiment schema and Legacy UI are
  unchanged. A nearly flat radius can still render nearly identically to
  an exact flat surface, for legitimate geometric reasons.
- Node regression: 572/572 passed; Chromium was available but local/file
  navigation was blocked by administrator policy, so no browser acceptance
  result is claimed.

### 135.5 — Unified Scene and Compare Display controls

- Display now exposes the same ground grid, eye-level angle guide, and forward
  traced horizon switches in both Scene and Compare. All three controls remain
  mounted once and apply to the active viewport(s).
- The Scene painter now draws the same optional screen-space angle overlays
  used in Compare, with a separate cached horizon diagnostic keyed by physical
  parameters. Existing physical ray tracing and independent A/B atmosphere
  configuration are unchanged.
- Display options use the existing version-1 experiment fields, so URL and
  JSON interchange remain backward-compatible; switching modes does not
  reset the selections. Canvas-free test shims safely skip painter annotations.
- Node regression: 573/573 passed. Browser acceptance remains unverified.

## Patch 136 — atmospheric inverse physical requirements (research note)

The future atmospheric inverse problem has been documented in
`docs/atmospheric-inverse-physical-requirements.md`. The note separates
hydrostatic mathematical existence, convective stability, and nonlinear
mixing times; derives the dry-air inverse temperature relation for the
engineered exponential `n(h)`; records the **illustrative local** ~188 K/km
lapse-rate and ~13 s linear instability e-folding estimates with their
assumptions; and scopes a later temperature/gradient visualization. This
patch changes **documentation only**; no atmospheric solver or UI has been
implemented. For Vacuum, thermodynamic diagnostics are not applicable.

### Camera drag cursor portability — patch 137.2.2

PNG-backed open/closed hand cursors now replace browser-native `grab` and
`grabbing` glyphs in the Modern Scene and Compare viewports, with native
cursor keywords retained as fallbacks. See
`docs/modern-camera-portable-cursors.md`. Camera interaction, physics and
preview transforms are unchanged; Opera appearance requires manual verification.

### 138.4 — Atmospheric shimmer stability and frame budgeting

- A nonmoving shimmer (`Intensity = 0` or `Drift = 0`) now stops its continuous RAF/GPU cycle after an immediate single-frame update. Scene GPU presentation is capped at 60 Hz and the two Compare views at 30 Hz each; physical ray tracing and turbulence displacement math are unchanged.
- Camera-drag resumption resets the shimmer phase clock; background-tab time is not accumulated into the next frame.
- Recoverable WebGL context loss exposes the original physical Canvas and leaves undistorted annotations visible. The restored GPU program uploads the **cached physical Canvas** and resumes without rerunning the optical solver.
- Browser script URLs were version-bumped for deterministic cache invalidation. Test procedures and caveats: `docs/atmospheric-turbulence-performance.md`.

## #140.0 GPU Capability Diagnostics

- Opt-in **Display → GPU capabilities → Check GPU** probe, implemented in
  `src/ui/modern/ModernGpuCapabilities.js` with a thin UI bridge in ModernApp.
- Reports WebGL/WebGL2/WebGPU availability, optional renderer information,
  float-texture extension status, and conservative software-renderer hints.
  Hardware acceleration is not claimed as confirmed by context creation.
- Uses temporary canvases only and does not alter Canvas 2D physical rendering,
  atmospheric shimmer, Scene/Compare state, or saved experiments.
- See `docs/gpu-capability-diagnostics.md` for browser verification and
  interpretation. Automatic backend selection is intentionally not included.

## #140.2 — Experimental WebGL2 projected-geometry renderer

- Display now selects **Canvas 2D (reference)** or **WebGL2 (experimental)**
  manually for Scene and Compare A/B. Default remains Canvas 2D. Selection is
  in-memory only; URLs, saved experiments and physical math are unchanged.
- A separate WebGL2 painter consumes **the same** CPU-projected triangles and
  stroke segments as the existing ordered painter. Lines are approximated by
  screen-space rectangular quads; minor antialiasing/join differences are
  expected, and there is no new optical or Z-buffer solver.
- WebGL draws into a dedicated offscreen canvas, composited with `drawImage`
  to the existing GraphX3DX Canvas. A true zero-copy presentation is deferred.
  GPU errors, lost contexts and unsupported color styles fall back atomically
  to the original Canvas painter; the UI reports the actual backend and reason.
- Profiling now records the backend of each physical redraw and labels painting
  as **CPU wall-clock raster/presentation time** rather than GPU execution.
  GPU timer queries in #140.1 continue to time shimmer only.
- Details and Opera acceptance checklist: `docs/modern-gpu-geometry.md`.

## #140.8.1 browser benchmark compatibility

- Corrected WGSL direction normalization to avoid invalid multi-component
  swizzle assignment rejected by Opera's WebGPU compiler.
- Corrected HTML numeric step validation and used `valueAsNumber` for numeric
  controls in the standalone benchmark. Added regression tests for both.
- Production optical solver and renderer remain unchanged. Actual GPU shader
  compilation and performance still require a WebGPU-enabled browser run.


## #140.10 — bounded real-scene GPU-assisted shooting spike

- #140.9.1 analytical accounting now distinguishes obsolete naive Vacuum failures from compensated analytic failures (18/18 compensated gates passed in the user-provided measurement).
- Added 64 actual production-composed mesh targets each for 12-tower Flat and Globe scenes; deterministic generator and committed fixture.
- Added opt-in WebGPU compensated shooting-angle candidate kernel; unchanged production CPU `OpticalTargetProjection.solve` performs all target and ground-event certification via the existing warm-start API.
- Added standalone browser spike and JSON report: cold GPU setup, upload/readback, CPU certification, statuses and angle comparison, explicit stage-only 2x stop gate.
- **No live production switch**; stage evidence excludes full scene assembly, outlines, fills, guides and painter. See `docs/webgpu-real-scene-shooting-spike.md`.

## #140.10.1 — Canonical WebGPU diagnostics UI and validation rule

- **Persistent project rule:** Do not create a new version-numbered HTML page in `tools/` for each WebGPU experiment or compatpatch. Maintain the single canonical `tools/webgpu-optics.html`, with an experiment selector when historical workflows remain useful. Retire redundant HTML pages and update references/tests. New JavaScript modules are justified only by distinct implementation responsibilities, not patch numbers alone.
- WebGPU WGSL must be validated by an actual shader compiler when available, and tested in the target browser before claiming runtime success. JavaScript mocks and regex checks do not establish shader compilation or GPU correctness; disclose unavailable runtime verification.
- #140.10.1 fixes the WGSL reserved identifier `target` to `targetData`; the real browser run of #140.10 is still pending. No production backend change.

## #140.10.2 — Unified WebGPU diagnostics Run-button regression

- Fixed the consolidated `tools/webgpu-optics.html` event wiring: panel-local
  `querySelector` calls must use **CSS ID selectors** (`#start`, `#save`, etc.),
  not bare tag names (`start`, `save`). The latter return null and abort all
  subsequent inline script execution, making Run buttons appear inert.
- Regression tests must **execute the real inline browser handler script**
  against a DOM stand-in, verify listener registration for every experiment,
  and invoke the scene Run handler. Text/regex-only HTML tests are insufficient.
- Preserve the canonical HTML file; do not create numbered `tools/` pages.
  No production backend or WGSL numerical changes were made in this fix.

## #140.10.3 — WebGPU scene-shooting experiment closed (reopenable)

- User-run #140.10 browser report (`curvature-webgpu-optics-140.10-scene-spike.json`, 2026-10-30): Flat and Globe, 64 real 12-tower mesh targets each; **0/128 GPU warm starts accepted**; no status/angle mismatches and no unresolved targets.
- CPU-only shooting **27.3 ms**; GPU setup **26.7 ms**, upload/readback **13.6 ms**, CPU certification **27.6 ms**; cold hybrid **67.9 ms** (**0.402x**, ~2.49x slower). CPU shooting RK4 calls increased from **47,371** to **63,822**. Single cold run; Intel Gen-12LP, hardware acceleration unverified.
- **Decision: `SCENE_PERFORMANCE_STOP` — CLOSED / PARKED.** Predeclared warm-start and 2x cold-stage gates were not met. Do not integrate this hybrid GPU shooting path into production or extend synthetic GPU tuning by default. Keep the CPU optical solver/ground events/renderer as the reference.
- May be reopened later only for a materially different approach or new workload evidence, with a new explicit hypothesis, bounded scope and predeclared numerical/end-to-end speed gates. No claim that all GPU optical computation is intrinsically unhelpful.
- Detailed measurement, limitations and reopening policy: `docs/webgpu-real-scene-shooting-spike.md`. Preserve the **single** `tools/webgpu-optics.html` rule from #140.10.1. No production changes in this closure patch.

## #140.12 — independent GPU shooting solver, diagnostic prototype

- Implemented `src/diagnostics/CurvatureWebGPUBatchShooting1412.js`, a
  **separate** GPU-side sweep (33 parallel launch rays per target), bracketed
  refinement (up to 28 iterations), and bounded first-ground-contact sampling.
  The output implements the #140.11 batch response contract. CPU runs only as
  a **separate comparison baseline**, never inside the timed GPU solver.
- Added the #140.12 mode to existing `tools/webgpu-optics.html` (no numbered
  HTML), using the same committed Flat/Globe production 12-tower target fixture
  as #140.10. The mode exports an evidence JSON report; Node tests verify
  bounded inputs, fail-closed results, GPU dispatch orchestration and UI
  button wiring, **not** real shader compilation or physical GPU correctness.
- **Research only; NOT production authorized.** Real browser WGSL compilation,
  numerical parity (status, angle, target residual and first-ground evidence)
  and 2x cold-stage speedup were measured in the user-run 2026-10-30 browser
  report and FAILED (details in #140.12.1 below). A finite scan does not
  guarantee all roots or tangent contacts, and f32 may fail strict precision.
  Never assume success from mocked tests. CPU optical solver, synchronous
  scene field, Scene/Compare renderer and their backend selectors are unchanged.
- Next: isolate the observed #140.12 numerical failures using the #140.12.1
  per-target / warm-pipeline diagnostics; do not silently relax tolerance or
  switch production based solely on WebGPU capability. Full async preparation
  and fallback only become relevant after independent stage qualification.
- Detailed algorithm, limitations, gates and browser workflow:
  `docs/webgpu-independent-batch-shooting.md`. The earlier
  `SCENE_PERFORMANCE_STOP / CLOSED / PARKED` verdict for the different
  #140.10 warm-start approach remains valid.

## #140.12.1 — independent GPU shooting parity and warmed-pipeline diagnostic

- A user-run **real browser** #140.12 report (`curvature-webgpu-optics-140.12-independent-shooting.json`, 2026-10-30, Intel Gen-12LP) showed **`BATCH_NUMERICAL_STOP`**, 64 targets each for Flat/Globe. CPU times 34.7/56.8 ms; GPU cold 867.5/71.3 ms; 54/53 angular mismatches (107/128), 4/3 status mismatches and 4/6 ground-event mismatches; 3 unresolved targets in each scene. Flat setup alone 826.5 ms. **No production approval; this replaces the earlier "not yet measured" status of #140.12.**
- New read-only diagnostic module `src/diagnostics/CurvatureWebGPUBatchDiagnostics14121.js` reports every target's CPU/GPU status, angle, residual, ground evidence and numerical discrepancy flags, reusing the #140.11 strict comparison gates. #140.12 WGSL now outputs selected sweep-bracket index/count, refinement-iteration count and final bracket bounds in previously unused buffer slots. **The root search, refinement math, event decisions, precision and tolerances are unchanged.**
- Optional `solveBatch(..., ..., {warmRepeats:3})` reuses the same device, two pipelines and buffers for three further full workload runs, reporting first cold run, warm sample times, warm median and raw-output bitwise stability. CPU reference is measured separately. Warm timings include upload+dispatch+readback; these are diagnostic wall-clock numbers, **not full scene/FPS, kernel-only timings, or authorization to switch solvers**.
- Sixth selector mode in the **existing** `tools/webgpu-optics.html` exports `curvature-webgpu-optics-140.12.1-diagnostics.json`. Historical #140.12 and older modes remain available. No new numbered HTML pages, no production changes.
- Next: run #140.12.1 in a real WebGPU browser, inspect per-target differences before changing one algorithmic assumption (sampling density, f32 precision, event detector, etc.). WGSL runtime verification and performance require browser execution; mocked Node tests are not proof. Details: `docs/webgpu-shooting-diagnostics.md`.

## #140.12.2 — root-refinement numerical A/B and analytical vacuum gate

- User-run #140.12.1 real-browser evidence (2026-10-30, Intel Gen-12LP): 54/53 angular discrepancies for 64 Flat/64 Globe targets; 4/3 status and 4/6 ground-event mismatches; GPU warm median 37.9/50.1 ms vs CPU 28.2/44.7 ms. GPU found one sweep bracket for every target but reported zero final width on all of them.
- Root-cause inspection identified a **premature WGSL stopping rule**: stop at target-height residual ≤ **0.005 m** and force `a=b`, even though the independent angular parity gate is **1e-7 rad**. The 107 angular mismatches are not yet fully attributed to that cause; other f32 trajectory or event issues may remain.
- Added **opt-in `angle-bracket` GPU refinement**: continue bisecting until retained width ≤ **2e-8 rad**, f32 midpoint stall or 28-iteration cap; never shortcut on the 5 mm residual. Preserve the unchanged original `residual-stop` shader as default for historical experiments. Invalid intermediate arrival fails closed; final residual and existing ground classification remain mandatory. Sweep density, compensated integration and ground sampling are unchanged.
- New research-only `CurvatureWebGPURootRefinement14122` compares original/refined GPU results against the **same** independent CPU oracle for all 128 real scene targets, with per-target bracket telemetry, independent warm/cold timings, and seven separate **Flat/vacuum analytic angle** checks (`atan2(Δh,x)`). Separate GPU sessions per variant; all times are browser wall-clock; no full scene/frame claim.
- Seventh mode in the **existing** `tools/webgpu-optics.html`, exports `curvature-webgpu-optics-140.12.2-refinement.json`; no numbered HTML files. Tests cover numerical-model regression, output evidence, policy selection, fail-closed behavior and real inline UI wiring. **No production CPU solver, painter, Scene/Compare or backend selector changes.**
- **Not yet verified in a real GPU browser after this change**; previous `BATCH_NUMERICAL_STOP` is retained. No production authorization is possible in this experiment. Next: obtain the browser JSON and distinguish fixed angle discrepancies from residual f32 and ground-event mismatch. See `docs/webgpu-shooting-root-refinement.md`.

## #140.12.3 — intentional 5 mm target tolerance and physical GPU qualification

- **Correction of experimental interpretation:** `targetTolerance: 0.005` m is the user's **intended physical shooting accuracy**, not a bug in the original GPU `residual-stop` algorithm. The separate `1e-7` rad angle-parity gate was overly restrictive for that purpose. The #140.12.2 `angle-bracket` refinement remains an independent research A/B option, but is **not required** for acceptable 5 mm shooting and may cost performance.
- New diagnostic-only `src/diagnostics/CurvatureWebGPUPhysicalTolerance14123.js` uses the **unchanged** original GPU `residual-stop` shader. It tests **individual** CPU and GPU target-height residuals <= 5 mm; their *difference* and angular parity remain diagnostics. Crucially, it also independently replays the **GPU angle** through the f64 CPU integrator at fixed target x (no new shooting search, **outside timed GPU work**) and demands <= 5 mm there. No self-certified f32 GPU hit is trusted as cross-model physical accuracy.
- Keep visibility/ground correctness mandatory: matching statuses, matching first-event existence/type, <= 1 mm event path-length difference, no `indeterminate`/`solver_failed`, stable GPU repeats. GPU ground-level target classifications do not yet reproduce CPU's specially tightened endpoint tolerance. Only after these checks consider the **unchanged 2x cold GPU stage speed gate**, with production authorization always false. Warm runs reuse device/pipelines/buffers and remain separate from full-frame costs.
- Reassessed *user-run* #140.12.1 report (2026-10-30): all 128 **GPU self-reported** residuals lie within 5 mm (max Flat 3.900 mm, Globe 3.633 mm), even though the strict diagnostic recorded 107 angular discrepancies. Independent CPU replay of the **recorded** GPU angles shows one >5 mm residual, Flat target #54 (~5.172 mm); none in Globe. Ground/status disagreements remain (Flat 4/4, Globe 3/6). The newer report's warm CPU/GPU ratios were 1.20x and 1.44x, cold 0.486x and 0.915x: not the required 2x cold gate. Historical `BATCH_NUMERICAL_STOP` applies to the older strict experiment; no retroactive stage pass is implied.
- Eighth option in **single** `tools/webgpu-optics.html`: `#140.12.3 — physical 5 mm qualification`; exports `curvature-webgpu-optics-140.12.3-physical-tolerance.json`. Production shooting/renderer and all WGSL are unchanged. Node tests are not real-browser GPU verification. See `docs/webgpu-physical-tolerance.md`.

## #140.12.4 — visual-impact triage instead of strict millimetre parity

- Interpret the user's 5 mm vertical target tolerance and the old 1 mm
  first-ground event comparison as **diagnostic conventions**, not hard
  perceptual limits. A status flip close to the surface may or may not affect
  the actual image; neither a passing 5 mm replay nor a subpixel angle shift
  alone certifies image equivalence.
- Extend the **existing** `CurvatureWebGPUPhysicalTolerance14123.js` with an
  optional illustrative screen-space angle projection and independent `f64`
  CPU first-ground event replay at GPU launch angles. Parameters are explicit:
  vertical FOV, camera pitch, viewport height, pixel budget, near-surface and
  near-endpoint path windows. Boundary cases are **flagged for review**, never
  automatically accepted. Older physical checks and their report remain intact.
- The ninth mode lives in the **same** `tools/webgpu-optics.html`; no new JS,
  HTML, docs, or test files were added. Existing tests cover perspective
  projection, clipped/offscreen rays, near-target vs early ground contacts,
  unresolved outcomes, warm-policy preservation and real inline UI wiring.
- Earlier #140.12.1 data replayed offline through the new illustrative proxy:
  all 128 launch-angle differences <0.067 proxy px (1080 px viewport, 45°
  vertical FOV), but Flat 4/64 and Globe 6/64 still require actual-frame
  investigation due to status/ground disagreements. Three near-endpoint
  candidates per geometry are not passes; Flat #51 remains a distinct earlier
  ground contact (~2.45 m before target).
- `VISUAL_PROXY_ONLY` can **never** authorize GPU production use. No live
  camera projection, image rasterization, frame diff, full-frame performance,
  automatic opt-in, CPU solver, or GPU WGSL change. The original cold ≥2x
  stage speed requirement remains unevaluated by visual comparison itself;
  all available real browser evidence so far remains below it.

## #140.12.5 — performance-first GPU batch-shooting scaling (research only)

- Motivation: do not optimize extra millimetres if the difference is visually
  negligible. An illustrative **1 pixel** launch-angle projection budget is
  used for triage, **not** as automatic acceptance of visibility/occlusion
  changes. Silhouettes and actual frame images are still untested.
- The existing `CurvatureWebGPUBatchShooting1412.js` now exposes a reusable
  `createSession(capacity, ...)`: one adapter/device, **two unchanged shooting
  WGSL shaders**, two compute pipelines, and five preallocated buffers for
  multiple successive size-controlled batches. The old one-shot `solveBatch`
  delegates to this session and still closes resources. Experimental batch
  capacity rises from **256 to 1024 targets** (bounded, not production).
- The existing `CurvatureWebGPUPhysicalTolerance14123.js` provides
  `runPerformance`: identical **64** tower targets are deterministically
  replicated into **128/256/512/1024** rays (selectable max). CPU f64 shooting
  is timed once per size; GPU times include host upload, command encoding,
  submit, wait/readback, with warm samples reusing all GPU resources. The
  reported phase breakdown is **host wall-clock**, not GPU timestamps or an
  isolated kernel measurement. The 64-target baseline only gets the expensive
  independent CPU/GPU-angle physical + ground verification and visual proxy.
  Prefix output consistency and repeat bitwise stability are tracked across
  sizes; GPU statuses are counted for every size. No 2× cold gate or numerical
  angle-parity veto is imposed for this profiling stage.
- The tenth mode is in the **same** `tools/webgpu-optics.html`. Report export:
  `curvature-webgpu-optics-140.12.5-performance.json`. No new JS, HTML,
  documentation, or test files, and no production renderer/solver switch.
- **Measurement pending** in an actual WebGPU browser; Node/mock tests cannot
  establish throughput. Larger replicated batches may not model full-scene
  material diversity, caching, horizon, or rasterization. The result only
  selects promising sizes/optimization paths. `PERFORMANCE_PROFILE_ONLY` is
  never a production authorization; full-frame tests still needed.

## #140.12.6 — distinct physical-edge shooting and 1D projected sample comparison

- Extended the **existing** deterministic scene-fixture generator and existing
  reference JSON: each geometry now contains 1024 different points selected
  from >1000 real 12-tower physical polygon-edge samples (subdivided in the
  source mesh before coordinate conversion). The original 64 vertices and
  previous experiments are preserved unchanged. No new repository files.
- `runDensePerformance` in the existing tolerance diagnostics runs nested
  64/128/256/512/1024 target subsets using a bit-reversal order that spans
  the scene and preserves earlier prefixes for stability checks. CPU and GPU
  are measured separately; GPU reuses its pipelines/buffers/device.
- The largest batch reports illustrative subpixel launch-angle shifts, status
  disagreements, unresolved rays, ground contact-class disagreements and
  sampled projected visible-target row occupancy; a dedicated red diagnostic
  strip shows unmatched rows outside the 1 px budget. Replayed GPU-angle
  ground events for at most 24 disputed targets are **not timed as GPU work**.
- Added the eleventh mode to canonical `tools/webgpu-optics.html` and reused
  existing unit tests/docs. Does not compare full rendered scenes or actual
  tower silhouettes, does not measure FPS, and never authorizes production.
- Actual browser GPU performance/visual results for this dense case remain
  **pending** until an exported #140.12.6 JSON is obtained.

## #140.12.7 — opt-in CPU/WebGPU optical probe in Modern Compare (research only)

- Existing Modern Compare now offers **Physical models A/B** (unchanged default)
  and **CPU / WebGPU optical samples** (explicitly selected). The research
  mode clones the chosen A physical model onto B (including atmosphere and
  radius), without altering saved A/B settings, the Scene model, or production
  solver/renderer defaults.
- The existing `ModernCompareModel` draws deterministic, distributed samples
  from *the current* authored physical model's object vertices **and real
  edges** (up to 1024 unique samples). No archived 12-tower fixture or
  replicated rays are inserted. A request uses the existing bounded
  `CurvatureOpticalBatchContract1411` and independent
  `CurvatureWebGPUBatchShooting1412.createSession` interfaces.
- Only an explicit **Run sampled comparison** launches CPU f64 and WebGPU f32
  batch shooting. Timings distinguish CPU reference, GPU setup, first batch,
  and warm GPU readback-inclusive wall clock. A/B angular maps use the same
  sample targets and mark status disagreements in red. Unresolved rays and
  >1 px *illustrative* launch-angle shifts are reported separately, never
  silently accepted as equivalent. A JSON export includes the sample report
  and a `productionAuthorized:false`/`actualRenderedImageCompared:false` flag.
- Both full rendered viewports deliberately remain **CPU physical frames**.
  The angular maps are *not* production camera pixels, filled polygon
  silhouettes, 2D frame difference images, or proof of visually equivalent
  GPU rendering. Compare's experiment is limited to **standard atmosphere**;
  unsupported models and WebGPU absence fail visibly without a backend switch.
  Changing the physical scene invalidates old probe displays; out-of-date
  asynchronous runs cannot publish results. Resources are closed after each
  run. The GPU scene backend is **NOT** integrated or authorized.
- Only existing files were touched (Modern HTML/CSS/App, CompareModel, existing
  tests and this PROJECT_STATE). The next stage for true CPU/GPU full-frame
  Compare requires an async, cacheable ray-field interface (including adaptive
  fill/outline/ground consumers), then actual painter-frame comparisons.
- Node tests and Node-side current-scene sampling smoke checks cannot execute
  WebGPU shader code or certify browser performance. A browser export is
  required before any claim about runtime performance/visual parity.

## #140.12.8 — independent ground-event triage of Compare CPU/GPU disagreements

- The optional Compare CPU/WebGPU optical sample probe now independently replays **only status-disputed GPU launch angles** through the existing CPU f64 ground-event tracer, after GPU timings are complete.
- Exported `groundReview` preserves each disputed target index, CPU/GPU status, GPU launch angle and path length, CPU replay ground contact and remaining path distance, or an explicit unavailable/error reason. At most 64 disputed targets are replayed; truncation is explicit.
- This answers whether the *GPU-angle CPU trajectory* crosses the ground, **not** whether a real pixel is occluded. A path-distance remainder is not a vertical screen-space displacement.
- The probe remains research-only. Both rendered Compare frames still use the CPU renderer; no GPU frame, silhouette comparison, asynchronous full-frame ray field, or production authorization is claimed.
- `curvature-compare-140.12.8-cpu-gpu-ground-review.json` is the new export name. This patch does not claim that the exported result has been measured in a browser.


## #140.12.10 — asynchronous GPU-seeded ray field in Compare (experimental)

- The **Build GPU-assisted frame B** action in CPU/WebGPU Compare cold-renders the real CPU model A with an opt-in collector for the adaptive field's exact shooting requests (including outline/fill/ground demand). No archived fixture or synthetic repeated target list is used.
- A bounded selection of up to 1024 uniquely qualified requests is converted from physical surface coordinates into metric `[x,z]` GPU targets and asynchronously computed using a single WebGPU research session. Only successful GPU outputs are seeded into model B's real `CurvaturePhysicalSceneOptics` field; unseeded targets, CPU interpolation and non-resolved GPU rays fall back to original CPU f64 solving. GPU status disagreement remains visible; there is no hidden CPU correction for `blocked` or `indeterminate`.
- Model B is repainted by **the same physical frame/painter** with those GPU-sourced samples; the CPU reference remains model A. The status and JSON report give GPU lookup counts, CPU fallback counts, setup/dispatch/readback and complete CPU discovery/assisted B frame timings. When Canvas readback is available, the report compares actual rendered pixels using a clearly labelled >8/255 channel difference threshold; this is not a one-pixel silhouette parity proof.
- The GPU B result is invalidated on scene/camera/atmosphere/target-count changes and does not persist as GPU calculations in the experiment URL; the URL saves only configuration. Unsupported atmosphere/WebGPU falls back to CPU. All operations are opt-in; Scene, Legacy and production paths remain CPU and previous Compare pairs remain intact.
- **Limits:** This is a **mixed GPU-seeded / CPU fallback optical field**, NOT an all-GPU ray field or GPU rasterizer. GPU discovery begins with a CPU reference frame, so end-to-end performance is not claimed to be faster than CPU rendering. GPU work remains bounded by the existing 1024-ray first-forward-x experimental solver.


## #140.12.11 — CPU f64 replay control for GPU-assisted Compare

- The experimental Compare action now captures **actual CPU f64 exact-solver outputs** while discovering the adaptive requests, not just target coordinates. It seeds the same bounded target selection through the same `OpticalSharedRayField.exact()` interception used by GPU, first rendering a **CPU replay B control frame**.
- The replay control is compared to CPU reference A via actual Canvas pixel readback (>8/255 per channel), and its render time, lookup/fallback counts, selected seed coverage and renderer counters are exported as `gpuAssistedFrame.cpuReplayControl`. After that, the original WebGPU solve is injected into a final GPU-assisted B frame; both pixel comparisons are against the same A reference.
- **Interpretation:** If CPU replay already changes pixels, the injection/cache/adaptive behavior is implicated independently of GPU f32. If replay matches A but GPU differs, inspect GPU status/ground boundaries. This is a controlled diagnostic, not a proof of full-frame parity or GPU-only speedup.
- The existing experiment URL, Scene, standard Compare, CPU production solver and all non-opt-in rendering paths are unchanged. Browser GPU/Canvas results are still required to establish actual parity.

- The control explicitly verifies **strict identical pixels** and matching outline/fill/unresolved counters in addition to >8/255 significant pixels. `identical` can be `true`, `false`, or `null` (unavailable readback). Missing CPU seeds invalidate a full replay-control equivalence claim. The report also includes both replay and GPU frame adaptive counts, with an unambiguous #140.12.11 top-level version even if an older standalone sample probe is included.

## #140.12.12 — GPU-first scene grid and end-to-end Compare performance gate

- **Separate experimental action** `Benchmark GPU-first full frame` in the existing Compare CPU/WebGPU mode. Existing sample, CPU replay control, Scene, Legacy and normal Compare paths are unchanged. The benchmark uses the A physical model (Globe or Flat, standard atmosphere) for both frames.
- A bounded **distance × height** grid is built directly from the independently authored current physical tower geometry (quantiles of tower distances plus ground-guide distance coverage; height axis from scene geometry). This step neither shoots any CPU rays nor discovers ray requests from a CPU reference image. The existing #140.12 WebGPU shader solves 128/256/512/1024 grid nodes in **one asynchronous GPU batch**, with the same explicit 1024-node maximum.
- The result is a deliberately **approximate optical lookup field**: interpolate the difference between GPU launch angle and analytic straight-line angle across neighboring grid points, and select the nearest available GPU visibility status for mixed-status cells. Failed GPU nodes are not secretly replaced with CPU shooting. The field serves both adaptive tower outlines/fills and ground-guide requests directly, bypassing the normal CPU-shooting prism field **only when the experimental `fullCoverageGrid` flag is present**. Mixed-status, extrapolated and indeterminate lookups, failed grid nodes, optical requests and CPU fallback count (zero for this path) are measured. This is not a certified interpolation scheme and is not production-authorized.
- **Actual end-to-end GPU time** starts before scene/grid preparation and ends after complete B frame paint: it includes geometry preparation, WebGPU device/pipelines, upload, dispatch, synchronization/readback, grid lookup and CPU painter. **Only after the GPU frame is complete** is a cold CPU reference A frame painted and independently timed. The CPU reference is NOT required as an input to the GPU pass. Both frames use the same existing physical scene renderer and per-frame overlays; WebGPU still computes the optical grid, not the 2D rasterization.
- JSON `curvature-compare-140.12.12-gpu-first-frame.json` reports `gpuFirstEndToEndMs`, `cpuColdReferenceMs`, `speedupCpuOverGpu`, `beatCpuColdReference`, `verdict`, grid geometry, failed GPU nodes, interpolation/coverage diagnostics, actual Canvas pixel differences and outline/fill/unresolved counts. `NO_END_TO_END_GPU_SPEEDUP` is explicit when the experiment loses the speed race. Faster without validated visuals is labelled `GPU_FIRST_FASTER_BUT_VISUAL_UNQUALIFIED`; **neither authorizes production**. There is no claim of 1px silhouette equivalence or measured browser performance before a real export.
- Node regression and real-scene smoke tests check grid construction, bounded GPU request acceptance, absence of CPU shooting in the new full-grid field path and controller sequencing. **Node cannot exercise browser WebGPU f32 compilation/execution**, so the user must run the new action and export JSON to decide whether the approach is actually faster and visually usable on their GPU.

## #140.12.13 — GPU predictor fast-path A/B at 50 m and 500 m

- **Opt-in research-only** `algorithm:'predictor'` added to the existing
  independent `CurvatureWebGPUBatchShooting1412.createSession`; all callers
  without this option retain the original two-pass 33-angle sweep/bracket
  implementation. The predictor is a distinct WebGPU compute pass, not a CPU
  estimate injected into the GPU workload. It tests a straight-ray starting
  angle and up to three guarded local secant corrections, independently
  re-integrates accepted target arrivals **with GPU ground-event sampling**,
  and stores results in the original response buffer. Failed/unverified
  candidates automatically pass to the **unchanged** two sweep/bracket stages.
  Sweep and refine shaders skip the targets accepted by the predictor.
- The twelfth mode of **existing** `tools/webgpu-optics.html` is
  `#140.12.13 — GPU predictor vs sweep (50/500 m)`, with Globe/Flat selection.
  It uses exactly **1024 distinct real polygon-edge targets** from the existing
  **12-tower fixture**, not replicated rays or invented raster pixels. For
  each of 50 m and 500 m, old GPU sweep and new GPU predictor run on exactly
  the same ordered targets. A separate CPU f64 reference with the CPU predictor
  enabled runs outside GPU timings; full GPU-angle CPU f64 replay and status,
  residual and ground-event comparisons are also outside GPU timings.
- `curvature-webgpu-optics-140.12.13-predictor-ab.json` includes CPU oracle
  wall time/solver counts; per-GPU mode session setup, first upload-to-readback
  and pipeline-reused warm times; direct predictor/sweep speedup; predictor
  accepted/fallback targets, GPU statuses, refinement iterations, physical
  parity failures and representative failing target indices. Readback-inclusive
  GPU times are not pure GPU timestamps or end-to-end rendering times.
- The only modified GPU pipeline is **explicitly requested** by the new
  diagnostic; original production CPU rendering and the #140.12.12 GPU-first
  Compare path are not silently changed. No automatic GPU production enablement,
  and no claim of actual WebGPU speedup or shader validation in a browser until
  a real export is provided. A faster batch with inaccurate f32 contact
  classification is not a qualifying result.

## #140.12.14 — fail-closed GPU predictor event guard with per-target f64 triage

- Adds a separate, explicit `algorithm:'predictor-guarded'` **research-only** mode.
  An arrival whose GPU ground-event classifier returns `indeterminate`
  (`contact=2`/status 3) is **not accepted** by the predictor, even when the
  shooting residual is within tolerance. It proceeds through the existing
  GPU sweep and bracket-refinement fallback. The original `sweep` and
  `predictor` shader variants, output contract and production CPU renderer
  remain untouched. A fallback result may itself remain `indeterminate`;
  there is no invented visibility or silent CPU correction.
- A thirteenth mode on the canonical `tools/webgpu-optics.html` page benchmarks
  **sweep / original predictor / guarded predictor** on the exact same 1024
  distinct 12-tower polygon-edge targets at RK4 steps 50 and 500 m, including
  independent CPU f64 predictor reference. The new JSON export is
  `curvature-webgpu-optics-140.12.14-event-guard.json`. Timings distinguish
  setup, first execution and pipeline-reused warm upload-to-readback times.
  Predictor success is counted only by the GPU telemetry sentinel (-2); all
  nonaccepted results count toward fallback, including failed fallback.
- The experiment records **all** status-disputed/unresolved targets, with
  target surface altitude, GPU/CPU ground evidence and independent CPU f64
  replay **at the GPU angle**, plus all event disagreement cases. It groups
  near-surface cases and replay ground detections to distinguish predictor
  acceptance problems from remaining f32 first-contact disagreement. These
  f64 checks are explicitly outside all GPU timings and do not serve as a
  hidden input to the GPU algorithm or timed batch.
- #140.12.13 reported 30 predictor-vs-CPU status mismatches at 500 m versus
  10 for the original sweep, even though 1024/1024 predictor paths were
  counted as accepted. The strict guard addresses **that acceptance bug**, not
  the remaining parity failures of the f32 sweep/event detector. Do not
  assume these mismatches are fixed until a browser WebGPU export confirms it.
- No production authorization, full-frame speedup or 1-pixel silhouette
  equivalence is implied by this change. Browser shader compilation/execution
  and speed/parity must be measured on actual WebGPU hardware.

## #140.12.15 — fast GPU predictor optical frame, cold/warm end-to-end gate

- Adds an **explicit opt-in Compare** button `Benchmark fast GPU predictor frame`,
  plus a separate grid-density selector (1024 / 2048 / 4096 default / 8192).
  The original GPU-first sweep control and 1024-target probe are retained.
- Builds the physical distance-height field directly from authored objects,
  **without CPU oracle-discovery frame or CPU shooting fallback**; denser scene
  grids are partitioned into deterministic <=1024 target batches using the
  original WebGPU session capacity. The `algorithm:'predictor'` WGSL path from
  #140.12.13 and RK4 step **500 m** are used only by the new action. No
  guarded ground-event fallback is enabled; uncertain near-ground visibility
  is intentionally retained for visual qualification at actual raster level.
- Two complete independent timings: **cold** = grid + GPU setup + all batches
  including readback + CPU Canvas B raster; **pipeline-warm** = new grid +
  repeated GPU batch inputs/readbacks on the SAME live session + cache-cleared
  full Canvas B raster. A separately forced-cold CPU A frame is measured
  afterwards, so GPU preparation never uses CPU frame discovery. Full-frame
  pixels, contour/fill/unresolved counts, mixed-status/extrapolated lookups,
  batch times, accepted/fallback counts and both speedups are exported in
  `curvature-compare-140.12.15-fast-predictor-frame.json`.
- The regular **synchronous** adaptive field cannot directly await GPU
  batches, so this is still an approximate scene-derived grid and **not a true
  CPU-guided adaptive GPU renderer**, GPU rasterizer, or production promotion.
  Larger grids may decrease visual error but are not guaranteed to do so.
  Browser GPU shader/actual frame speed/visible-image parity require a user
  export; Node and mocked grid samples cannot establish them.
- Existing CPU rendering and all older experiment algorithms are unchanged.

## #140.12.16 — equal-budget near-ground GPU field A/B in actual Compare frames

- Adds **Benchmark near-ground GPU A/B** next to #140.12.15, keeping
  the original fast predictor action untouched. Both variants have the
  same user-selected number (1024/2048/4096/8192) of GPU nodes, the same
  authored scene geometry, predictor shader, 500 m RK4 step and shared
  WebGPU pipeline. No CPU shooting or CPU reference drives field selection.
- The control is the original **uniform** 16-row vertical axis. The tested
  variant uses **distance-local near-ground** vertical coordinates: near
  observer columns place more nodes below the first few metres, smoothly
  reverting to the original axis by 6 km. Its field interpolates each
  distance column at its own height nodes before blending across distances;
  assuming one global height interval would be mathematically incorrect.
  The baseline field is not changed; the local variant is opt-in only.
- One click executes **uniform / local / uniform / local** complete GPU
  predictor fields and Canvas B frames, preserving both rendered bitmaps;
  separately forces cold CPU A **after all four GPU frames**. JSON records
  first and pipeline-reused full-frame timings by variant, GPU batches,
  acceptance/fallback, rendered contours/fills/unresolved, and actual pixel
  differences against CPU A across both the whole frame and a **fixed
  lower-left region** (left 55%, bottom 45%). The region is an approximate
  diagnostic that was subsequently identified as the **wrong side** of the
  user-observed near-tower base defect (the issue is lower-right), not
  segmentation of geometric surfaces and not an approval criterion.
- The report `curvature-compare-140.12.16-near-ground-ab.json` describes
  whether the selected region had fewer significant-pixel differences;
  it does not claim silhouette equivalence, a kernel-only benchmark,
  production approval, or a known speed win. Mock geometry/interpolation,
  batch ordering, cropped pixel comparison and UI integration are covered
  by tests; **actual WebGPU and frame pixels require a browser run**.

## #140.12.17 — lower-right equal-budget near-ground / vertical / near-distance GPU grid A/B/C

- Added a separate **Benchmark GPU grid A/B/C · lower-right** Compare action.
  It explicitly fixes all three variants at **4096 predictor rays** and the
  same 500 m RK4 step, independent of the older density selector. The old
  #140.12.16 A/B remains available unmodified; its historical lower-left ROI
  export is not retroactively relabeled as lower-right evidence.
- The baseline retains **256 distance × 16 near-ground height** nodes; the
  vertical candidate trades distance resolution for **128 × 32** nodes; the
  distance candidate retains **256 × 16** but redistributes distance columns
  to put roughly 45% at or below 6 km, following the original authored-scene
  distance distribution within both near and far segments. Near-ground height
  redistribution remains active in both new candidates; no CPU oracle pixels,
  ray solves or outside scene geometry guide the grids. The existing response
  order checks, per-column height interpolation and <=1024-ray batch capacity
  are unchanged.
- Performs **A/B/C/C/B/A** full WebGPU+Canvas B frames with a shared GPU
  predictor pipeline, capturing each full bitmap and actual renderer counts.
  The independent, forced-cold CPU f64 frame A is rendered only afterwards.
  Exports full-frame and **lower-right 45% × 45%** significant pixel counts,
  both run wall-clock timings and GPU lookup/uncertainty statistics per layout
  (including how many distance columns are <=6 km), and a machine-readable
  comparison versus the near-ground baseline. Restores the near-distance B
  image after measurement as an **untimed** UI redraw, not as an oracle-selected
  winner. The ROI is user-observed approximate coordinates, not a segmented
  ground silhouette. One warm frame per candidate is not statistical proof of
  timing superiority; visual comparison is not automatically approved.
- Export: `curvature-compare-140.12.17-grid-abc-lower-right.json`. The
  browser scripts have a new cache-busting query so stale Compare UI/code
  does not hide the action. The production CPU solver, nonexperimental Scene,
  earlier GPU experiments and visibility acceptance rules are unchanged.
  Browser WebGPU timings and actual pixel results are still **unmeasured**
  until the user runs the new button on GPU hardware.

## #140.12.18 — GPU query-selected sparse refinement versus a 4608-ray dense control

- Added **Benchmark adaptive GPU vs dense · 4608 rays** to Compare's optional
  CPU/WebGPU controls. The baseline is the #140.12.17 near-distance 256×16
  grid (4096 scene-derived predictor targets, RK4 step 500 m). Its actual
  physical **GPU B renderer** is painted first, with opt-in collection of
  problematic distance/height requests: mixed GPU status, indeterminate GPU
  status, out-of-grid extrapolation, or abrupt angle-correction variation.
  The risk ranking uses only the B renderer's GPU-field lookup context; CPU
  reference rays, pixels and CPU shooting do **not** select refinement rays.
  Candidates are de-duplicated and spread across grid cells; at most 512 are
  submitted in a second asynchronous WebGPU predictor request. Valid answers
  replace only the exact same (distance, height) lookup on a second B paint,
  never the neighboring interpolation; failed GPU nodes retain the base grid.
- A separately constructed **4608-node near-distance** 288×16 grid uses the
  same scene, GPU predictor and RK4 step, but distributes its additional 512
  rays uniformly according to the distance-focused scene quantile algorithm.
  Both variants share a single created WebGPU pipeline. If fewer than 512
  risky, distinct candidates are available, the exported report explicitly
  marks `sameRayBudget:false` and gives actual counts: no phantom rays.
- **Adaptive timing explicitly includes** first 4096-ray GPU discovery,
  its full Canvas B paint, the sparse GPU batch, and the final Canvas B paint.
  The 4608-ray dense candidate's whole field and frame are timed separately.
  GPU setup cost is separate. This design is conservative about adaptive
  overhead and is NOT a claim of algorithmic or end-to-end speedup.
- A forced-cold independent CPU f64 frame A is painted **after** GPU variants.
  The report includes whole-frame and correct lower-right 45%×45% significant
  pixel differences, status/fill/contour counts, per-variant frame timings,
  and 16×12 per-tile spatial heatmaps using the same >8/255 channel difference
  criterion. Two visible heatmaps (adaptive/dense) share a color intensity
  scale, with the lower-right ROI outlined. The maps visualize evidence and
  are **never used** to select extra GPU targets. All GPU experiments remain
  opt-in, CPU production renderer and earlier Compare controls unchanged.
- Export: `curvature-compare-140.12.18-adaptive-vs-dense.json`. The result
  is a measured experiment requiring browser WebGPU to assess improvements;
  no visual parity, performance win or production authorization is presumed.


## #140.12.19 — controlled near-tower analytic geometric projection versus GPU refraction

- Adds a **Compare near-tower geometry vs GPU · 1.5/3/6 km** button to the
  optional Compare CPU/WebGPU diagnostics. The scene's authored objects,
  model, camera, ground guides, fills and outlines are all rendered by the
  same physical scene adapter and Canvas painter. The 4096-ray near-distance
  GPU predictor baseline (500 m RK4 step) is computed **once**; the three
  other physical B frames reuse this same GPU field rather than changing ray
  count or cold/warm GPU pipelines.
- Geometric variants replace only distance/height target requests at or
  inside **1500 m**, **3000 m** or **6000 m** with the **existing production
  analytic vacuumSample**. It uses the real spherical-surface point and
  geometric Earth horizon / visibility (or exact flat branch), not a local
  planar or always-visible shortcut. Far targets keep the unchanged refracted
  GPU field. The distance split is deliberately hard to reveal if a boundary
  itself introduces artifacts; no smooth blending or production promotion is
  implied. Nearby *ground-guide queries* are included in the geometric branch
  as a documented limitation of this full-frame control.
- A paired audit records unique near-field renderer requests, numbers of
  ground/above-ground requests, status disagreements, invalid GPU angles,
  mean/max absolute GPU-versus-geometric angle difference in arcseconds;
  `nearGeometricField` serves analytic values while sampling the original GPU
  field for the comparison. No CPU tracer/shooting is called in the GPU branch.
- Takes the four B canvas snapshots first and then renders forced-cold
  independent CPU f64 A **afterwards**. Reports full-frame and correct lower-
  right ROI (>8/255 significant-pixel) differences from CPU, differences versus
  GPU-only baseline, current renderer contour/fill/unresolved counts, and
  separate shared GPU grid time and each Canvas paint time. No artificial
  per-variant GPU compute time is claimed: all variants reuse the GPU grid.
  Displays the predetermined 3 km geometric variant after the experiment,
  without selecting the best variant based on CPU data.
- Export: `curvature-compare-140.12.19-near-geometric-projection.json`.
  This tests the hypothesis that near-field discrepancies originate mostly
  from optical approximation rather than physical geometry projection. It
  cannot yet isolate shape topology or certify visual equivalence; actual
  WebGPU/Canvas measurements must be run in the browser.

## #140.12.20 — CPU f64 versus GPU field and direct GPU visibility at actual renderer targets

- Adds an **Audit lower-tower visibility · CPU vs GPU** button to the opt-in
  Compare CPU/WebGPU diagnostics. It renders the existing 4096-ray
  distance-focused GPU predictor frame (RK4 500 m) through the *unchanged*
  physical scene adapter and Canvas renderer. The only instrumentation is a
  transparent field wrapper that records the renderer's actual `(distance,
  height)` `sample`/`exact` calls, their returned interpolated status and
  angle. The wrapper never changes an optical answer.
- Captures unique targets in the **0–6 km, 0–20 m** envelope and selects up to
  **128** targets in distance-stratified bins. At most one eighth of the batch
  can be zero-height requests, because those may be ground-guide samples.
  Above-ground requests are *low-height queries*, not certified vertex or
  tower-primitive identities; no source-primitive attribution is claimed.
  Target selection is based exclusively on the actual B renderer queries;
  neither CPU f64 samples nor CPU image pixels guide selection.
- Sends the exact same selected spherical-surface coordinates to one direct
  WebGPU predictor batch and the existing `CurvatureOpticalBatchContract1411`
  CPU f64 batch solver. CPU uses the physical frame's automatically selected
  standard-atmosphere RK4 step (typically 2000 m) and a tighter 1e-6 m
  target tolerance; direct GPU uses RK4 500 m and 0.005 m tolerance. These
  unequal numerical controls are **explicitly reported**. CPU is an oracle
  only for this bounded diagnostic, never a GPU fallback or repaint source.
- Reports three-way status confusion and angle differences, counts of
  CPU-visible targets rejected by the interpolated/direct GPU paths,
  recovered-versus-new direct-GPU mismatches, per-distance-band counts,
  status categories, and first-ground-contact evidence for each target.
  Ground contact on diagnostic samples does not by itself prove which
  geometry primitive was omitted from the painted frame. Also includes the
  original GPU B physical-frame contours/fills/unresolved counts, full-frame
  and **lower-right** pixel difference vs cold independent CPU A, plus
  separately measured GPU grid, direct GPU target, CPU target and CPU frame
  timings. The B frame is not modified by the audit.
- Export:
  `curvature-compare-140.12.20-renderer-visibility.json`.
  The result distinguishes a likely interpolation/status decision problem
  from disagreement in direct GPU ray shooting. It does **not** certify
  silhouette equivalence, production performance, or a GPU-first release.

## #140.12.21 — GPU-only visibility status and fine-step contact-qualification controls

- Adds a Compare-only **Compare GPU status qualification · lower towers**
  diagnostic with two independent checkboxes: **Direct GPU status-only** and
  **50 m GPU contact qualification**. CPU f64 remains the unchanged reference
  frame and is calculated *after* all GPU variants.
- The initial GPU B frame uses the existing near-distance **4096-ray** grid,
  predictor RK4 **500 m**; it transparently captures actual renderer optical
  queries in the **0–6 km, 0–20 m** envelope. A deterministic, distance-
  stratified selector chooses up to **128 queries actually classified
  `indeterminate` by the grid**, never CPU-discovered pixels or CPU ray
  statuses. Original 4096-ray scene and B renderer are otherwise untouched.
- Direct GPU shooting at **500 m** can replace a grid query's *status only*
  when its own answer is `visible` or `blocked`. Already `visible` or `blocked`
  grid decisions are never changed; the grid **angle is never overwritten**.
  Unresolved direct results never imply visibility. The second independent
  control re-shoots **only still-indeterminate direct targets** with a **50 m**
  GPU RK4 step and optionally uses a certified `visible`/`blocked` result.
  A `solver_failed` or `indeterminate` fine result leaves the target
  unchanged. No heuristic contact override, assumed endpoint visibility,
  or CPU fallback is allowed.
- When both controls are enabled, the diagnostic paints base / direct-only /
  fine-only / combined frames. Each variant reports renderer counts, actual
  unique status upgrades, full-frame and **lower-right** significant pixels
  against a cold CPU f64 reference, and changed pixels versus the original
  GPU frame. The JSON also includes direct versus fine-step statuses,
  crossing/grazing contact counts, extra GPU target counts, and separate
  timings for initial grid, first discovery paint, 500 m direct batch,
  optional 50 m contact batch, subsequent paint(s), and CPU reference.
  An independent CPU f64 target audit runs only after every GPU B variant
  is finished and records per-target status and pre-endpoint contact distance
  for both 500 m and 50 m GPU calculations. No CPU result feeds back into B.
  This is deliberately **not** an optimized single-pass implementation:
  discovering the renderer's queries still requires the initial paint.
- Export: `curvature-compare-140.12.21-gpu-status-qualification.json`.
  The experiment determines whether GPU status-only correction or sensitivity
  of first-contact detection to RK4 step changes the missing tower-base
  geometry. Pixel equivalence, production approval and speedup are not claimed.


## #140.12.27 · Bouguer spherical-invariant contact audit (diagnostic only)

- The Globe/standard profile is radially stratified: `n(h)=1+0.000293*exp(-h/7350)` by default. For a straight surface-normal coordinate `r=R+h`, `b=n(r) r cos(alpha)` is conserved in exact geometrical optics. This does not hold for Flat geometry with its own vertical stratification or arbitrary horizontally varying profiles.
- The new **Audit Bouguer invariant · analytic ground angle** Compare button runs GPU-first 48-target shooting, a **separate 256-node f32 invariant quadrature**, and independent GPU fixed-angle RK4 ground evidence. Only *after* all GPU work it computes the CPU f64 shooting oracle, 2048-node radial invariant quadrature, and CPU f64 same-angle RK4 replay.
- With `F(r)=n(r)r` strictly increasing over the observer-to-ground altitude interval and an inward launch angle, `log(b/F(R)) > 0` implies an above-ground turning radius. Otherwise the first-ground polar angle is an integral over altitude; `h=h0*u^2` regularizes near-tangent integrability. The ground-event decision compares this angle against the **geometric target polar angle**, not an RK4 endpoint path length. An initially outward ray cannot strike the surface on this monotone radial branch. The module rejects unsupported profiles, Flat geometry, and nonmonotone `F`.
- f32 uses dimensionless `h/R` and stabilized `log1p`/`expm1` polynomials to avoid subtracting kilometre-scale radii; f64 uses native `Math.log1p`/`Math.expm1`. The two quadrature resolutions and margins are exposed in exported JSON to assess numerical truncation. Neither is certified/interval arithmetic, especially near tangency.
- No CPU angle is fed to GPU, no CPU fallback, no production authorization, and **no change to scene painting or ray classifications**. A near-endpoint ground crossing for a ray *not exactly aimed at the target* is not a proof that the target is occluded.
- Export: `curvature-compare-140.12.27-bouguer-invariant.json`. Runtime shader compilation still requires a browser WebGPU pass.


## #140.12.28 · Isolated GPU arithmetic precision foundation (diagnostic only)

- The new **Audit GPU arithmetic · f32 / double-single / integer residuals** Compare button compiles three **separate WebGPU compute pipelines** on the actual adapter. It requires no optical scene assumptions and works while the UI is in the CPU/GPU Compare experiment. Its fixed vector set includes global Earth radii, 1 cm and 1 µm local deltas, 1-ULP and half-ULP cases, negative cancellation, refractivity-scale differences, ratios, multiplication, division, and square root.
- Input JS `Number` values are split into `f32` hi/lo on the CPU and transported without throwing the low limb away. The GPU evaluates **native f32**, **classic double-single**, and **integer-residual double-single** separately; JS f64 references are calculated only for the exported report and are never used to substitute GPU results.
- Classic DS uses floating-point `TwoSum` and Dekker `TwoProd` and **cannot be considered portable** under WGSL reassociation/fusion. The integer-residual path reconstructs the high-high addition/product rounding residues with two-word `u32` arithmetic, including 24-bit significand multiplication, then applies DS cross terms/correction. It is **not a complete integer-controlled IEEE binary64 implementation**: low-limb/cross-term expressions still use native f32, and the bounded transform only targets finite normal f32 intermediates; subnormals, overflow, extraordinary exponents, and full binary64 rounding are unsupported. This version is a comparative experiment, not a certified arithmetic library.
- Correctness uses a one-operation dispatch and readback. Performance performs one untimed warm pass followed by five timed **128-iteration** passes for each separate pipeline. Measurements are wall-clock dispatch+map readback (not GPU timestamp-query kernel time), not production rendering throughput; no optics are integrated.
- Report: `curvature-compare-140.12.28-gpu-arithmetic.json`, with per-vector input, f64 oracle, split result, absolute/relative errors and per-mode warm median timings. GPU adapter compilation must still be tested in a real WebGPU browser; Node mocks alone do not establish shader validity or numerical fidelity.
- No changes to CPU shooting, GPU shooting, Bouguer integrals, Flat/Globe physics, visibility classifications, or renderer painting. This experimental tool does not authorize production use.


## #140.12.31.3 · WGSL compilation cost isolation / fast audit (diagnostic only)

- On the user's 48-ray #140.12.31 report, the combined two-shader setup took **55,393.4 ms** out of **57,903.3 ms** end to end. It had not separated `getCompilationInfo` from `createComputePipelineAsync` or measured the two shaders individually. It is not evidence of which shader/compiler phase caused the delay.
- The two arithmetic variants produced identical 48-ray contact classifications and measured numerical errors on that device. Integer-residual dispatch/readback was substantially more expensive in the measured run. **Default** #140.12.31 now compiles/runs **classic DS only** (128/256/512 nodes), and the **Include slow integer-residual DS** checkbox explicitly enables the original full six-variant comparison. Reports list only modes actually executed and include `integerResidualEvaluated`. No skipped mode is implicitly certified.
- Each DS WGSL program now imports unchanged, required arithmetic functions from the single #140.12.28 helper source and renames the selected `TwoSum`/`TwoProd` implementation to the shared interface. Unused integer/float-only/benchmark helpers and the constant `MODE` dispatch are omitted from the generated source; the actual invariant/atmosphere/integrand/quadrature formulas and input/low-limb layout are unchanged. This source-level specialization is **not** proof of improved real browser compilation, WGSL conformance, or numerical identity across every GPU/optimizer.
- In quick mode `createComputePipelineAsync` validates WGSL directly, skipping a potentially redundant eager `getCompilationInfo`; if the pipeline fails, compilation diagnostics are fetched to obtain the WGSL error. Full mode retains eager diagnostics for both shaders so validation and pipeline costs can be compared. Individual shader timings capture `createShaderModule`, optional `getCompilationInfo`, and `createComputePipelineAsync` in `compilationTimings` along with the original `phaseTimings` and `totalElapsedMs`. The UI shows elapsed waiting time during asynchronous pipeline preparation and exports failed-stage timing with error JSON. These are host wall-clock durations, not pure GPU kernel measurements.
- Same 48 independently predicted GPU angles, same f32 quadrature control and same CPU f64/reference ordering. No change to production rendering, shooting, contact classification or scene painting. Repeat both quick and full audits on the user's real WebGPU device before claiming compiler speedup or portable DS equivalence.

## #140.12.32 · GPU-owned high-precision radial shooting audit (diagnostic only)

- **Audit GPU DS shooting · Bouguer 256 / 512 nodes** in the existing `CurvatureModern.html` Compare CPU/WebGPU panel. One 48-ray f32 GPU predictor batch supplies seed angles only; the *new* GPU shader runs its own classic double-single secant iterations, independent at 256 and 512 quadrature nodes. The target-polar residual is evaluated with radial Bouguer integration from observer height to the exact target height, using **two-limb angle, target height, distance and radius**. The same final GPU angle limbs are used to compute a separate DS ground-contact margin; high/low parts survive readback. No CPU-picked angles, scalar root corrections, or CPU fallback feed the GPU shader. One specialized WGSL pipeline is compiled and reused with node count in the configuration buffer.
- **Limited branch**: Globe + vacuum/standard monotone radial atmosphere, observer height <=200 m, target 0..min(200 m, 0.02×scale height), target height different from observer, *single monotone radial leg to target*. The default 15 m / 48-ray precision ladder is supported. Turning paths, non-monotone ducts, large angles, and all geometry outside the polynomial domain fail closed; this audit does not establish a general ray solver or certified visibility.
- CPU **f64 2048-node radial shooting roots**, f64 same-angle polar residuals, CPU f64 Bouguer ground margins and independent CPU f64 RK4 shooting are computed **after both GPU passes**. The report includes convergence/unresolved counts, GPU-to-CPU root angle deltas, initial predictor corrections, same-angle CPU residuals, ground discrepancies beyond 1 cm, and explicit 1 cm **uncertain** contact margins. A tiny signed ground margin (particularly at surface targets) is **not** proof of crossing or visibility. Compare for scientific diagnostics only, never production classification.
- Performance: one specialized classic DS WGSL pipeline, 256+512 dispatch/readbacks, per-phase timings with elapsed state in UI, automatic success/error JSON (`curvature-compare-140.12.32-gpu-ds-shooting.json`), manual Export JSON retry. The GPU execution and shader validity require running in a working WebGPU browser; Node tests with mocks and f64 references are not substitutes for an actual GPU result. Previous audits, canonical `tools/webgpu-optics.html`, production optics, scene rendering and shooting remain untouched.


### #140.12.34 — Real full-frame CPU/GPU predictor pixel parity (research only)

- The Compare-only button **Audit full-frame CPU/GPU pixel parity · 4 camera views** computes an independent 4096-sample scene-derived WebGPU **f32 RK4 predictor** grid (step 500 m); it does **not** use the 48-ray classic DS shooting module from #140.12.32/33. The existing experimental grid-to-physical-painter bridge paints B on the real Canvas, without CPU shooting fallback. The CPU f64 scene A is rendered separately. No production optics/backend is changed.
- Run four true camera redraws (upward tilt, downward tilt, 1.5× focal length, actual current camera); B is cloned from A for the same Globe/standard atmosphere, optical geometry, objects and framing. Reuse a single independent GPU field across cameras, never use A pixels or CPU shoots for GPU sample discovery. Temporarily suppress horizon/eye-level guides; require both turbulence overlays off and Canvas 2D; reset every temporary state even on errors. CPU A is cold-redrawn twice per case and any repeat differences >8 channels abort the audit.
- Pixel measures are actual two-Canvas backing-store RGBA comparisons: changed pixels, >8/255 white-composited significant pixels, MAE, maximum channel delta, painted-vs-white coverage mismatches, lower-right 45% ROI, per-row/per-column/tiled breakdowns and a ±15% height *zero-elevation* band with matched strong vertical-luminance transitions. This band is **not** an identified physical horizon, and painted-vs-background is **not** a semantic sky/ground mask. Static significant-pixel difference heatmap and JSON `curvature-compare-140.12.34-full-frame-pixel-parity.json` are exported.
- The JSON explicitly sets `gpuDoubleSingleShootingUsed: false`, `dsFullFrameParityEstablished: false`, `productionAuthorized: false`. This frame comparison qualifies the existing GPU predictor interpolated path only, separating visual rendering errors from #140.12.33's isolated 48 DS rays; DS integration into the actual full-frame renderer requires a later change.
- All GPU samples use WebGPU; Canvas 2D still rasterizes. Actual browser GPU execution and real viewport equality require user-side browser run; Node tests are not substitutes for WGSL compilation or visual qualification.
- Project rule unchanged: reuse the sole canonical `tools/webgpu-optics.html` experiment page. Never create a version-numbered tools/ HTML file.

### #140.12.37.2 — Geometry audit script-cache and error propagation fix

- Fixed a mixed-version browser load: #140.12.37 and .37.1 changed optical geometry collectors, unresolved-leaf hooks and Canvas capture code without updating the Modern HTML asset URLs for all four providers. The browser could load a new `ModernApp.js` with old optics/renderer scripts, causing `Optical geometry/camera was not captured` at the first `tilt-up / baseline` paint.
- All hook-bearing modules (`OpticalTowerSilhouette`, `CurvaturePhysicalPolygonFills`, `CurvaturePhysicalSceneOptics`, `CurvatureMainCanvasRenderer`) now have `?v=140.12.37.2` cache keys, matching the Modern diagnostic/app revision. The audit checks exported hook revisions before GPU computation to fail early on mixed caches. Actual paint errors are rethrown during explicit attribution and no longer disguised as a missing-geometry error; the collector reports which camera/scene inputs are missing.
- No shader, ray solver, triangulation or production draw behavior changed. Re-run the real WebGPU browser audit with a hard refresh to verify end-to-end export.

## #140.12.38 — Camera-first CPU f64 ground-contact oracle (diagnostic only)

- Added `src/diagnostics/CurvatureCameraFirstOracle141238.js`: an independent **forward** first-Earth-contact query for 64×64 actual Compare A camera directions, spherical-symmetry meridian reduction, vacuum independent analytic sphere intersections, standard-atmosphere RK4 with bounded 30 km range, and 41 same-angle horizon convergence rays (250 m/100 m). Uses shared physical ray ODE/RK4 but **not** target shooting, GPU grid, interpolated statuses, physical-scene polygons, or z-buffer.
- Added opt-in `ModernCameraFirstOracleRun` alongside existing Modern Compare diagnostics; exports `curvature-compare-140.12.38-camera-first-cpu-oracle.zip` with complete sample JSON, 5 PNG visual diagnostics and README. No WebGPU requirement. Never modifies Compare A/B models or production rendering.
- Added `tests/CameraFirstOracle141238.test.js` and `docs/camera-first-cpu-oracle.md`. Vacuum f64 output is checked against analytic line/sphere hit classification and near-side contact distance; the atmosphere is sampled at the exact same launch directions with different RK4 steps.
- This is **not** a full 3D image (objects/towers are not intersected) or a proof of infinite-sky visibility. `range` means no first ground contact **within 30 km**. Do not interpret the result as pixel-perfect equivalence with the existing CPU scene renderer. Original GPU/WebGPU and canonical `tools/webgpu-optics.html` remain unchanged; never create per-experiment HTML pages.

## #140.12.39 — Camera-first CPU world-object intersection audit (diagnostic only)

- Added independent forward CPU f64 *rendering architecture* diagnostic against authored metric 3D object faces: actual Compare A physical camera rays; real-world triangles; first intersected opaque object or Earth by ray path distance; 64×64 full frame plus focused 64×64 around a projected scene object. Atmospheric integrator and tracer remain shared with #140.12.38, so this does **not** independently validate RK4 itself.
- Important scene fact: most existing towers are **outline-only**; first-hit against physically authored opaque fills cannot reproduce their Canvas strokes. Export separate **nonphysical outline-as-opaque proxy** maps and never treat those as certified visibility. Report triangulation failures and real object provenance (`sourceIndex`).
- Fixed 100 m ray chord sampling, 30 km limit; bounded 50 m convergence replay on up to 128 object/proxy-hit pixels and neighbours. No claim of certified grazing or subpixel intersections, geometric thickness for lines, or full 3D coloured image equivalence.
- Modern Compare adds opt-in `ModernCameraFirstObjectsRun`, exports `curvature-compare-140.12.39-camera-first-objects.zip` with full JSON, first-hit masks, focused ROI and a separately labelled direct sample of the **existing** Compare A CPU Canvas. No WebGPU / WGSL, no production painter or existing solver changes; original #140.12.38 audit remains available. Canonical `tools/webgpu-optics.html` unchanged.
- Details: `docs/camera-first-object-intersections.md` and `tests/CameraFirstObjects141239.test.js`.

## #140.12.42 — CPU f64 Flat/Globe quadrature shooting feasibility (diagnostic only)

- Added `src/diagnostics/CurvatureCpuQuadratureFeasibility141242.js`, using **native JS f64** and conserved momentum `p=n(h)cos(alpha)` for Flat or `b=n(h)(R+h)cos(alpha)` for Globe with vertical/radial vacuum and exponential-standard atmosphere. On single **monotone-height** paths, compute horizontal distance (Flat) or polar angle (Globe) with cached Gauss–Legendre nodes and a square-endpoint substitution, then solve the one-dimensional angle bracket. The numerical quadrature/root is not a certified visibility solver. Equal-height, returning, turning, ducting, unsupported profile or unbracketed paths explicitly return `unsupported`.
- New opt-in Modern Compare button **Benchmark CPU f64 · RK4 vs Flat/Globe quadrature + hybrid · ZIP**. Sample the same 48 authored metric object edges as #140.12.40; for Flat convert the same object-point horizontal distance and physical altitude into the Flat geometry. It compares four CPU modes separately: unchanged RK4 reference, existing predictor-only RK4, quadrature-only angle, and quadrature-seeded original RK4. The hybrid passes the candidate as `shootingWarmStartAngle`; the **unchanged RK4** still performs residual testing, full forward shooting fallback and ground-contact verification. Numerical angle comparison and status/ground parity refer to this RK4-verified hybrid, not to quadrature-only independent ground verification.
- Five timed rounds after one warm-up; reports contain per-target counts, candidate support, RK4 warm-start acceptance/fallback, status and ground mismatch, warmed median timings (including quadrature overhead), `flat-targets.csv`, `globe-targets.csv`, separately audited ground/equal-height stress CSVs, `performance.svg`, README and `results.json` in an automatically downloaded ZIP. Predictor-only RK4 is a critical control to avoid crediting existing predictor improvements to the new integral.
- **No WebGPU, no shader changes, no painter or production optical changes.** Results cannot certify branch completeness, tangencies, multipath or frame parity. Do not promote the candidate to production based on this experiment alone. Reuse canonical `tools/webgpu-optics.html`; no versioned tools HTML pages.

## #140.12.43 — Globe conformal and effective-radius CPU f64 experiment (diagnostic only)

- Added `src/diagnostics/CurvatureCpuConformalGlobe141243.js` and the opt-in Modern Compare button **Benchmark Globe CPU f64 · effective radius vs conformal predictor · ZIP**. Reuse the same 48 authored physical Globe targets from #140.12.42 and compare **existing RK4+predictor**, **surface-matched inverse-exponential angle + unchanged strict RK4**, and **exact-conformal-medium 2-step RK4/2-Newton angle + unchanged strict RK4**. Report full predictor+RK4 time, acceptance, fallback and status/ground parity, with 5 warmed rounds.
- Conformal variables `x=Rφ`, `u=R ln(r/R)` give an exact flat optical medium `m(u)=(r/R)n_s(r)` for a spherically stratified atmosphere, but the two-step numerical predictor and the single inverse-exponential replacement are approximations. Match near-surface `d ln(m)/du` to obtain `1/R_eff=1/R-N/(H(1+N))`, report analytical angle errors against original RK4 and classical `4R/3` separately. **Neither predictor decides visibility, ground contact or multipath; original RK4 remains sole authority.**
- The downloaded `curvature-compare-140.12.43-cpu-f64-conformal-globe.zip` includes `results.json`, authored/stress/extended-distance CSVs, median-time SVG and README. Eight ground/equal-height stress cases and 40 long-range/altitude envelope cases are **not** mixed into the primary performance sample. The test does not represent a full frame.
- No changes to production shooting, painter, WebGPU/WGSL, or canonical `tools/webgpu-optics.html`. See `docs/cpu-f64-conformal-globe.md` and `tests/CpuConformalGlobe141243.test.js`.

## #140.12.44 — Adaptive conformal Globe CPU f64 shooting (diagnostic only)

- Added `src/diagnostics/CurvatureCpuAdaptiveConformal141244.js`. Reuses the existing exact-conformal, standard-atmosphere coarse shooting from #140.12.43; compares baseline RK4+predictor, fixed 2-step conformal, adaptive RK4 2/4/8/16-step shooting, and adaptive with **local Richardson angular extrapolation**. Adaptation uses observed step-doubling angular differences scaled to projected height, not a claim of physical contact or branch completeness. Short paths retain the two-step fast path; near-surface paths use a stricter numerical estimator.
- Every candidate is fed only into **unchanged** `OpticalTargetProjection.solve` as a warm-start angle. That solver still decides whether a candidate meets the original endpoint/ground tolerance and executes its usual RK4 fallback and first-contact verification. No approximate predictor is permitted to decide visibility or ground contact.
- The new Modern Compare button `ModernCpuAdaptiveConformalRun` exports `curvature-compare-140.12.44-cpu-f64-adaptive-conformal.zip`: five warmed rounds on **48 real physical Compare A object-edge targets**, plus eight independently reported surface/equal-height stress cases and two 20-target altitude/distance envelopes (eyes at 15 and 100 m, three rounds each). ZIP includes JSON, CSVs, SVG median-time plot and README; raw per-target acceptance, fallback, number of RK4 calls, prediction effort and parity are exposed.
- This is diagnostic only. No new versioned HTML under `tools/`, no GPU/WGSL changes, no production renderer/shooting changes. No claim of full frame/pixel parity or correctness for all multipath branches. See `tests/CpuAdaptiveConformal141244.test.js` and `docs/cpu-f64-adaptive-conformal.md`.


## #140.12.46 · Conformal Globe CPU f64 performance profiling (experimental)

- `src/optics/OpticalConformalPredictor.js` now keeps the original array-based
  RK4 predictor as the `reference` numerical oracle and exposes two independent
  opt-in variants: `gradient` uses a single stable `expm1` result to recover
  both transformed height and radial scale, while `fast` also removes array
  mapping and temporary RK4 state allocations. Both still use the same fourth-
  order RK4 equations, Newton corrections, adaptation and Richardson angle
  refinement. They supply **untrusted candidate angles only** to the original
  `OpticalTargetProjection.solve()`; all first-ground-contact and visibility
  classifications remain solely with the strict physical RK4 solver.
- Explicit `shootingOptimization` values in `OpticalSharedRayField`: `conformal-reference`
  (former implementation), `conformal-gradient`, and `conformal-experimental`
  (optimized scalar variant). All are disabled by default and are limited to
  spherical geometry with standard exponential atmosphere. All previous
  production/Compare paths stay unchanged when the toggle is off.
- Modern Compare button **Profile conformal RK4** performs one JIT warm-up
  and eight order-rotated timed *cold optical field* physical Canvas renders
  each for the ordinary predictor, reference conformal, gradient-only, and
  optimized scalar. It exports actual PNGs, strict pixel comparisons, contour/
  fill counters, per-round timings and RK4 work in a ZIP. A separate per-stage
  profiler samples up to 256 actual baseline exact-ray requests and times
  gradient evaluations, two-step coarse RK4 and full adaptive candidates. No
  repeated ray-field cache is included in the measured full frame.
- This is a diagnostic experiment, NOT authorization to enable conformal
  shooting by default. Microprofile speedups are not end-to-end gains. Strict
  last-frame parity is scene-specific, not proof of all ground/multipath cases.
- Do not create version-numbered HTML pages for further experiments; reuse
  canonical `tools/webgpu-optics.html` and the existing Modern Compare page.
  Validate WGSL compilation (not just JavaScript syntax) for any shader edits,
  or explicitly state when actual GPU shader compilation was not performed.

### #140.12.48 — production RK4 trace optimisation experiment (2026-11-03)

Three explicit **standard-atmosphere-only** experiments (`traceOptimization: 'fused-gradient'` and `'fused-preflight'`) was added to `OpticalRayTracer` / `OpticalTargetProjection` / `OpticalSharedRayField` without changing the default shooting/ground detector. The first reuses one standard exponential while preserving arithmetic; the second additionally proves some above-ground RK4 segments clear using a conservative curvature and altitude-slope bound before falling back to the existing chord/event check; the third runs scalar RK4 staging to reduce temporary array allocation. Per-frame `preflightGroundSteps` instrumentation and an order-rotating 8-frame Modern Compare PNG+JSON ZIP audit were added. Details and limitations: `docs/cpu-trace-optimization.md`. The experiment is not production-promoted; review strict browser pixel parity and median full-frame duration first.

### #140.12.49 — Fused-gradient standard RK4 production gate (diagnostic only)

- Built-in standard-atmosphere `fused-gradient` is a candidate from #140.12.48, **not** yet enabled by default. Preserve original RK4 and all custom/engineered atmosphere paths.
- Modern Compare includes **Gate fused gradient · 4 Globe scenes × baseline/fused · 4 hot frames · PNG + JSON ZIP**. Four independent Canvas scene configurations cover authored view, low eye/near foundations, horizon-distance foundations, and long-distance high-eye foundations. Each uses separate optical sessions, AB/BA order, full-image strict RGBA parity, structural counters, and actual PNGs.
- Tests: `node --test tests/OpticalFusedProductionGate141249.test.js`; local CPU benchmark: `node tools/benchmark-fused-multiscene-140-12-49.js --rounds=4`. See `docs/fused-gradient-production-gate.md` for scope, acceptance criteria, and untested multipath/viewport limits. No new HTML page or automatic production promotion.

### #140.12.50 — Built-in standard fused-gradient promotion with explicit legacy rollback (2026-11-03)

- The physical shared-ray field and prepared point-to-point shooting now select the previously audited `fused-gradient` RK4 derivative **by default for the built-in `standard` exponential atmosphere**. `traceOptimization: 'legacy'` explicitly restores the old two-evaluation `n(h)`/`dn(h)` derivative and original RK4 step; the previous `fused-preflight` and `scalar-rk4` remain opt-in experiments. The original raw ray tracer's `atmosphere('standard')` function pair remains available unchanged as a diagnostic oracle.
- Any externally provided `profile`, including `custom`, and all other atmospheres remain on their former paths; no implicit optimizations are injected there. Internal experimental flags are overridden by an explicit `legacy` request. Unknown standard trace modes fail clearly.
- The #140.12.48 and #140.12.49 Modern Compare baselines are now **explicitly `legacy`** to avoid accidentally benchmarking fused vs fused after the promotion. Each frame still uses isolated optical sessions, rotated A/B timing and strict RGBA comparisons.
- No shader, GPU, conformance/ground-event, painting or conformal shooting changes. See `docs/fused-gradient-production-promotion.md` and `tests/OpticalFusedProductionPromotion141250.test.js`. The four browser gate scenes were pixel-identical and 10–19% faster in the user-supplied #140.12.49 report, but other profiles, viewports and multipath branches have not been certified by those scenes.

### #140.12.94 — Temperature gradient in Modern Physical

Added independent dry-hydrostatic `temperature-lapse` atmosphere, with surface temperature, pressure and local gradient parameters in Scene and Compare A/B. The existing Legacy coefficient model and fixed Modern Standard exponential are unchanged. The Physical RK4 tower, ground guide and horizon solvers use the same temperature profile; cache keys include profile inputs. Optional 0–2 km temperature column is a **DOM overlay**, not ray or pixel modification. Temperature settings and column visibility round-trip in Modern experiment links and JSON, old links migrate by safe defaults. Model is an *idealized exponentially relaxing boundary-layer lapse*, not constant `dT/dh` at all heights, not measured meteorology or humidity. See `docs/temperature-gradient-modern.md` and `tests/ModernTemperatureGradient.test.js`.


## Modern camera navigation and reusable poses

- The shared physical Scene/Compare camera supports focused-viewport keyboard navigation (W/A/S/D, Q/E, arrow-key Pan/Nick), adjustable movement and turn rates, and optional fixed Alt-wheel steps. Keyboard movement updates the pose while held and calculates the full optical scene on release; it is not live continuous physical rendering.
- East/North can be edited numerically. Named camera positions (including coordinates, orientation, focal length, aim and aspect) are stored as optional `cameraPositions` in Modern experiments, without extending Legacy state or changing physical A/B configurations. Up to 20 poses support save, restore, update, rename and delete; camera reset returns to the loaded workspace starting pose. Navigation speed is separately stored in local browser preferences.
- Future offline camera animation and video export remain deferred. See `docs/modern-camera-navigation.md` for the control contract and limitations.

### Experimental fast optical preview (standalone mathematical field)

- `src/optics/OpticalFastRayField.js` provides a low-cost, independently selectable
  2D field candidate using constant *conformal* log-gradient, with analytic
  forward-branch solutions for vacuum and flat engineered exponential endpoints.
  Built-in Standard is approximate, with explicit near-contact uncertainty and
  no automatic RK4 fallback; unsupported profiles never turn into visible rays.
- This module is **not connected** to Modern Scene/Compare rendering, navigation,
  or Legacy. The Accurate path remains unchanged. See
  `docs/fast-optical-preview.md`, `tests/OpticalFastRayField.test.js` and
  `tools/compare-fast-ray-field.js`. Production integration and camera Auto
  preview must follow separate pixel-accuracy and scheduling reviews.

### Manual Fast Preview in Modern (next integration stage)

- `CurvaturePhysicalSceneOptics` can now consume `OpticalFastRayField.sample()` for
  object silhouettes, fills and physical ground guides with no hidden RK4
  fallback. The ordinary Accurate field remains unchanged; the quality is
  explicitly keyed and independent Scene/Compare A/B preview sessions are used.
- Modern → Display offers manual `Accurate / Fast Preview` control. Accurate is
  the default; this display choice does not enter experiment URLs/JSON. Exact
  horizon overlays are disabled in Fast mode. Unsupported profiles are refused
  and the corresponding viewport is cleared instead of retaining stale pixels.
- Preview-specific contact margin is 0.1 m (versus 3 m in standalone Standard
  diagnostics): this is a visual approximation, **not** a verified confidence
  bound or a replacement for exact ground-contact detection. Browser pixel
  parity, mixed-profile and end-to-end FPS audits remain for the next stage.
- `tests/ModernFastPreview.test.js` covers the shared Modern geometry path,
  scene/Compare UI selection, zero RK4 calls, failure isolation and cache
  restoration. See `docs/fast-optical-preview.md`.

### Adaptive Fast Preview object LOD

- A separate `OpticalPreviewLod` utility selects full tower batches from the
  existing far-to-near painter order. It keeps the four nearest and farthest
  tower of each bank, thinning other towers only in Fast Preview; no authored
  scene or experiment field is changed. Non-towers remain fully intact.
- Modern Display offers Auto / full / manual stride 2, 4, 8, 16, 32; the
  session-only Auto feedback uses measured redraw time with separate Scene
  and joint Compare budgets and hysteresis. Compare A/B always share a stride.
- LOD is included in the Fast optical composition cache key and is entirely
  ignored by Accurate, including when a Preview LOD option is supplied.
- `tools/benchmark-preview-lod.js` measures cold optical composition only.
  Browser painter performance and pixel discrepancies are not yet certified.


### Automatic Fast Preview during camera navigation

- The Modern optical-quality selector now supports opt-in `Auto`: qualified
  camera motion temporarily uses throttled Fast Ray Field (at most one queued
  frame, nominal 120 ms between scheduling), while release/idle restores
  complete Accurate RK4 rendering with full tower detail.
- Keyboard W/A/S/D/Q/E, camera pointer drag and Alt/Shift-wheel support this
  policy, including shared Compare A/B camera and stride. Camera pointer
  cancellation restores its starting pose. Auto LOD starts at stride 8 and
  adapts to measured full frame cost. Unsupported profiles skip intermediate
  Fast renders and finish with Accurate; manual Fast still fails explicitly.
- Both the quality mode and Preview LOD remain transient UI preferences; no
  experiment/Legacy state is altered. Tests cover transitions and coalescing.

### Camera Animation (Modern)

- A single **Camera Animation** panel replaces the separate Camera Transition
  and Camera Sequence UI. The default workflow captures the live observer
  pose through **Add current view** and assigns automatic `Frame N` labels.
  A two-frame sequence is the former standalone transition. Named Saved views
  remain available under an optional collapsible library, with a separate
  **Add selected saved view** action for reusing them.
- Selecting a frame allows **Go to frame** and **Use current view** to replace
  its pose, reordering, removal and clearing. Incoming travel times (default
  5 seconds), holds, easing and optional names save on change; the first
  frame always has zero incoming travel.
- Persistence remains the previous optional `cameraSequence.keyframes` format.
  Legacy experiments, named sequences and JSON/URL links need no migration;
  frames own their pose snapshots. Only the redundant two-position UI and
  its redundant playback handlers were removed.
- The pure `ModernCameraInterpolator` and `ModernCameraSequence` still sample
  absolute time; browser playback uses the shared Fast Preview/LOD and idle
  Accurate restoration. Stop/Cancel/manual interruption and Compare A/B remain
  unchanged. Browser visual validation remains a separate step.

### Application preferences (after Camera Animation UI)

Modern keeps optical-quality policy, Fast Preview LOD policy, geometry backend
selection and navigation rates in a versioned browser-local preferences record.
Changes persist immediately; historical navigation-only preferences are migrated
when no consolidated record is present. Display provides a reset that clears
both preference generations, never experiment data. Preferences remain separate
from camera poses, keyframes, physical parameters and experiment URLs/JSON.
Malformed or inaccessible localStorage reverts to the reference defaults.


### Modern workspace persistence and Camera UI consistency

- Application Preferences now include a validated `workspace` value with
  remembered Scene / Compare / Demos mode, independent Scene and Compare
  Camera/Surface/Atmosphere/Objects/Display tabs, Compare editor A/B choice,
  and native `details` fold states keyed by stable `scene.*` / `compare.*` IDs.
  The original Display fold preferences are read for backward compatibility.
- Camera splits its controls into Position & orientation, Navigation and
  Camera Animation folds (plus optional Saved views and frame name); long
  explanations use the existing keyboard-accessible `?` help. Animation
  retains a frame count and total duration in its fold summary.
- Explicit experiment URLs retain their authored display mode/model; validated
  direct `mode`, `tab` and `model` query parameters override local layout for
  the opened page. The app marks its own history.replaceState-generated URL
  so a normal reload honors browser preferences without mistaking the URL
  for a newly opened shared link. Local experiments also take their workspace
  from browser prefs when these choices were explicitly saved. An old v1 preferences record
  lacking `workspace` keeps its previous experiment-selected mode/model.
- Reset workspace layout changes only tabs and fold state. Reset application
  preferences also clears workspace choices. Neither changes optical algorithms,
  Camera Animation keyframes, Legacy controls or the experiment JSON schema.

### Modern Experiment History Core

- Header **History** opens a separate, minimal text list backed by IndexedDB.
  Full snapshots are validated by `ModernExperimentState`; immutable stored
  A/B metadata are derived by `ModernExperimentFingerprint`. No changes were
  made to the v1 experiment serializer or optical calculations.
- Physical-input changes after a completed redraw schedule a debounced auto
  snapshot; camera-only motions, animation playback and workspace changes are
  excluded. Manual snapshots preserve all camera and Compare information.
  Consecutive duplicates are suppressed; recovery checkpoints additionally
  reuse matching snapshots anywhere in history, and no-op Restore avoids a
  checkpoint. Manual Save upgrades duplicate auto
  snapshots to protected entries.
- Restore validates the target and commits the current experiment as a
  protected recovery record before applying the requested saved state. A failed
  checkpoint blocks restore. Only unpinned automatic records are subject to
  200-entry retention and automatic clearing. Visual History now captures
  bounded, aspect-preserving real-Canvas Scene or labelled A/B thumbnails
  without artificial dark letterboxing, only after valid accurate rendering, with per-side stale-frame guards, optional atmospheric layers,
  read-only preview, newest/oldest ordering, pin/unpin, in-memory multi-selection,
  batch deletion and confirmed clear-all. Existing null-thumbnail records are
  supported. The gallery now defaults to a compact S layout, with optional M/L
  sizing persisted in Application Preferences. Double-clicking a card restores
  via the same serialized protected recovery path as the toolbar button; single
  click selects. Compact View/Pin/Delete actions are collapsed into a per-card
  details menu, while multi-select and accessibility remain available. UI layout
  changes neither stored history records nor physical or experiment schemas.
  Snapshot Inspector appears after a 350 ms hover or by keyboard focus on
  the thumbnail. The per-card **Info** action pins a viewport-clamped floating
  detail card for touch/keyboard use; **Esc** or Close dismisses it. The
  read-only view shows the active surface, atmosphere/refraction values,
  Compare A/B relationships and shared camera/objects. It uses only the
  already-loaded full experiment and metadata; no IndexedDB reads, optics
  recompute, experiment JSON/schema changes or restore gestures. The overlay
  is removed/recreated on list refresh and hidden on History close.
  Semantic A/B filters and Storyboard remain deferred. See
  `docs/modern-experiment-history.md` for usage and future design constraints.

### Animation Studio Camera HUD appearance (after Studio video composition)

- Animation Studio exposes a compact appearance editor in its Playback panel
  (background opacity 0–100%, four corners, size 75/100/125%). Scene/Compare
  retain their separate global appearance panel. An old Animation project
  inherits current browser preferences until appearance is explicitly set;
  modified and newly created projects persist appearance as an optional
  owned `cameraHudAppearance` field in the v1 Animation project schema.
- The editable Studio draft and v1 draft checkpoint retain this optional
  appearance without invalidating older saved projects or recovery data.
  The editor updates its last painted HUD without re-running optical rays.
- Optional PNG and MP4/WebM HUD overlays share a strict appearance validator,
  with placement inside each source view before Compare side-by-side assembly.
  Render and encoder Worker initialization carries the effective, fixed value;
  manifests record it only when overlay burn-in was requested. Disabled HUD
  never changes exported pixels or the underlying project physics.

### Animation Studio HUD integration hotfix

- The Modern HTML entrypoint must load `ModernAnimationCanvasHud.js` after
  telemetry/`ModernCameraHud.js` and **before** `ModernAnimationFrameExport.js`.
  Otherwise browser PNG/MP4/WebM planning can fail on missing
  `normalizeAppearance`, even though CommonJS unit tests pass.
- The upgraded Studio editor and render/encoder/archive Worker dependencies
  use refreshed script URLs to avoid mixing cached pre-HUD code with the
  current UI (`Invalid editor property` when editing `cameraHudAppearance`).
- Browser-script integration tests assert the real HTML dependency order,
  HUD draft editing, and video-plan creation; Legacy entrypoint is unchanged.

### Camera HUD export validation

- Verified that the optional appearance field on saved Animation projects is
  backward compatible and is consistently captured for PNG and MP4/WebM plans.
- The retained single-worker PNG `start` protocol now carries `cameraHud` and
  `cameraHudAppearance` into its second export plan, matching the parallel
  render protocol. Previously it silently omitted HUD burn-in.
- Regression tests compare disabled-HUD PNG bytes and Compare A/B video source
  Canvas operations across appearance settings, and execute the compatibility
  Worker `onmessage` path with a mocked optical painter.
- The Scene/Compare DOM HUD and Animation Studio preview share telemetry and
  placement model, but raster text rendering is not byte-for-byte equivalent
  to CSS. A browser-side visual comparison remains a manual acceptance check.

### Adaptive HUD text contrast

- Scene/Compare and Animation Studio preview use the same opacity-derived
  text/outline palette as PNG and MP4/WebM Canvas HUD burn-in. At 0% panel
  opacity the lettering is dark with a light halo; at 100% it is light with
  a dark halo; intermediate values interpolate text colors deterministically.
- The panel opacity still applies only to the panel background; the letters
  and their outlines remain opaque. The same palette is shared by the DOM
  HUD and Canvas export, including Compare A/B per-view overlays.
- Updated browser/Worker script URL cache keys for both changed HUD modules.
  Old Animation project appearance records require no migration.

### Animation Studio Compare video layout choice

- Export video now exposes `side-by-side` (one encoded video, default) and
  `separate` (two synchronized A/B MP4 or WebM streams in a ZIP) when the
  current Studio draft is a Compare project. Scene projects have no layout
  selector and still export a single stream. The pre-existing two-stream
  Worker/encoder protocol is reused; there are no optical solver changes.
- A shared lightweight output layout calculation powers both video plans and
  the live UI description, including output resolution, output stream count
  and RGBA payload per timestamp. The UI displays the actual credit-window
  bound, explicitly excluding renderer Canvas and codec memory. The layout
  is snapshotted at export start, carried to all Workers, and recorded in
  manifests. The separate-output ZIP retains its two video entries and JSON.

### Modern target-direction geometry (compass groundwork)

- Added `ModernTargetDirection.js`: read-only, physical-only object and group
  anchor selection, observer-local Globe/Flat camera translation, true
  Pan/Nick/Roll/FOV-based geometric direction and offscreen classification.
- Anchors are taken from physical scene object sequences, not nominal flat
  offsets or apparent refracted rays; target selection is independent of
  optical visibility or object occlusion. The UI compass is a follow-up.
- Included only in the Modern HTML entrypoint; documented the contract in
  `docs/modern-target-direction.md` and added focused regression tests.

### Modern geometric target direction overlay

A standalone, optics-independent UI/Canvas overlay was connected to the
ModernTargetDirection geometry module. Scene and Compare show a bottom-centred
arrow only for an off-frustum target center; Animation Studio playback and
opt-in PNG/MP4/WebM burn-in use the same geometric decision. Controls and
visibility are independent of Camera HUD, and the active target may be the
scene center or either object group center. UI preferences are local to the
browser; exports capture the chosen selection and inclusion flags at launch.
Compare frames are marked separately before they are composed or encoded.
Worker import order and cache keys were extended without changing Legacy,
physics or the saved animation project schema.

### Display viewport-overlay controls

The Scene/Compare Camera HUD toggle, appearance fields and target-direction
visibility/selection were reorganized into an always-visible **Viewport overlays**
section in the Modern **Display** tab. All DOM control IDs and existing event
handlers/preferences were retained; a scoped in-panel CSS override replaces
the former scene-header popup positioning without affecting the separate
Animation Studio HUD popup. The Scene/Compare overlay remains DOM-only;
independent animation PNG/MP4/WebM settings, project schemas and RK4 optics
remain unchanged. Test coverage verifies control uniqueness, placement,
preferences, and removal of the now-duplicated target CSS block.


### Animation Studio workflow UX (#140.12.120.9.9)

- `New project` starts an autosaved working draft, **not** a named library record.
- `Preview animation` replaces ambiguous `Prepare project` and prepares playback
  only; the control is placed at the top of the keyframe editor near Playback.
- Named library saves are explicitly `Save project` (new), `Save changes`
  (opened record), or `Save As` (independent ID). After a successful save the
  library expands, selects the saved card and resets horizontal scrolling;
  rejected writes preserve previous library state.
- Each saved card has an explicit `Open` action, retaining selection for JSON
  backup and double-click/Enter shortcuts. Library toolbar separates project
  lifecycle controls from JSON backup; MP4/WebM/PNG export stays in Playback.
- No Legacy, physics, project-storage schema, or video encoder changes.

### Animation Studio independent working drafts (#140.12.120.9.10)

- Replaced the single active draft persistence model with a V2 workspace
  collection storing one validated V1 checkpoint per named project or untitled
  draft. Saved Library records remain authoritative and unchanged until Save.
- The outgoing editor is flushed before switching. New/Open/Resume restore
  independent drafts and paused playback. Storage failures stop switches rather
  than invoking Save/Discard decisions or destroying a draft.
- Legacy V1 browser backups migrate; the whole V2 collection is synchronously
  backed up in localStorage and asynchronously mirrored through a serialized
  IndexedDB queue. Late restores respect the edit-generation guard.
- Independent unfinished drafts are listed under Working drafts with Open/Delete;
  blank unused scratchpads can be discarded when leaving. Deleted named records
  detach their active/nonactive workspace into a recoverable unsaved draft.
- Save As and Save project permit intentionally identical content; the Library's
  duplicate review and deduplicating JSON imports remain opt-in/unchanged.
- No Legacy or optical physics changes.

### Animation Studio transition diagnostics (#140.12.120.9.11)

- Cross-snapshot compatibility still enforces a single animation channel;
  its pure inspector now also returns the **adjacent** transition changes with
  before/after effective values, rather than only differences against frame 1.
- Incompatible Studio drafts display named `N → N+1` transitions, handling
  explanations and actual values. The first blocked pair starts expanded;
  `Show on timeline` highlights both frames and selects the second.
- Scene/Compare changes remain blocked; Globe/Flat curvature is still a legal
  single physical channel, not a discrete mode switch. No runtime interpolator,
  export format, physical solver or Legacy code was modified.
- Regression tests cover pairwise deltas, mixed camera/physics across separate
  transitions, Scene/Compare, legal curvature, table values and timeline focus.

### Animation Studio compatible sequence grouping (#140.12.120.9.12)

- `ModernAnimationSequences` finds maximal globally compatible ordered groups
  using exact canonical fixed-state signatures for camera or each physical
  channel, then verifies candidates using the unmodified compatibility inspector.
  It can include nonadjacent frames; there is no combinatorial search.
- Animation mode selects which categories to display; `Use sequence` records
  selected frame keys and physical target in the working draft independently of
  the full source frame list. Preview, library save, PNG and MP4/WebM generation
  use `ModernAnimationStudio.build()` and therefore the selected subset.
- The v1 project playback schema is unchanged. Nonselected frames persist only
  in the independent v2 working-draft local/IndexedDB workspace, not in named
  exported project JSON. The UI explicitly distinguishes these guarantees.
- Selection survives autosave/reload and nonstructural edits, and resets on
  replacing/inserting/removing frames or changing animation mode/target.
- No modifications to RK4, physical sampling, optical rendering, Legacy or
  the supported compatibility rules.


> **Animation Studio visual states (#140.12.120.9.12.1):** A selected compatible
> sequence now renders fully opaque thumbnails and explicit IN PREVIEW / EXCLUDED
> labels with distinct solid blue / dashed gray borders. The frame open for
> editing receives its own purple EDITING marker, independent of inclusion.
> A timeline legend reports counts and the editing target. The underlying
> subsequence model, physics, playback/export and Legacy remain unchanged.


### Unified Modern thumbnail previews (#140.12.120.9.12.2)

- A shared `src/ui/modern/ModernThumbnailPreview.js` controller now owns History's
  large saved-image preview behavior (dwell, focus, pinned touch/pen, Escape,
  dynamic viewport positioning, scroll dismissal and rerender cleanup).
- Five mounted Modern galleries with real screenshot cards are covered:
  History, Studio Snapshot Picker, Studio keyframes and
  Animation Library. The existing History-to-Animation storyboard rendering
  helper also supports the shared inspector, though the current History
  handoff toolbar only displays counts/buttons. The same physical-settings inspector
  is rendered, with no new optical calls and no mutation to source snapshots.
- Independent galleries register their card surfaces with this controller;
  at most one preview is visible across galleries. Action controls and drag
  handles are excluded from hover triggers; the underlying click/drag workflows
  are unchanged. Imported frames without saved images receive honest placeholders.
- The existing fullscreen-independent Studio selected-keyframe preview stays
  unchanged. Working drafts have no persisted thumbnail cards, so no fake image
  is invented. Original thumbnail storage/project/History formats and Legacy
  entrypoint remain unchanged. A Modern-only script and CSS cache refresh are
  included with updated isolation audit fixture and targeted regression tests.


### Animation Studio Preview navigation (#140.12.120.9.12.3)

- The top and bottom `Preview animation` buttons in the draft editor invoke the same
  build/paint action and share the same enabled state and prepared/saved-link text.
- A **user-initiated** Preview requests a one-shot scroll to the existing Playback stage
  after the first physical frame paints successfully, never at click-time or on autosave.
- Pending navigation is cancelled by a user wheel/touch/pointer or scroll-key gesture;
  further frames and non-Preview restores never automatically move the viewport.
  `prefers-reduced-motion` requests instant rather than smooth navigation.
- Preparation/paint errors route to the editor's status/diagnostics instead of
  scrolling to stale Playback. Legacy, RK4, export, and project persistence are unchanged.

### History-to-Animation UX consolidation (#140.12.120.9.12.4)

- Removed the redundant Staged snapshots gallery and the destructive Load staged
  snapshots button from the Animation Studio editor. Choose from History / Add
  checked remains the primary non-destructive insertion path.
- Preserved History's ordered browser-local collection for compatibility; the
  History handoff action now appends de-duplicated snapshots to the current draft
  rather than replacing its frames or timing. The collection is not a second
  Animation Studio timeline.
- Renamed the camera import to Replace with Camera Animation… and added a native
  confirmation for nonempty timelines. Invalid imports and cancelled replacements
  leave the existing draft unchanged. No project schema, optical physics, Legacy
  behavior or playback/export implementation changed.

## #140.12.120.9.13 — semantic snapshot/animation/export naming

- `src/ui/modern/ModernSemanticNaming.js` provides a pure deterministic
  naming layer. `snapshot()` examines the saved Modern experiment including
  mode, geometry, camera height, and *active* A/B atmosphere fields; `animation()`
  uses the actual selected camera/physical channel and keyframe values.
  It has short, descriptive (default) and technical formatting APIs, plus
  portable ASCII filename sanitizing and coordinated video/ZIP entry names.
- Newly recorded History snapshots receive generated names; deduplicated
  existing entries, old records/imports and manually renamed snapshots are
  not overwritten. Snapshot JSON downloads carry meaningful filenames.
- Fresh, unnamed Studio drafts adopt automatic titles when their active
  keyframes are compatible; chosen compatible subsequences take precedence.
  Custom titles and existing library projects remain authoritative. A neutral
  default is retained for unpreparable mixed collections.
- Video Worker names one-file MP4/WebM and two-file A/B ZIP output using the
  shared title + output resolution/FPS, including matching internal filenames.
  PNG frame archive downloads use the same naming rules without changing the
  image/manifest schema or the frame encoder.
- Scope: Modern UI + export metadata only. Legacy, Camera HUD, WGSL, RK4,
  project format and History/animation persistence remain unchanged.

## #140.12.120.9.14 — visible video export filename and Worker handshake

- Animation Studio displays the exact proposed WebM/MP4 filename (or Compare
  ZIP filename and A/B entry names) before rendering, including for a new
  unsaved working draft. Format, FPS, view size, Compare layout and draft
  edits refresh the preview. The UI and export click share one validated
  animation plan and semantic naming calculation; no second naming scheme.
- The encoder Worker calculates its filename once on initialization and
  includes it in its `ready` message. The main-thread video coordinator checks
  this against the preview **before** optical frame rendering begins and
  verifies the completed filename again. A stale or mismatched Worker now
  fails visibly rather than downloading a video under an unexpected name.
- Script query cache keys are refreshed for the Modern UI, encoder Worker and
  imported naming module, without new version-numbered files. Tests cover
  preview updates, browser anchor downloads, mismatch rejection and Worker
  naming handshake; the Legacy/Modern isolation evidence is regenerated.
- No changes to ray tracing, animation format, History persistence, Legacy or
  WebCodecs encoding quality.

### Animation Studio Spline Preview mode

- Camera Animation Preview now exposes **Camera interpolation: Linear / Smooth · Spline**.
  The switch changes the working project's `interpolation` field while retaining
  the same keyframes, playhead time and playback running/paused state. The current
  optical frame is resampled immediately in the independent Preview, and no new
  Animation Library project is created implicitly.
- This control is hidden for physical parameter animations. Existing projects
  without an interpolation field still use Linear. Working drafts autosave;
  updating a named Animation Library record still requires Save changes.
- The core sampler remains shared with frame/video exports. No Legacy, RK4,
  codec, saved-experiment or Scene/Compare camera navigation logic was changed.
- Regression tests cover the real Preview change handler with paused and running
  timelines, a physical-animation guard and invalid mode rejection. Full browser
  animation performance remains to be validated interactively.


### Animation Studio Spline background export compatibility

- Accurate RK4 background video and PNG export renderer URLs use a refreshed
  `spline-export` cache key, as do the renderer's imported camera interpolator
  and animation project module. The UI script key is refreshed too.
- For a spline camera project, the renderer's `ready` message includes a
  deterministic in-between camera sample. The coordinator compares that sample
  with the preview's `ModernAnimationProject.splineProof()` before dispatching
  any optical frame. Missing or mismatched samples abort export and terminate
  workers with a stale-renderer explanation. Linear and physical exports retain
  their prior protocol and behavior.
- Regression tests cover successful Spline video/PNG exports and immediate
  failure when a stale renderer omits its spline proof. This avoids producing
  a plausible but incorrectly interpolated export.


### Animation Studio Spline project persistence

- Named Animation Library records already use the same validated v1 project
  schema as Preview and Worker export. Save / Save Changes retains the selected
  `interpolation` and complete keyframe timing; `fromProject` reconstructs the
  editable draft and its Spline camera samples without local History entries.
- Working draft checkpoints and multi-workspace collections preserve Spline mode,
  selected keyframe, playhead, and saved-record revision through localStorage and
  IndexedDB recovery. A resumed Preview remains paused at its restored time.
- JSON backup/export and import retain the exact mode and resulting camera path.
  The semantic fingerprint now **includes interpolation** so a Linear and a
  Spline version of the same camera keyframes are not falsely deduplicated.
  Older v1 projects without interpolation are semantically explicit Linear.
- A legacy saved Linear project no longer shows false unsaved edits after opening
  merely because its reconstructed Studio draft has a default Linear field.
  Switching to Spline still correctly marks the project dirty until Save Changes.
- Automated tests cover named save/update/open, cross-library JSON round-trips,
  independent draft workspace restoration, legacy v1 compatibility and duplicate
  import semantics. The Modern library and app cache keys were refreshed.
  No optical solver, encoder, Legacy code or camera spline math changed.

### Animation Studio Spline export parity (stage 4)

- Scene and Compare A/B test cases with four camera keyframes, unequal inbound
  travel, holds, angle wrapping and changing focal length exercise Preview,
  PNG export and video frame sampling at matching timeline positions. Compare
  side-by-side and separate A/B use the same synchronized camera sample; video
  samples its terminal display interval at the exact endpoint while PNG emits
  an additional endpoint image.
- The Spline renderer compatibility handshake now checks the first/middle/last
  representative transitions (at most eight transition midpoints), not merely
  the first segment. Missing/mismatched proofs are rejected before dispatch.
- PNG and VP9/WebM/H.264/MP4 completion manifests record `cameraInterpolation`;
  coordinators reject a manifest inconsistent with the validated project.
  Worker/import cache keys refreshed. Existing Legacy and physical optics remain
  unchanged, and old v1 camera projects resolve to `linear` in manifests.
- The parity guarantee is **sampled project/camera state**, not pixel identity
  against Fast Preview. Native Opera rendering is still a separate check.

### Modern Animation Library: return to saved version with optional stash

A dirty named project now exposes **Stash & restore** and **Discard changes**.
Stash copies the entire existing checkpoint into a fresh unlinked draft ID,
restores the project's saved Library checkpoint in one staged workspace
collection, and persists that collection before switching the editor. Discard
uses the same restore transaction without creating a stash and requires explicit
confirmation. Other workspaces stay untouched. Switching to a stashed draft
does not delete it. Revision/generation conflicts and persistence failures
abort before replacing the editor; stale concurrent editor changes are backed
up rather than dropped. No Library-record or physics-schema migration is needed.


### Unified Modern card delete controls

History snapshot cards, Animation Library cards, Working drafts, Storyboard
shortlist items and keyframe cards share the same neutral History-style delete
corner via `.modern-card-delete`. The CSS pseudo-element renders `✕`; hover,
focus, disabled and touch states are centralized. Existing confirmation,
selection, drag-and-drop and storage semantics are unchanged. Tests cover
shared styling and card-specific click isolation.

### Spline final audit follow-up: short videos and inactive Easing

- Fixed a one-nominal-frame video corner case (e.g. a 200 ms transition at
  5 FPS): the encoder now receives two contiguous display intervals within the
  original duration. One sample preserves the initial camera state, the other
  samples the exact endpoint. Other video timelines keep their original FPS
  boundary/timestamp logic. PNG's inclusive endpoint plan is unchanged.
- In the Animation Studio keyframe editor, incoming Easing is read-only while
  Spline interpolation is active, with an explanation. Per-frame easing values
  are retained without mutation so Linear restores the previous choice.
  Switching the Preview interpolation immediately refreshes the editor while
  preserving the playhead and playback state.
- Refreshed browser and renderer/encoder Worker cache keys for changed scripts.
  Added Scene/Compare Spline short-video parity, VP9/H.264 short encoding,
  Easing/Preview UI and timeline regression tests. No physics, camera spline
  geometry, saved-project schema, Legacy or codec algorithm changes.
- Browser Opera playback and visual frame fidelity remain manual verification;
  Node-based Worker tests validate contracts and muxing, not the installed
  browser's hardware/software encoders.

### Adaptive Fast Preview: isolated mathematical kernel (stage 1)

- Added opt-in `CurvatureOpticalFastRayField.createAdaptive(options)` without
  changing `create(options)` or any Scene/Compare/Auto user-visible behavior.
- The experimental shallow-ray approximation uses conformal altitude on Globe,
  a log-height lookup of atmospheric `n(h), dn(h)` (256 samples to 50 km),
  eight piecewise-constant curvature intervals, and two path-refinement passes.
  The table belongs to each field instance and is reused across sample calls.
- Built-in atmospheric profiles, including temperature-lapse, transitions and
  inverse-temperature, can be sampled in isolation; custom profiles, steep
  rays, distant Globe arcs and ill-conditioned cases remain unsupported.
  Ground contact is an approximate/uncertain classification, never an exact
  visibility oracle or a replacement for RK4.
- `tests/OpticalAdaptiveFastRayField.test.js` compares ordinary cases against
  independently computed RK4 and checks invalid profiles, endpoint contacts,
  counters and isolation. `tools/benchmark-adaptive-fast-preview.js` measures
  isolated Node.js target-query cost, **not** browser FPS or full-scene draw.
- The next integration stage must explicitly decide when to route Fast Field
  construction through this new opt-in API; no UI switch or production fallback
  is enabled by the mathematical-kernel patch.

### Adaptive Fast Preview: physical scene profile routing (stage 2)

- Manual Fast in `CurvaturePhysicalSceneOptics.js` now selects the independent
  `createAdaptive()` field for built-in models that lack the existing qualified
  analytic/local-gradient Fast path. This supports temperature-lapse, intermediate
  profile-transition and inverse-temperature, inverse-spherical, and Globe
  engineered profiles on either surface. Standard, Vacuum, and Flat analytic
  engineered endpoints keep their previous routes unchanged.
- Atmospheric options are passed with the same structure as Accurate: direct
  temperature-lapse settings, nested transition/inverse configurations and the
  independent `occlusionRadius`. Model parameters are neither replaced with
  Standard nor persisted differently. No hidden RK4 is called during manual
  Fast. Accurate uses the original shooting/ray-field code unchanged.
- The adaptive shallow-ray kernel intentionally rejects steep near-camera
  trajectories and extreme/over-range cases, which can leave incomplete fills
  in complex scenes. Existing partial-frame caching safeguards remain in force.
  Manual Fast is usable for the newly supported models; **Auto and Animation
  fast-eligibility allowlists remain unchanged** for the next stage.
- Real composed Flat/Globe tower tests cover new atmospheric routes, filling
  and contours, preservation of analytic endpoints, profile-parameter effects,
  the absence of RK4 work, and Fast-vs-Accurate isolation. Browser interaction,
  final frame-rate and visual differences have not yet been validated.

### Adaptive Fast Preview: physical camera-motion routing (stage 3)

- The cause of missing live imagery in manual Fast was the pre-existing
  `pointermove` branch: it used `ModernCameraDragPreview` to move a cached
  Canvas instead of updating the model and scheduling physical redraw. Manual
  Fast and supported Auto now share live camera updates on Scene and Compare
  (either viewport); Accurate keeps its inexpensive raster-only pointer drag.
- `autoPreviewSupported()` now qualifies all seven built-in Fast atmospheric
  families on Flat/Globe. Auto Camera Navigation and Camera Animation can
  therefore use the stage-2 adaptive field instead of skipping motion frames.
  Manual Fast remains Fast on gesture release; Auto commits Accurate RK4.
- One requestAnimationFrame is queued at a time. A nominal 100 ms throttle
  and trailing timer preserve the latest held-pointer pose without relying on
  additional mouse events; pointer cancellation restores the starting pose,
  clears timers and restores the correct idle quality. LOD and cache isolation
  are inherited, not replaced. No changes to RK4 or experiment schemas.
- Browser end-to-end FPS and high-gradient visual quality need manual
  verification. In particular, steep near-camera rays can still return
  `unsupported` and cause partial fills; fixing that is outside this routing
  patch. Tests exercise intermediate paint before pointerup, Compare B routing,
  latest-pose scheduling, cancellation and adaptive-profile Auto frames.

### Adaptive Fast Preview: measured frame pacing and gradient reuse (stage 4)

- Existing Scene/Compare Fast/Auto live optics now pace motion frames using
  the measured complete redraw duration rather than a fixed 100 ms limit.
  Cadence starts at 100 ms and is bounded to 65–180 ms with smoothing; an
  expensive frame backs off promptly and faster frames recover gradually.
  The existing Preview-only LOD controller still manages object thinning;
  both Compare sides share the same stride. Accurate/RK4 remains unchanged.
- The camera motion scheduler tracks requested versus drawn poses. A held,
  stationary pointer no longer causes a repeated physical-redraw timer loop.
  Any newer pose requested during a throttle interval still receives its
  trailing Fast frame before release. Pending timers are cleared on stop.
- The adaptive field now reuses **read-only** 256-point gradient tables from
  a bounded 12-entry LRU keyed by atmosphere, parameters, geometry and radius.
  Camera height does not invalidate those gradients, but each field retains
  independent ray paths/counters. Tracer validation remains in effect on
  cache hits; cache status is reported in field diagnostics. Partial/unresolved
  optical compositions are still not cached by the physical scene adapter.
- Added cache isolation/eviction, cadence and stationary-drag tests. Browser
  visual quality, frame time and GPU/render-driver behavior remain unverified.


### Adaptive Fast Preview: sampled edge-case audit and closure (stage 5)

- Added `tools/compare-adaptive-fast-preview.js` as a reproducible Node-only
  comparison of adaptive shallow-ray status/angle against independently shot
  RK4. Six selected model/geometry settings, eye heights 2/15/100 m, target
  ranges 1–80 km and heights 0–1000 m give 540 samples. At this closure:
  337 visible, 179 blocked, 6 indeterminate, 18 unsupported, **no disagreement
  on 516 definite results**, and a maximum visible angle difference of about
  0.34 *hypothetical* px (1920 px/5°). This does **not** assert pixel parity,
  global ground-occlusion correctness or multipath completeness.
- Regression tests check an RK4 subset, multiple near-grazing contacts at
  the 0.1 m scene margin, and explicit unsupported steep/high-altitude rays.
  Unresolved is kept separate, never treated as clear/blocked or sent to RK4
  during Fast. Recorded other limitations include absent steep near-camera
  fills, uncertain horizon contacts and lack of Opera FPS/pixel measurements.
- `docs/fast-optical-preview.md` now holds the reproducible audit steps,
  supported numerical envelope, measured diagnostic results, limitations,
  and the stage-5 closure contract. No physics, RK4, animation export or
  browser UI changes were necessary for this audit-only compatpatch.

### Animation project contracts: pure preflight foundation

- `ModernAnimationContract.js` provides immutable reference-based Camera,
  single-channel Physical and Experimental contracts, deterministic active
  scene/physics/camera/display signatures, prospective candidate diagnostics,
  and whole-sequence preflight through the existing authoritative renderer
  compatibility inspector. Experimental accepts valid snapshots as draft
  material but promises no interpolation or export.
- An empty object group (`NObjects[i] = 0`) now ignores its dormant settings
  in `ModernAnimationCompatibility.effective()`, eliminating a false fixed-scene
  change without changing experiment data or render geometry. Active groups
  remain strictly compared. Scene/Compare, camera/physical and A/B physical
  channels retain their existing playback limits.
- This is not Project v2: existing saved projects, History, autosave, IndexedDB,
  browser controls and physics engines remain unchanged. Wizard/Picker wiring,
  durable contract storage and migration are subsequent stages. See
  `docs/modern-animation-contract.md`.


### Animation Library project search and reference-physics filters

- Added pure, read-only `ModernAnimationLibraryFilters.js` to search/sort named
  v1/v2/Experimental projects by name, description, mode, physical transition
  channel, keyframe count and duration, and by the **base experiment's**
  active Scene/Compare geometry/refraction (reusing History physics semantics).
- Animation Library renders only matched gallery cards while keeping all named
  entries available for Export all, Export selected, duplicate review, active
  editing, and workspace drafts. Local filter preferences are separate from
  History/Picker preferences and from persisted animation projects.
- This stage does not modify Project v1/v2, History, IndexedDB, physics,
  playback or media export. See README and the wizard guide.


### Animation Studio: Fast routing to every built-in atmospheric family

- Animation's old `fastEligible()` whitelist disagreed with the production
  Scene/Compare optical adapter. It now accepts the seven built-in named
  atmospheres on both Flat and Globe, including temperature-lapse, mixed
  transition/inverse profiles and inverse-spherical, without substituting
  Standard or altering physical parameters. The existing scene adapter chooses
  analytic/local-gradient or adaptive Fast for the actual sampled state.
- Auto camera playback may use Fast for these profiles; Auto physical playback
  remains Accurate unless Fast is explicitly selected. Standard/Globe
  curvature preflight and the per-state Fast → Accurate fallback remain.
- Background animation video/PNG export still uses Accurate rendering. Fast
  is approximate and can leave unresolved rays; full-frame browser pixel
  accuracy and FPS have not been certified. RK4/physics, projects, and
  IndexedDB were unchanged.


### Modern geographic migration #40 — Narrow-FOV metric grid and CI smoke repair

- Chromium Chicago `test_chicago_preset_compare_and_history_return` now expects
  the **Standard** atmosphere set intentionally by #38; previously it still
  asserted `vacuum`, while the tested geometry and History return passed.
- A presentation-only overlay renders seven camera-aligned ground spokes
  using **existing optically transformed** zero-azimuth metric segments.
  Its azimuth spacing adapts to the actual FOV, unlike the static 15-degree
  world spokes; Scene and Compare use identical rules. Kilometre labels are
  anchored to *visible* metric-ring points (not fixed pixels, geometric-horizon
  formulas or invented target distances). Dense label collisions are omitted.
- The physical world, RK4 shooting, shared optical cache, curvature, authored
  object placement and original 100 km guide extent remain unchanged.
  This makes reference marks legible near Canigou in narrow FOV, but does
  **not** extend the optical ground grid to the mountain at 257 km.
- Deferred screen decorations draw after atmospheric presentation on the
  correct Scene/Compare canvas; these annotations are not part of an optical
  export texture. Tests: `tests/PhysicalGroundGridOverlay.test.js`,
  `tests/ModernAtmosphericPresentation13822.test.js` and browser smoke.
- Browser CI must be confirmed on GitHub Actions (local browser access may
  be restricted). #41 remains Grace shared geometry and scene migration.


### Modern geographic migration #41 — Scene-adaptive physical ground grid

- Physical metric grid extent is now determined from the farthest authored
  object and observer-relative camera translation (10–500 km bounded, with
  10% clearance and discrete geometric landmarks). Canigou extends to 300 km,
  distant Chicago to 75 km. Legacy/standalone physical adapters without the
  Modern setting retain their former 100 km rendering default.
- The same extent flows through physical metric geometry, ground optical
  projection and rendering; there is no separate optical visibility limit at
  100 km. Flat ground grids now extend toward distant mountains where their
  own ground rays are visible; Globe rings beyond the **verified** refracted
  horizon are still hidden. Distant metric samples are sparsely subdivided to
  limit expensive ground-only RK4 requests. The grid never blocks or moves
  the mountains or defines a horizon.
- Modern Scene and Compare share a Display control (`Auto`, 10/25/50/100/
  200/300/500 km); this is a persisted experiment field and round-trips via
  History, JSON/URL and working-session storage. Older v1 payloads without the
  field migrate to Auto. Changing or resetting a preset restores Auto.
- `tests/PhysicalAdaptiveGridExtent.test.js` checks Canigou / Chicago,
  physical extended guides, Globe horizon, Flat 300 km, Compare invariants
  and backward-compatible serialization; existing geometry/ring tests keep
  the 100 km default. A full browser/pixel/FPS check remains for Opera and
  GitHub Actions. The next scenario geometry is Grace (#42).

### Modern #49 — Parameter-independent preset captions

- The twelve built-in Modern presets now supply authored descriptions of their scene and research purpose, without frozen camera heights, atmospheric profiles, distances, object counts, or claims of Legacy-renderer parity. The original starting parameters and Legacy source-state mappings remain in their explicit preset definitions and migration audit; neither rays nor geometry were changed.
- Removed the Pontchartrain-specific `refreshDescription` mutation: changing object-bank count/type, camera or physics no longer rewrites an authored caption. Scene and Compare keep the same model description; user-imported and previously saved descriptions are left untouched until explicit preset reset.
- The existing `Off / Title only / Title + description` Canvas options and experiment storage are unchanged. The HUD/editor remain the place for live physical values; caption tests cover every preset and Scene/Compare edits.

### Modern #50 — Live geometry summaries for working canvas captions

In Scene and Compare, `Title + description` also displays a *derived* geometry
summary: configured object counts for both banks (including two-column
placement), meaningful bank extents and, where authored, connecting bridge-road
spans. Type-4 repeats count skyline *sections*, not individual buildings;
no ray/triangle or visible-object counts are implied. The summary always
reads current `NObjects`, `ObjType`, `ObjSideType` and `ObjDeltaDist`, so edits
and History/JSON/URL restoration have no second caption state to synchronize.
The authored `DemoText` and `Description` are unchanged; `Off` and `Title only`
omit this summary, and non-Modern exports/diagnostics retain their own
caption behavior. Physics, perspective, optical profiles and Legacy unchanged.

### Modern #48 — Configurable wrapped canvas captions

The Modern working viewport now keeps the #47 clean-image default (`Off`) while restoring an explicit **Canvas captions** control in Display → Viewport overlays. Supported modes are `off`, `title`, and `title-description`. Long titles/descriptions are wrapped to the available viewport width and ellipsized vertically when needed, so narrow Compare panels no longer let caption text overflow outside the image. The setting is carried in Modern experiment URLs/JSON/History as `display.captionMode`; pre-#48 links migrate to `off`.

### Modern #47 — Working-view captions were de-duplicated

- Scene and Compare now suppress duplicate title/description text on the physical
  canvas while retaining the scene header, title/description experiment fields,
  History, and serialization. The presentation renderer accepts an opt-out
  `showCaptions:false`; its default remains unchanged for exports, Animation
  Studio and independent composition diagnostics. Both direct Canvas and
  deferred atmospheric presentation paths use the opt-out.
- Regression: `tests/CurvatureFullSceneDecorations.test.js` and
  `tests/ModernAtmosphericPresentation13822.test.js`. Next: one bounded
  storyboard prototype (#48) based on the #46 source audit.
