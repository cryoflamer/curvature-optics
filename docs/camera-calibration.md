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
reviewed Modern helper inventory, updated here. Next: 8F.2b modeless window.

## 8F.2 follow-up — Viewer usability refinement (planned)

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

See [8F.0 audit](landmark-editor-audit.md), Issue #7. The current
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
See [the 8F implementation plan](landmark-editor.md) for stages 8F.0–8F.7,
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

# Camera calibration from reference observations — deferred research plan

Status: headless calibration and research implemented through 8A.4.3;
8A.4.4 qualification and 8B–8E authoring UI remain, followed by 9A–9B.

## Confirmed primary scope

The primary deliverable of 8A–8E is a reusable photo-to-camera authoring tool: given a reference photograph, known scene geometry and manually identified correspondences, recover a usable camera pose and focal length under a selected, fixed surface geometry and atmospheric profile, inspect visual alignment, and save the accepted camera as a normal experiment or Studio keyframe. Geometry and atmosphere are inputs, not estimation targets. Cross-hypothesis, noise and conditioning experiments qualify the camera solver and expose pose sensitivity; they are not a program to infer Earth's shape or reconstruct the atmosphere. After accepting a camera, normal demo controls can vary geometry and atmosphere without recalibrating it. Finish bounded checks of incorrect correspondences, renderer parity near the horizon and convergence diagnostics, then proceed to 8B; defer broader numerical research until practical photo authoring reveals a need.

## Original sequencing rationale

This avoids interrupting the existing Studio work and avoids manually fitting
all existing Soundly frames before a reusable tool exists. Read
[reference images](reference-images.md) and the [demo roadmap](modern-demo-catalog.md)
when resuming in a new session.

## Initial headless point projector (8A.1)

`src/calibration/CameraLandmarkProjection.js` exposes
`create(model, camera, width, height, {method, atmosphere, temperatureProfile, step})`.
`camera` is the physical projection snapshot returned by `renderPhysical` with
`captureProjection: true` (observer-local origin, Eye-Lvl, captured raster
transform). A standalone snapshot without `pixelTransform` uses the existing
centered full-canvas convention. Do not substitute thumbnail or CSS dimensions.
`metric({id,east,north,height})` uses authored surface-arc metres from the scene
origin and altitude above the model surface; `vertex({id,bank,objectType,primitive,vertex})`
resolves zero-based mesh indices on a fixed authored scene. IDs are supplied by
the caller; changing topology or scene geometry invalidates mesh references.
Truncated object sequences are rejected rather than reassigning indices.

Accurate reuses physical placement and observer recentering, the analytic
vacuum sampler or exact forward-branch RK4 shooting (default step 200 m), and
the physical arrival direction. Canvas Direct reuses its effective Globe
placement or signed Flat embedding, not the Accurate point's straight chord.
Results expose `{id,method,status,pixel,reason,meshOcclusion}`. `visible` means
in-frame and terrain-eligible, NOT verified mesh visibility; `out_of_frame`
retains finite pixel coordinates. `blocked`, `indeterminate`, `solver_failed`,
`behind_camera`, `near_plane` carry no pixel. Do not drop invalid observations
from a fit. No implicit fallback. Initial support is Vacuum, Standard and
Temperature lapse only; engineered profiles and vertical/multipath exact
shooting outside the forward branch are not qualified. The direct terrain
check is approximate, not a certificate of its painter's horizon mask.

Tests compare 40 selected visible endpoints with actual renderer Canvas path
coordinates (mock recording context), including translated and rolled cameras,
Globe/Flat, both methods, all three atmospheres for towers, portrait Causeway
object types 8/9 under Standard. Max sampled endpoint error 0.000191 px;
analytic Flat pixels, out-of-frame, behind, hidden, grazing and invalid inputs
also tested. This is a baseline, not a general subpixel guarantee: far/telephoto
and near-horizon renderer parity, real raster/viewport capture, independent
calibration intrinsics, portable landmark identity and mesh visibility need
further qualification before claiming real-photo recovery. No optimizer yet.

## Perspective seeds (8A.2, first implementation)

`src/calibration/CameraPerspectiveSeed.js` is a dependency-free headless
perspective initializer. Call `initialize(observations, {width, height,
minFocalPx, maxFocalPx})` with correspondences `{world:[X,Y,Z], pixel:[u,v]}`.
World coordinates must already be Cartesian metres in one right-handed frame;
surface-arc coordinates are not interchangeable with Globe Cartesian points.
Image coordinates use original raster pixels, x right and y down, centered
principal point, square pixels, rectilinear undistorted lens. The focal bounds
default to 1 and 1e7 pixels, not millimetres.

The spatial branch uses centered/scaled world coordinates and centered/scaled
image coordinates with DLT (at least six noncoplanar correspondences).
The planar branch uses a plane basis and homography (at least four
noncollinear correspondences); orthogonality and equal column norms constrain
the unknown focal length. One-sided Jacobi SVD works on design columns without
forming normal equations. Both projective signs are checked, all retained
candidates have positive depth for every observation and satisfy focal bounds.
Outputs contain position, world-to-camera rotation rows, focalPx and Euclidean
2D residual RMS in original pixels, plus singular-value diagnostics.
Coincident/collinear world points, insufficient rank and exactly frontal planar
geometry are explicitly rejected. Near-degenerate noisy scenes can still yield
poor seeds: a returned candidate is not a certificate of identifiability or
accuracy. The result always declares complete:false.

Nine independent synthetic Node tests passed: spatial/oblique planar recovery
from both sides, minimal planar case, telephoto with large coordinate offset,
frontal/collinear degeneracy, invalid and focal-bounded inputs, and deterministic
subpixel observation noise. The noiseless ordinary cases recover below 1e-6 px
RMS; telephoto below 1e-5 px. One noisy spatial fixture (0.5 px sinusoidal
perturbations per coordinate) has 3.058 px seed RMS before refinement.
These tests are independent pinhole projections, not physical renderer parity.

This is a first baseline only. No P4Pf, focal sweep, alternate global search,
physical pose conversion, terrain/mesh visibility, refraction or nonlinear
refinement yet. Next compare and extend initialization for nearly planar and
distant scenes, then connect candidates to the physical projector. No UI changes.

## Alternative focal sweep (8A.2.2)

`src/calibration/CameraFocalSweep.js` is a second, independent headless
perspective initializer. It shares the Cartesian-metre, centered original
pixel, undistorted square-pixel conventions and candidate fields of
CameraPerspectiveSeed. Call `initialize(observations, {width, height,
minFocalPx, maxFocalPx, samples})`. Four correspondences are required; the
three-point pose equations generate solutions and all observations score them.
Default focal interval is image diagonal/4 to image diagonal*128 pixels,
with 33 logarithmic samples (2–129 configurable). Equal endpoints allow
known-focal initialization. No camera location, side or orientation is input.

Select a farthest pair from up to 64 evenly spaced observations, then up to
three largest-area third points from the full input. For each focal sample
derive a quartic from the three pairwise distances and unit image bearings.
Scale distance ratios around unity using the maximum bearing separation to
reduce cancellation at telephoto angles. Isolate real polynomial roots using
derivative critical points and bisection, and verify the original distance
equations and positive ranges. Compute proper rotation from oriented triangle
bases and translation from the corresponding points. Reject any candidate
with a nonpositive depth in any observation. Retain distinct candidates,
rank by original-pixel RMS, refine up to three sampled local minima by 24
golden-section steps in log focal. Report evaluated focal count and selected
triplets. This is a finite sampled search, always `complete:false`; it is
not an exhaustive P4Pf solver. A shared farthest pair can be vulnerable to
incorrect correspondences; no robust subset selection/RANSAC or final
nonlinear refinement is implemented. Frontal planar focal/distance ambiguity
is intentionally retained rather than forced into a unique estimate.

Ten standalone Node tests passed. Independent noiseless spatial recovery
from both sides achieved RMS 1.40e-6 / 2.45e-6 px; a synthetic 1500 m long,
8 m wide, 0.02 m height-variation bridge at ~10 km and f=24000 px achieved
3.76e-6 / 3.61e-6 px from the two sides. Also tested four noncoplanar
observations, fixed-focal large coordinate offsets, frontal planar ambiguity,
collinear rejection, deterministic noise, proper rotation and positive depth.
In the weak bridge fixture with deterministic +/-0.5 px perturbations,
best seed RMS was 0.444 px, focal 24486.3 px and position error 51.0 m.
These synthetic results are not measurements of real Causeway geometry or
physical optics. P4Pf comparison and more general alternative search remain
research items, not prerequisites for starting physical pose conversion.
No change to existing DLT module, production optics or UI.

## Physical pose bridge (8A.2.3)

`src/calibration/CameraPhysicalPose.js` converts a perspective candidate
into a physical Eye-Lvl camera without mutating the supplied scene model.
`fromPerspective(seed, model, width, height)` returns `pose` (CameraEast,
CameraNorth, Height, Pan, Nick, Roll, FocalLengthField, deviceRatio,
viewcenterHorizon), a centered full-canvas `camera` snapshot accepted by
CameraLandmarkProjection, actual focalPx and diagonalEquivalentMm.
`toPerspective(model, width, height)` performs the inverse;
`photoCamera(model, width, height)` creates the calibration snapshot.
The model must supply showModel (Globe=1 or Flat=2), rEarth and rFEarth.
Globe positions are Cartesian relative to the scene-origin tangent plane
before conversion; height is radial altitude and East/North are arc metres.
Transport orientation via the existing CurvatureCameraTranslation local basis.
The world-to-camera rotation is proper, with x right, y down, z forward.
Invalid or unrepresentable poses throw explicitly: no physical-domain clipping.

The calibration raster is centered with square pixels and no lens distortion.
Use the established full-canvas fallback scale (height/screenSize).
For raster aspect r=width/height the physical camera has a historical
sceneSize factor max(1,r/1.5). Consequently its FocalLengthField is
43.2*focalPx/hypot(width,height)*max(1,r/1.5), distinct from the nominal
diagonalEquivalentMm in wide rasters. This preserves actual calibration pixel
scale without changing production FOV semantics. It is not the EXIF focal
length; actual GraphX3DX viewport margins/crop and real raster registration
remain separate qualification work. No browser renderer settings are changed.

15 new deterministic tests plus both previous seed suites: 34 passed.
Round trips on Globe and Flat at 3:2, 2:3 and 16:9; Accurate and Canvas Direct
vacuum landmark projection versus independent pinhole equations; full
recovery from physical projector observations through DLT/P3P on both sides.
Maximum sampled vacuum round-trip error ~2.55e-13 px; fitted DLT maximum
~6.89e-12 px and fitted P3P maximum ~1.009e-6 px. Also negative tangent z
with positive radial height, wide-raster focal scaling, domain rejection,
and refracted landmark round-trip at ~22 km (Standard and Temperature lapse,
both methods and geometries), maximum ~1.03e-12 px. The latter tests pose
conversion invariance, not recovery of a refracted unknown camera. Tested
dependencies were checked against the current remote tree by blob SHA.
No full repo or browser raster regression was run. Next 8A.3: physical
residuals, constraints and bounded nonlinear optimization, using these seeds.

## Local physical least-squares fit (8A.3 baseline)

`src/calibration/CameraPhysicalFit.js` exposes `evaluate(model, pose,
observations, options)` and `fit(model, initialPose, observations, options)`.
The pose contains all seven physical camera fields. The centered raster
dimensions are required. Observations are `{kind:'metric'|'vertex', landmark,
pixel:[u,v], weight}`, with unique landmark IDs and positive scalar weights
(default 1). Metric is the default kind. These are calibration observations;
held-out points must be supplied separately to evaluate. A fixed model and
atmosphere (Vacuum, Standard, Temperature lapse) are used per call, with
explicit Accurate or Canvas Direct projection. No automatic fallback.
An out-of-frame point with finite coordinates remains in the objective;
blocked, unresolved or behind-camera observations invalidate the entire
evaluation, never disappear to reduce residuals. Report each observed and
predicted pixel, residual, weight, status and reason. The objective is
half the sum of weighted squared 2D pixel residuals; RMS is per point,
and weighted RMS divides by the sum of weights.

All seven fields are free by default. Optional freeParameters chooses the
subset; remaining initial values are held exactly fixed. Bounds are physical
parameter intervals intersected with the existing camera domain; an
infeasible initial pose is rejected, not silently clamped. Optional scales
apply in metres/degrees and dimensionless logarithmic focal length.
The local algorithm uses scaled central or one-sided numerical differences
where valid, damped augmented QR with Givens rotations, projected bounds,
active-gradient filtering and a capped step. Only strictly decreasing,
valid trials are accepted. Report termination (converged projected gradient,
stalled, iteration_limit, fixed, underdetermined, invalid_initial), best
accepted pose, evaluation counts and residuals. The result always declares
complete:false. This is not an exhaustive global search or a proof of
identifiability. Angle seam handling, robust loss, rank/conditioning,
uncertainty, multiseed orchestration and browser async cancellation remain
follow-ups. The function is synchronous and does not mutate the input pose.

12 new Node tests passed, 46/46 with the previous physical-pose and seed
suites. In four seven-parameter synthetic tests (Globe/Flat, Accurate Standard
and Canvas Direct Temperature lapse), ~94.47 px initial RMS fell below 1.8e-11
px. A separate ~22 km Globe Standard scene generated using Accurate
projections yielded a perspective DLT seed at 5.983 px RMS when evaluated
with Accurate, Canvas Direct refinement at 0.002348 px RMS in its own
approximate objective, and Accurate refinement at 1.657e-11 px RMS.
Parameter errors were below 0.1 in their respective physical units in the
latter fixture. These are noiseless self-consistency experiments, not a
measurement of real-photo accuracy. Also tested fixed parameters, active
bounds, weights, invalid points, out-of-frame residuals, deterministic noise,
iteration limits and actual authored bridge vertices. Dependency/test blob
hashes checked against the remote tree; no full repo or browser regression.
The next atomic step is multiseed orchestration and comparative objective
evaluation before the wider 8A.4 qualification. No UI or production optics
changes.

## Multi-seed calibration orchestration (8A.3.2)

`src/calibration/CameraCalibration.js` exposes
`calibrate(model, observations, options)`. It takes the same metric or
authored vertex observations as CameraPhysicalFit; no initial camera
location, orientation or focal length is required. The scene hypothesis
and atmosphere are fixed per run. Metric and authored mesh points are
converted into model-specific Cartesian coordinates (optics-neutral
physical geometry at zero observer height); the DLT/homography and P3P
focal sweep generators operate on those coordinates and original image
pixels. The current camera is not an implicit starting pose.

Options include width, height, atmosphere, temperatureProfile, step,
minFocalPx, maxFocalPx, samples, maxCandidates (1–32, default 8),
useApproximate (default true), initialPoses (optional explicit seeds),
freeParameters, fixedParameters, bounds, scales, maxIterations and
validation. Focal sweep bounds constrain perspective initialization, not
the final fit; use physical bounds for that. Locked values must be explicit;
the original scene pose is not a prior. Seeds outside user bounds or the
physical camera domain are rejected, not clamped. For a small observation
set a supplied pose can be refined with enough parameters locked; when
all parameters are locked the fixed pose can be evaluated directly.
The search selects a bounded number of distinct candidates, prioritizing
a representative of each source, then low perspective RMS with pose
diversity (2% of scene span or at least 1 m, 2 degrees, log focal 0.1).
This is a heuristic allocation, not proof of a global minimum.

Each selected seed is scored with Accurate. For non-vacuum conditions an
optional Canvas Direct local fit proposes a new starting pose, which must
be rescored with Accurate and improve the valid Accurate objective (or
recover a previously invalid seed) before it can replace the initial pose.
The subsequent Accurate fit cannot worsen that score. Do not directly
compare approximate RMS with exact RMS to select a final result. Final
candidates are ranked by the same weighted Accurate cost, with solver
termination and per-observation details. Invalid candidates are not
accepted. The result reports generation counts, rejected and omitted
seeds, attempts, candidate poses and evaluations, and always complete:false;
no_seed differs from no_valid_fit. Identical final minima may appear more
than once; distinct alternatives are not collapsed to one estimate.
Held-out validation observations must have separate landmark IDs and are
evaluated only after the ranking is fixed, with no influence on the fit.

12 new integration tests passed; 58/58 combined with the prior three
initialization/pose suites and local fit suite. Unknown vacuum cameras on
both sides of Globe and Flat recovered in the four synthetic fixtures
with RMS below 4.2e-12 px. On a noiseless ~22 km Standard Globe scene three
starts (one DLT, two P3P) achieved Accurate RMS 1.6536–1.6567e-11 px,
with parameter errors below 0.1 in their respective units for the best
candidate. The DLT initial Accurate RMS was 5.9834 px. The approximate
fit RMS was 0.002348 px; its Accurate rescoring was 0.0019044 px.
The authored bridge mesh test uses 28 vertices, best RMS 1.3332e-11 px.
A frontal vertical plane deliberately retained four accurate fits at
distances 242.84, 248.72, 328.54, 389.17 m with different equivalent focal
fields and RMS no greater than 1.03e-12 px. These are synthetic consistency
tests, not real-photo or independent physical-model verification.
Changing held-out image pixels left calibration attempts and ranking
unchanged. Explicit locks, no-seed/invalid-fit states, limits and
determinism were also exercised. 30 existing dependency/test hashes
checked against the remote parent. No full repository or browser tests.
Next 8A.4: numerical conditioning, identifiability and noise/atmosphere
sensitivity, distinct-minimum analysis, then editor UI. The pipeline is
synchronous, has no worker cancellation, P4Pf/RANSAC or exhaustive search;
strong refraction, difficult visibility, unknown lens/crop or incorrectly
identified geometry may prevent successful recovery. No production optics
or UI changes.

## Local conditioning and sensitivity (8A.4.1)

CameraPhysicalFit.diagnose(model, pose, observations, options) reuses the
fit's parameter scales, bounds, locks and weighted residual Jacobian.
One-sided Jacobi SVD is applied directly to J, not J^T J. Report the
scaled right singular vectors, singular values, local physical parameter
tangents (focal tangent obtained from the log-focal scale), weighted
pixel RMS per scaled unit, finite-difference schemes and boundary flags.
The numerical resolution threshold is max(relativeTolerance*sigmaMax,
2*Frobenius norm of J(h/2)-J(h)); relativeTolerance defaults to 1e-8.
This heuristic is not a certified derivative error bound. Condition
number is reported only when all free directions are numerically resolved.
A rank deficit means unresolved at the indicated scale and threshold,
not necessarily a mathematically exact null space. At bounds the modes
are linear sensitivity directions, not certified feasible displacements.
Invalid poses or unavailable derivatives give explicit status, not rank.
No covariance, statistical interval, global identifiability or automated
selection of a unique solution is claimed. The diagnostics are opt-in;
the multiseed ranking is unchanged.

Seven additional tests in the existing local fit suite: spatial rank 7/7
on Globe/Flat (scaled condition ~545), frontal plane rank 6/7 with the
expected focal/distance null direction, collinear rank 5/7, insufficient
observations, fixed/bounded fields, invalid projections, and weighted mode
sensitivity checks. A distant Standard Globe synthetic sensitivity fixture
(~22 km, 40 m height, 12 fitting and 3 held-out observations) has rank 7/7,
condition ~7275, weakest weighted RMS ~0.123 px per scaled unit. The local
fit deliberately starts at the true pose to isolate sensitivity. Noiseless
matching atmosphere recovers exactly; deterministic sinusoidal +/-1 and
+/-3 px per-coordinate perturbations give fit RMS 0.953/2.859 px, spatial
position errors 588.43/1821.67 m, heights 34.07/21.42 m, held-out RMS
0.151/0.452 px. The 3 px case terminates stalled, not converged.
Fitting the noiseless Standard observations under Vacuum gives 0.00725 px
fit RMS and 0.01012 px held-out RMS yet height 49.61 m (+9.61 m).
These are individual synthetic local sensitivity experiments, not
population estimates or global recall measurements. Further 8A.4 work:
multiple noise realizations, model/atmosphere hypotheses, outliers, candidate
recall and renderer-derived independent observations.

65/65 tests passed in five calibration suites (7 new tests). All 32 parent
source/test blobs in their literal dependency graph matched the remote
tree. New source/test hashes match tested files. No new JS modules or literal
require edges; the current isolation fixture remains valid. Full current-tree
regression and browser tests are not locally verified because the checkout
is stale outside calibration and direct GitHub networking is unavailable.
Run CI on the published commit before accepting. No production renderer or
UI changes.

## Paired Gaussian noise experiments (8A.4.2)

Two reproducible research tests extend CameraCalibration.test.js without
changing the production solver. The near (~670 m) and distant (~22 km)
synthetic Globe Standard scenes each have 12 fitting and 3 noiseless
held-out landmarks. Independent standard-normal coordinate perturbations
are generated by a seeded LCG/Box-Muller (0x8a42); the same draws are reused
between scenes, sigma=1 and 3 px, and strategies. The 12 local trials per
scene/sigma start at truth to isolate sensitivity. The first four draws
per scene/sigma also undergo blind DLT/P3P calibration with up to three
candidates. Distant local trials are repeated with true focal field fixed.
This is 88 fitting/search trials, not 88 independent noise samples.
A larger initial blind-search run was stopped before results were available
because of runtime; the four-trial subset is predetermined, not
selected by result. Explicit common bounds: East/North +/-100 km,
height 0.001–1000 m, focal field 4–1000; 60 iterations per local fit,
17 focal samples for blind search. The atmosphere is known in these
experiments. Noiseless validation is synthetic, not an independent
measurement of scene geometry or refractive physics.

The test logs status counts, valid/held-out-valid counts, count of
held-out RMS <=1 px (denominator includes failures), and median/p90
of position error, absolute height error, relative focal error, fit
and held-out RMS among finite valid results. Position error is the
Euclidean distance in authored East/North/Height coordinates. Stalled
or iteration-limited fits are not counted as converged; all valid
solutions remain in the statistics. Selected output from Node 22.16:

| Scene / strategy | sigma px | n | median position m | p90 position m | median height error m | median focal error % | median fit RMS px | median held RMS px | held <=1 px | converged |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Near local | 1 | 12 | 33.35 | 68.50 | 1.10 | 5.34 | 1.195 | 0.695 | 10 | 5 |
| Near local | 3 | 12 | 110.46 | 248.65 | 3.37 | 17.67 | 3.586 | 2.082 | 1 | 3 |
| Near blind | 1 | 4 | 25.13 | 32.67 | 1.15 | 3.67 | 1.119 | 0.568 | 4 | 1 |
| Near blind | 3 | 4 | 71.76 | 102.92 | 3.55 | 10.51 | 3.360 | 1.702 | 1 | 1 |
| Distant local | 1 | 12 | 2246.50 | 4419.99 | 9.75 | 10.63 | 1.195 | 0.613 | 11 | 4 |
| Distant local | 3 | 12 | 5932.99 | 18297.21 | 32.07 | 28.26 | 3.589 | 1.818 | 0 | 1 |
| Distant blind | 1 | 4 | 2355.70 | 2929.27 | 9.75 | 10.74 | 1.063 | 0.591 | 4 | 1 |
| Distant blind | 3 | 4 | 5947.60 | 6965.37 | 32.00 | 25.87 | 3.190 | 1.736 | 0 | 1 |
| Distant known-focal local | 1 | 12 | 199.03 | 249.80 | 7.36 | 0 | 1.210 | 0.597 | 12 | 6 |
| Distant known-focal local | 3 | 12 | 592.49 | 737.05 | 21.74 | 0 | 3.631 | 1.792 | 1 | 3 |

All 88 trials had valid fit and held-out projections; 26 converged,
61 stalled and one reached the iteration limit. The small paired
sample is exploratory, not a statistically calibrated confidence
interval or a general failure probability. The different sample sizes
mean near blind and near local medians are not a direct comparison
of algorithm accuracy. Holding true focal reduces the distant median
position error about 10–11x without resolving height ambiguity.
Pixel agreement does not establish camera position or Earth geometry.
The frequent strict-gradient stalls motivate a separate convergence
criterion review, not silent reclassification of solver status.

14/14 CameraCalibration tests passed (~151 s including the two new
research tests); 53/53 in the other four calibration suites, total
67/67. 32 existing dependency/test hashes checked against remote parent,
new test hash checked; no new module or literal require edge. Previous
8A.4.1 full CI passed all three jobs. New full current-tree CI pending;
local checkout stale outside calibration. Next: 8A.4.3 compare Globe
and Flat, atmosphere mismatch with equal constraints and held-out
landmark design; outliers and independent renderer evidence remain
qualification items. No UI or production changes.

## Equal-budget cross-hypothesis experiments (8A.4.3)

Two synthetic Standard atmosphere observation sets use the same authored
surface-arc coordinates/altitudes, raster (1920x1080) and true camera
(East -1500 m, North -6000 m, height 40 m, focal field 200, Pan towards
scene, Nick -0.06 deg, Roll 2 deg), one generated with Globe and one
with Flat. Twelve landmarks center around 22 km, three separate nearby
depth landmarks are held out, and four further validation landmarks
lie at authored north offsets of 11, 14, 30 and 36 km from the true
camera (approximately those ranges). The latter deliberately extend
outside the fitted depth interval. All validation pixels are clean.
Each truth geometry is fitted under all four Globe/Flat x Standard/Vacuum
hypotheses, at zero noise and the same single seeded Gaussian draw
(sigma 1 px per coordinate, seed 0x8a43). No true pose enters seed
generation; seven fields free. Equal bounds, 17 focal samples, at most
3 selected seeds and 60 local iterations as in 8A.4.2; no cross-hypothesis
reuse of fitted poses. Final objective Accurate for every hypothesis.
The shared true-pose score is a separate diagnostic, not an initializer
or input to ranking. Both held-out groups remain outside the objective.
These tests use the physical projector itself as the observation
generator, not an independent physical or raster oracle.

Results (RMS in original raster px; height m; approximate rounded
values from Node 22.16). All 16 searches returned 3 valid candidates;
all validation points projected visibly. Of the selected best fits,
7 had converged termination, 9 stalled; the finite search is not an
exhaustive minimum certificate. Near/extrapolation sets must remain
separate and invalid projections must not be removed.

| Truth | Sigma | Hypothesis | Fit RMS | Near held RMS | Extrapolation RMS | Fitted height |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Globe | 0 | Globe Standard | 1.65e-11 | 1.18e-11 | 8.00e-11 | 40.00 |
| Globe | 0 | Globe Vacuum | 0.007249 | 0.010116 | 1.120199 | 49.61 |
| Globe | 0 | Flat Standard | 0.026696 | 0.038884 | 4.423615 | 1.95 |
| Globe | 0 | Flat Vacuum | 0.019987 | 0.029115 | 3.305642 | 11.59 |
| Flat | 0 | Globe Standard | 0.026711 | 0.038937 | 4.429983 | 77.99 |
| Flat | 0 | Globe Vacuum | 0.033633 | 0.048836 | 5.548145 | 87.55 |
| Flat | 0 | Flat Standard | 1.68e-11 | 1.16e-11 | 6.94e-11 | 40.00 |
| Flat | 0 | Flat Vacuum | 0.007219 | 0.010077 | 1.116162 | 49.59 |
| Globe | 1 | Globe Standard | 1.276974 | 1.005132 | 10.781591 | 8.11 |
| Globe | 1 | Globe Vacuum | 1.276311 | 1.004366 | 10.110046 | 16.62 |
| Globe | 1 | Flat Standard | 1.344065 | 0.802411 | 10.742086 | 0.001 |
| Globe | 1 | Flat Vacuum | 1.309766 | 0.852704 | 10.629331 | 0.001 |
| Flat | 1 | Globe Standard | 1.272738 | 0.997950 | 8.735939 | 43.67 |
| Flat | 1 | Globe Vacuum | 1.272227 | 0.997568 | 8.593064 | 52.12 |
| Flat | 1 | Flat Standard | 1.276601 | 1.005360 | 10.653347 | 10.18 |
| Flat | 1 | Flat Vacuum | 1.275949 | 1.004603 | 10.004267 | 18.67 |

Without noise, the shared true camera under the wrong Standard geometry
gives 14.993 px fit RMS in either direction. Independent calibration
reduces that to ~0.027 px by changing height by about +/-38 m and other
camera fields; the wider distance validation increases the discrepancy
to ~4.42 px. Even a wrong atmospheric hypothesis within the correct
geometry can closely fit a narrow distance interval. With the single
noisy draw, the correct hypothesis need not attain the smallest training
or held-out residual: pose errors exceed 1.3 km for both correct models,
and both Flat fits to Globe truth hit the minimum allowed height of
0.001 m. Extrapolation then also becomes unreliable (roughly 8.6–10.8 px
across hypotheses); broader depth sensitivity does not guarantee
discrimination. Independent constraints, broad depth coverage and
uncertainty analysis matter. This is a qualitative synthetic demonstration,
not a statistical model selection test, physical model verification or a
claim about actual photographs. Logs retain per-fit status, counts,
separate validation scores, height, position/focal errors and shared-pose
scores. No production solver change.

Two new tests in the existing CameraCalibration suite passed in 32.6 s
using a test-name filter. The parent full CI passed all three jobs
(run 44560663686). All 27 loaded production dependencies and the original
test blob were checked against the parent tree; new tested blob matched.
No new module or literal require edge; architecture inventory unchanged.
Full new CI pending; local checkout stale outside calibration. Before
claiming 8A.4 complete, remaining qualification includes outlier/repeated
feature sensitivity, wider independent renderer-derived and near-horizon
tests, and convergence review. Then 8B editor; no UI change here.

## Goal and scientific method

Given a reference photograph, reliable scene geometry and identified
correspondences, estimate a camera's position, height, orientation and
intrinsics, with uncertainties and explicit assumptions. Use the same
camera and geometry to evaluate alternative physical predictions. This is
not an automatic assertion of shape from any arbitrary photograph, nor a
requirement that the existing Legacy animation match the images. A single
view may be underdetermined: unknown scene scale, crop, focal length, camera
height, orientation and refraction can compensate for one another.

Separate **calibration points** (used to solve for camera) and **validation
points** (held out from fitting, selected before inspecting results). Prefer
well-distributed nearby independently surveyed features for calibration;
reserve distant navigation spans or other sensitive structures for validation.
Nearby does not imply zero curvature or refraction: quantify the systematic
sensitivity and geometry uncertainties. An alternative model may be evaluated
with identical independently measured camera parameters; if calibration itself
requires a physical model, report that dependency, evaluate sensitivity or fit
both hypotheses with identical constraints and held-out points, rather than
claiming that a fit under one model is model-independent. Do not retune the
camera after seeing validation residuals without documenting a new protocol.

Observed image points are pixel coordinates in the original orientation and
framing. Model points must identify actual world features (stable geometry
IDs and explicit coordinate conventions), not merely approximate matching
screen pixels. Keep source uncertainties, measurement provenance, lens
calibration/crop and camera metadata independent of fitted estimates. No
atmospheric reconstruction is implied by the standard-atmosphere option.
A measured camera location/height/level or focal length may be fixed, or
supplied as a prior with uncertainty. Distinguish measured, reported, estimated
and unknown inputs. Use consistent units and coordinate frames on both sides.

## Candidate numerical approach (to investigate, not selected as final)

For model landmark X_i and observed image point x_i, projection pi(p, X_i)
uses the camera parameter vector p. Minimize weighted reprojection residuals
`sum_i w_i ||pi(p, X_i) - x_i||^2` over free parameters, with appropriate
uncertainty weighting (possibly covariance matrices) and optional justified
priors. The fit should expose per-point residuals in original-image pixels,
RMS, held-out errors, optimizer convergence and parameter uncertainty.

Initial candidate variables: local East/North, camera height, heading,
pitch, roll and focal length/FOV. Research principal point, crop, aspect
ratio and distortion separately: do not silently assume a centered uncut
image or equate focal length with FOV. EXIF orientation and original raster
coordinates need an explicit transform. Read the existing camera/control
and projection code for its units, signs, reference datum, Earth coordinate
mapping, sensor convention and actual `FocalLengthField` semantics before
implementing a numerical mapping. The user may lock any independently known
parameter, and the UI should display which are free, fixed or constrained.

Do not render every pixel at every iteration. Investigate direct optical
projection of landmarks using the existing scene/optics calculations, with
explicit handling of invisible/occluded points and invalid ray solutions.
Evaluate Canvas Direct/effective-radius as a fast initialization for supported
conditions and Accurate RK4 for refinement/verification. Neither general
availability of the point projection API nor its numerical accuracy is assumed.
Benchmark residual and performance parity; if approximate branches fail, use
accurate methods or report limitations, never silently accept approximate fits.

Candidate optimizers include bounded nonlinear least squares (Levenberg–
Marquardt or trust-region methods), scaled parameters and multistart; test
analytic/numerical Jacobians, conditioning, rank and degeneracy, convergence,
noise and systematic bias on synthetic known-camera observations. Correlated
or poorly constrained parameters must be flagged, not reported with false
precision. Compare held-out predictions using uncertainty from geometry,
image coordinates, camera parameters and atmosphere; distinguish fit residuals
from physical-model evidence. Assess computational cost before selecting a
library or implementing a solver. Test reproducibility with fixed seeds.

## Proposed UX and deliverables

- 8A: audit geometry, projection/occlusion, camera conventions and numerical
  algorithms; synthetic experiments, known-camera recovery, degeneracy and
  speed/accuracy; choose approach and data contracts only after evidence.
- 8B: original reference image and model view, editor for matched world/image
  points with labels, calibration/validation designation, weights/uncertainties;
  support zoom/pan without modifying original pixel coordinates.
- 8C: parameter locking, estimation, progress/cancel, bounds and diagnostics;
  no silent overwrite of an active experiment. Render residual vectors and
  fitted model; handle failure and invalid ray branches explicitly.
- 8D: rank/conditioning and sensitivity, uncertainty and independent held-out
  validation, reproducible results under alternative models/atmospheres.
- 8E: save an explicitly accepted result as an ordinary experiment; integrate
  Library/History and Studio so the camera can become a keyframe. Decide
  portable calibration evidence schema based on the actual research, not 7C.1.

## First application: Soundly Causeway (9A–9B)

The current nine-frame demo is a qualitative Camera adaptation of Legacy,
not a pixel match to observations. It is Lake Pontchartrain Causeway (the two
road bridges and navigation spans), NOT the separate transmission-line case.
Search for several independently sourced bridge views, including observations
from different heights and both directions when available. The Marriott
observation and opposite-shore views are candidates, not verified inputs here.
Investigate Walter Bislin's Causeway data and comparison pages, original Soundly
and Jesse Kozlowski observations and survey evidence; reconcile coordinates,
bridge geometry, dates, image framing, height datum, camera metadata and rights
before shipping. Do not assume any transmission-line photo belongs here.

Retain or revise explanatory fly-through frames freely. Create new observational
frames from the selected photographs and calibrated cameras rather than forcing
photos onto existing Legacy positions. Fix camera/geometry across Globe/Flat
and atmosphere variants for the main comparison; report uncertainty and model
sensitivity as above. Show reference, Globe and Flat with unambiguous labels.
Validate standard atmosphere as a physical scenario, not historical weather;
quantify Canvas Direct vs Accurate RK4 on real final frames. Finalize narrative,
cover, timing and imagery only after calibration and source verification. The
same tool should later support other scenes (mountains, buildings, transmission
lines, lighthouses) without a Soundly-specific solver.


## 8A.4.4a — Incorrect correspondences and manual review

The practical authoring question is whether a wrong photo-to-landmark match
can visibly distort the camera fit or be identified for manual correction.
Two deterministic synthetic research tests in `tests/CameraCalibration.test.js`
hold the physical model fixed: near spatial landmarks in vacuum and distant
Standard-atmosphere landmarks at approximately 22 km. Each uses 12 training
points, three untouched validation points, and a reproducible 1 px standard
deviation coordinate-noise draw. Compare clean/noisy, one wrong match, and
three wrong matches. Near mismatches use another feature's pixel; distant
mismatches use synthetic 100–300 m depth-shifted copies of the same feature
(not measured bridge geometry or spacing).

Record blind candidate and truth-start control results, raw and weighted RMS,
clean-reference and held-out RMS, pose errors, termination, and ranking of the
injected wrong matches by residual magnitude. Compare manual review with
known injected labels (weight 0.001, a diagnostic oracle, not a detector) and
two test-only Huber-style reweighting passes (2 px residual-norm threshold)
initialized by the unweighted blind fit. No validation point influences the
search. No observation is deleted, and the production loss, seed selection,
solver and API are unchanged. Residual rankings are diagnostic: small
residuals cannot certify correct identity, and downweighting cannot repair
a coherent but wrong assignment. No robust-loss production change is
justified until measured results and practical editor needs are reviewed.

Execution completed in CI (see results below).

## 8A.4.4a — Results and authoring decision

CI run 44568506091 passed all three jobs; Node reported 2060 tests, 2059 passed, 0 failed (one not passed). Both new research tests passed.

| Scene / wrong matches | Unweighted training RMS px | Held-out RMS px: unweighted / Huber pass 2 / reviewed | Position error m: unweighted / Huber pass 2 / reviewed | Wrong-match residual ranks (unweighted) |
| --- | ---: | ---: | ---: | --- |
| Near / 0 | 0.784 | 1.229 / — / — | 55.7 / — / — | — |
| Near / 1 | 17.014 | 13.406 / 2.550 / 1.359 | 565 / 131 / 61 | 1 |
| Near / 3 | 42.181 | 49.149 / 19.815 / 1.566 | 526 / 384 / 9.6 | 2,3,1 |
| Distant / 0 | 0.963 | 0.831 / — / — | 2347 / — / — | — |
| Distant / 1 | 1.012 | 1.057 / 1.057 / 0.875 | 3294 / 3294 / 2461 | 3 |
| Distant / 3 | 1.558 | 3.717 / 3.742 / 0.836 | 5538 / 5941 / 2015 | 11,10,2 |

Blind and truth-start unweighted scores agreed to numerical precision in all six scenarios (near three-error run reached iteration limit; distant truth-start converged while blind stalled at virtually identical scores). Residual magnitude is useful for review, not an identity classifier. The distant clean case already has poor pose conditioning. The reviewed weights use injected labels, not automatic identification; weighted and raw training RMS are not interchangeable. Two Huber passes improved near validation but did not help distant mismatches. This is only one noise realization per scene; no general robustness claim.

Decision: no production robust-loss change now. The editor should show raw residual vectors and rankings, allow manual correction and weighting, retain independent validation, support known-parameter locks and visual whole-scene review. Proceed to bounded 8A.4.4b; revisit robust fitting only if practical authoring needs it. Review termination labels in 8A.4.4c.


## 8A.4.4b — Production Accurate renderer / photo camera parity

The previous authored-landmark tests used the renderer's captured camera.
New tests independently reconstruct the centered photo camera from the same
pose and original raster, and compare against the actual production Accurate
Canvas painter (default shared optical field and default renderer RK4 step,
versus individual 200 m shooting in calibration). Four fixed scenes:
Globe vacuum near the geometric horizon (12.3 km), Globe vacuum partially
hidden tower (22 km), Globe Standard distant telephoto (22 km), and Flat
Standard portrait telephoto (22 km). A translated, rolled Eye-Lvl camera,
400 mm FocalLengthField and a single 23 m authored tower are used.

Select 16 authored stroke vertices stratified by height before projection;
report every selected status, compare visible landmarks to nearest projected
stroke endpoint **from the same authored primitive** using the renderer's
optical source command index, and confirm those reference coordinates
actually reached the Canvas stroke commands. Require nonvacuous coverage,
no missing same-source stroke for selected visible points, <=1 px maximum
landmark error, and <=1e-5 px reference-to-Canvas coordinate error; explicit
mixed blocked/visible coverage for the partially hidden Globe towers.
Blocked/indeterminate points must not supply pixel residuals. This is a
Canvas command-coordinate audit, not a browser raster/image comparison;
same-primitive nearest matching does not certify the exact endpoint identity,
nor does it establish mesh self-occlusion or behavior at every grazing ray.

No production changes. Local execution could not be performed because the
test environment cannot resolve github.com and has no repository checkout.
CI results and actual measured errors are pending; do not advance to 8A.4.4c
before reviewing them.
