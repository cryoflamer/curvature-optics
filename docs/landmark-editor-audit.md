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

## Subsequent refinement

The original package-selection/modal/front-view MVP and precise owner
selection (8F.2a) have been implemented and user-tested. The agreed primary
workflow is now a generic 3D Scene Magnifier: rectangle selection, modeless
window, optical re-rendering of the same crop, independent local geometric
orbit, and exact reset. See stages 8F.2b–d in the current
[implementation plan](landmark-editor.md), which supersede the original
single-owner selection, context and initial-view defaults below. The
authored owner and fixed anchor contracts remain unchanged. The old
audit's geometric-only viewer describes Free View, not Scene View; the
latter must preserve the main optical projection. Mode-specific picking
must be audited in 8F.3.

The canonical material value representation was implemented in 8F.4a;
see [current contract](landmark-editor.md#8f4a--canonical-material-anchor-representation-implemented).
The original proposals below are historical; uniform index/weight tuples,
Globe-only authoring and persistence ahead of UI supersede earlier choices.

## Source audit and decisions

| Existing source | Finding / consequence |
| --- | --- |
| `src/geometry/CurvatureGeometryEngine.js`: localObject, createPlacedObjectScene, placeOnPlane, towerPlacement, objectSequence, createObjectSequenceScene | All local object types produce 2D polygon/line coordinates, placed by an affine plane basis. Variant geometry depends on sequence context (drawn, total, bank, side, variation, type), not merely type. The sequence also authors connecting world-space polygons. |
| `src/geometry/CurvaturePhysicalWorldGeometry.js`: placement | Shared physical surface placement retains the Globe/Flat east/north convention; local axes contain object size and scale. |
| `src/renderers/CurvatureCanvasDirectPreview.js`: objects, objectIdentityColor, paintGroup, drawPrimitive | Existing RGB identity pass identifies placed packages; painter order and terrain mask are approximate, not a depth test. Identity pass makes styled primitives opaque. |
| `src/ui/modern/ModernPhotoCalibrationEditor.js`: ownerAt, visiblePick, renderModel, prepareScene, pickAt, updateObjects, selectLandmark | Ownership raster, hover highlight, manual bank/object menus and vertex picking already exist. Object-interior click without a vertex currently does not select a correspondence. Reuse this infrastructure, not a new full-scene ray caster. |
| `src/geometry/CurvatureEarClip.js`: triangulate, inspect | Conservative 2D ear clipping with duplicate/collinear removal and self-intersection rejection; returns coordinate triangles, not original vertex IDs. Cannot store its output triangle ordinal as durable identity. |
| `src/scene/CurvatureSceneContract.js` | Renderer-independent finite 3D lines and polygons, mode, style and arbitrary metadata. No indexed solid mesh or thickness contract. |
| `src/calibration/CameraLandmarkProjection.js`: create, bank, fromWorld, vertex, authoredVertexRanges | Shared projector accepts metric and legacy vertex landmarks. Bank generation differs by method; use exact authored mesh for each projection path and shared fromWorld, not a second optical formula. |
| `src/calibration/CameraPhysicalFit.js`: observations, evaluator, prepare, diagnose | Current accepted kinds metric/vertex; dispatches by kind. Scale uses authored vertex ranges. Extend validation and range resolution; keep camera-only least squares and SVD unchanged. |
| `src/calibration/CameraCalibrationWorker.js` | Worker imports geometry/projection/fit dependencies; add new pure modules to worker and browser loading paths in implementation. |
| `src/ui/modern/ModernPhotoCalibrationEditor.js`: pair, upsert, importExperiment, restoreDraft, initialProjection, bestProjection, meshDraw | Vertex-only validation, ID-as-row-key, vertex lookup for markers, draft v1 and portable experiment v1/v2. Residual projection already dispatches by kind. Need explicit migration and transactional edits. |

## 1. Geometry and viewer

The authored object is primarily a **planar cutout**, not a closed solid.
For local coordinates (u,v), world placement is O + u X + v Y. The local
viewer must display this actual polygon/line geometry; do not extrude,
invent unseen side faces or add selectable thickness. Standard orbit view
remains useful for spans and context, but an isolated planar support is
best inspected face-on. Include a Front/reset view as default, an orthographic
option and back-side indication; an exactly edge-on plane cannot provide
a well-conditioned surface hit. Display the actual physical dimensions in
metres. For coincident coplanar fills, preserve authored paint order as the
default, with explicit cycling/list of ambiguous primitives. Do not use
arbitrary z offsets as geometric coordinates.

Use a small dependency-free Canvas 2D isolated viewer, with a local 3D
camera, pure projection/unprojection, and analytic ray/triangle and projected
edge/vertex tests. No WebGL/WebGPU or new third-party scene library required
for this first implementation. Keep depth/picking independent of Canvas
draw order for noncoplanar surfaces; painter-sorted display is sufficient only
where it agrees with pick visibility. If necessary, report/order ambiguous
intersections rather than promise perfect arbitrary mesh visibility. Test
view consistency. Separate viewer camera, hover, selected primitive and
uncommitted anchor from physical state. Face-on view, orbit, pan, zoom,
wireframe, conventional axes, and click-versus-drag are sufficient.
Use a local orthonormal basis centered near the placed support, transforming
the real authored physical world points (Height=0); spans use the same frame.
This keeps metre precision and includes actual connected geometry. Do not
reuse the physical camera's viewport or model mutation. Reopen object in
front view or restore local viewer state only. Scene-selection MVP is for
the existing calibration Canvas Direct view; Accurate remains supported by
the headless projector, not a new Accurate identity pass.

## 2. Identity contract (snapshot-scoped, not globally persistent)

Existing painter key = placedObjectIndex * 2 + bank + 1. Existing vertex
ID = b{bank}:p{global primitive index}:v{vertex index}. Both depend on
enumeration. Inserting a span/primitive, changing counts, or reordering
columns can shift them. They must not be new persistent geometric identities.

Proposed canonical descriptors (JSON data only, no live JS objects):
- Object owner: bank, objectType, stationIndex (sequence index expressed
  near-to-far = configured count - 1 - drawn for a nontruncated sequence),
  column (existing assigned column, 0 for single row). Include authoring
  context and reject truncated or ambiguous instances. Display far-to-near
  placed index as before; it is not the canonical identifier.
- Span owner: bank, objectType, endpoint object owners (far/near in authored
  order), role (bridge-road, soundly-road, tensas-road, tensas-shore), side
  or edge where applicable. Current Tensas metadata does not retain the edge;
  attach it during authoring instead of inferring from pixels. Existing spans
  are grouped under the later placed instance for painter purposes; preserve
  that grouping/order. For 8F.1 select the package; in the isolated viewer
  include its incoming span(s) with their own identities, optional visibility
  and explicit labels. No main-scene span-specific RGB pass required initially.
- Primitive identity: owner + local authored primitive ordinal (or span role
  within its endpoint pair). Preserve original vertex order/indices, including
  repeated closing points for legacy ID compatibility. Add nonvisual metadata
  at the geometry-authoring boundary; keep primitive order, geometry and style.
- Guard: deterministic versioned authoring/topology signature for each bank,
  binding all layout fields (NObjects, ObjType, ObjDist, ObjDeltaDist,
  ObjSideType, ObjSidePos, ObjSideVar, ObjSizeType, ObjSize, ObjSizeVar) and
  canonical ordered owner/primitive/vertex topology; bind local authored
  coordinates or equivalent stable geometry revision so same-count semantic
  changes are not silently accepted. Define canonical encoding and tolerances
  in implementation, do not hash camera-dependent world floating-point
  coordinates. Exclude camera, photo, atmosphere, display and hypothesis
  curvature/R from the signature; require topology parity across supported
  projection branches, fail explicitly if not. Layout changes invalidate
  rather than silently remap anchors. This intentionally conservative scope
  avoids pretending to have universal feature IDs. Existing v1/v2 legacy
  vertices retain original interpretation; do not retroactively claim they
  had this guard.

## 3. Anchor and observation contract

Keep outer row {kind, landmark, pixel, weight, included}. Introduce kind
'edge' and 'surface' (and keep existing 'vertex' and headless 'metric').
New authored landmark contains id, owner, primitive identity, signature,
and one of:
- vertex: original index;
- edge: ordered pair of adjacent original indices and finite t in [0,1];
- surface: three distinct original indices forming a canonical accepted
  triangle and finite nonnegative weights summing to 1 (absolute tolerance
  1e-9; reject outside tolerance; normalize once at input).
New vertex anchors may share this descriptor; legacy vertex path retained.
Use deterministic triangle vertex tuples, not ordinal triangles, screen
pixels, or unstable post-clipping vertices. Edge indices refer only to
authored perimeter/line segments, not triangulation diagonals. Canonicalize
reversed edges and triangle vertex permutations with their weights. Snap
endpoints to vertices and surface boundary edges to edge anchors where
appropriate; do not turn an internal diagonal into an authored edge.
Reject degenerate segments, triangles, weights, unknown owner/role and stale
signature. No silent fallbacks.

Current landmark.id is also used as row identity for UI markers, duplicate
checks, Undo and solver result matching; moving a legacy vertex changes its
ID. For new anchors differentiate a stable observation ID from geometric
identity: landmark.id remains the opaque observation key sent to fit and
result diagnostics; geometric descriptor has separate canonical anchor key.
Keep old IDs on import; allow a legacy row to become a new anchor while
preserving its row ID (v3 accepts opaque IDs for new descriptors). Do not
change existing saved legacy vertex ID rules. Reject duplicate observation
IDs; prevent duplicate geometric anchors in UI using canonical descriptor
and explicit geometric coincidence tolerance, not observation IDs alone.
Exact key encoding and migration tests belong to 8F.4/8F.6.
No optimizing anchor coordinates: all anchors fixed for fit and diagnose.

## 4. Triangulation, selection and projection

8F.3a implementation: physical local points are scaled in a stable plane;
EarClip carries the original integer vertex index as its third coordinate.
The adapter does not modify EarClip or its legacy callers. Near clipping
for edges preserves the original parameter; perspective screen interpolation
is corrected by reciprocal camera depth. Free View unprojection uses its
actual off-axis rolled camera and forward-depth parameter. Coplanar hits
are returned as distinct primitive candidates; the default ordering is
reverse authored item order within the depth tie, not certified painter
parity. Invalid fills are reported separately, so visibility is explicitly
geometric-only; UI reconciliation and interaction belong to 8F.3b/c.
Scene View inverse remains a separate audited stage (8F.3d).


For planar authored filled polygons (mode & 2), triangulate in their own
plane, using existing conservative EarClip logic with an index-preserving
adapter or extension. Retain original index mapping after duplicate/collinear
cleanup; never change legacy polygon rendering or triangulate wire-only
mode-1 polygons into selectable surfaces. Show outlines/wires and allow
vertex/edge picking on authored segments. For a failed/self-crossing/
degenerate polygon, report surface unavailable, preserve legitimate
edge/vertex choices. No fan triangulation of arbitrary concave polygons.
For spans project to a locally defined plane for planarity/triangulation
checks; if nonplanar beyond defined scale-aware tolerance, do not invent
a diagonal or certify Canvas Direct fill parity; restrict to edges/vertices
until a shared explicit triangulated surface is authored. Use canonical
physical geometry to define indexed triangle connectivity once and check it
across optical variants, rather than choosing a new triangle per pose.

Local ray hit determines barycentric weights on selected actual triangle.
For a local planar object the affine placement commutes with interpolation:
P = sum(w_i * P_i). For a span apply the same weights to its authored world
vertices, respecting both endpoint frames. The physical anchor is a fixed
material descriptor, not a frozen screen position or a metric ground point.
Do not interpolate projected pixels, ray angles or refracted samples.

Projection must resolve the same descriptor in the existing method's bank:
- Accurate: physical Globe/Flat surface, Height already subtracted; resolve
  world point then existing fromWorld ray shooting/visibility.
- Canvas Direct Globe: effective-radius authored geometry with Height=0;
  resolve world point then existing observer translation and terrain mask.
- Canvas Direct Flat: physical zero-curvature authored geometry with Height=0;
  resolve world point *before* signed flatRefractionPoint (nonlinear).
Preserve original pixel dimensions; preview scales only for display. Extend
authoredVertexRanges via shared resolver for new anchors using physical
geometry/initial tangent frame, then reuse the current median range rule.
Keep legacy numerical parity, visibility statuses and invalid objective
handling; mesh occlusion remains not-tested in the headless projector.

## 5. Integration boundaries and stage acceptance

- 8F.1: enrich stable owner metadata/descriptor extraction; reuse RGB
  ownership and highlight, add explicit object-selection action/mode and
  retain legacy vertex clicking. Manual bank/object fallback when raster
  ownership is unavailable. Selecting a package alone must not create row,
  change camera, cancel fit or replace pending pixel. Original painter order
  unchanged. Tests for overlapping packages, two columns, connected spans,
  no vertex near click, and existing vertex selection regression.
- 8F.2: independent local viewer (pure geometry/frame, local camera, input
  lifecycle) using actual authored package and optional connected spans.
  No calibration schema changes required yet.
- 8F.3: indexed triangulation and ray/edge/vertex picking, hover/cancel/
  apply staging, face-on accuracy and overlap/degenerate handling.
- 8F.4: validated anchor resolver shared by physical projection, fit and
  diagnose. Mixed kinds, exact vertex/endpoint parity, analytic interior
  barycentric points, correct Flat signed-refraction ordering, Globe with
  effective vs physical radius, camera movement, span endpoints and invalid
  topology. Test actual Canvas Direct/Accurate supported paths, noting
  renderer approximation and nonplanar policy. Preserve old baseline.
- 8F.5: update all vertex-only editor paths (label, selected, pending,
  byLandmark markers, edit/drag, snapshot, initial/best/residual fit controls);
  separate transaction from viewer navigation. On Apply only, preserve photo
  point, row ID for new anchors, weight, Fit/Validation, row order, record one
  undo and invalidate stale result/cancel worker. Cancel does not mutate.
  Existing workspace Tab/Escape/Delete shortcuts must not leak into viewer.
  Nonvertex markers need direct shared-projector result, not nearest vertex.
- 8F.6: portable v3 + versioned draft payload; strict v1/v2 imports,
  old draft migration, new descriptor validation including pending state,
  saved result consistency/invalidation, no silent remapping on topology
  mismatch. Validate before replacing current draft/import. Recompute or
  discard stale diagnostics. IndexedDB storage version need not change if
  object store is unchanged.
- 8F.7: synthetic and same-photo verification as in implementation plan;
  retain held-out set and avoid fitting anchor locations to residuals.

## 6. Measured bounded checks

Executed repository geometry and EarClip JavaScript directly, no browser.
For each local object type 0..9 sampled drawn=0..127, total=128, bank=0,
variation=0, sidePos=50, hidden=false. For each filled polygon passed
[u,v,0] to the unmodified EarClip triangulate. Source order maintained.
Counts include all repeated variants, not unique shapes.

| Type | Primitives | Filled | Lines / unfilled | Failed fills |
| --- | ---: | ---: | ---: | ---: |
| 0 | 325 | 320 | 5 | 1 |
| 1 | 1024 | 896 | 128 | 0 |
| 2 | 768 | 640 | 128 | 0 |
| 3 | 512 | 128 | 384 | 0 |
| 4 | 1962 | 1364 | 598 | 0 |
| 5 | 597 | 128 | 469 | 0 |
| 6 | 512 | 512 | 0 | 0 |
| 7 | 1038 | 1038 | 0 | 0 |
| 8 | 1304 | 1248 | 56 | 0 |
| 9 | 1304 | 1248 | 56 | 0 |

The type-0, drawn-0, primitive-0 fill returned self-intersection.
A rejection is not proof that the original Canvas fill was wrong. The
isolated viewer must handle it explicitly rather than claim a surface.

Using the existing 13-point Soundly experiment's captured numeric model
(bank 0 type 8, N=128, single row, size 1, variation 0, lateral position
55.5 m, bank 1 empty), generated Height=0 banks in these variants:
physical Globe, Canvas Direct vacuum Globe, synthetic effective-radius
Globe (4R/3, geometry test only), physical Flat. All four had 128 placed
objects, 1558 primitives and 254 soundly-road quads. Exact equality of
ordered primitive type, mode, vertex count and current metadata held against
physical Globe. Maximum fourth-point distance from the plane through
first three road vertices respectively 1.51e-10, 8.59e-9, 1.71e-8 and
2.63e-15 m; zero above 1 mm in each variant. This is a limited topology/
planarity check, not a general proof for arbitrary layouts, Tensas, bank 1
variants, near-antipodal sequences or renderer/picker parity. The 4R/3
variant is not a calibrated atmosphere. No private photo bytes are stored.

No runtime implementation was made. No browser, Node suite, new triangulator,
picking or new projection tests were run. No external viewer library needed
for selected first design. Next commit should implement bounded 8F.1 only.


## Integrated calibration model viewer — architecture audit

8F.5b.2, audited baseline `53386a66d610670e58d67d007d76b661c7fe7283` on
`built-in-demo`. CI 44646834128 completed successfully. User confirmed
selection UX works and proposed replacing the separate Main Model and
floating Magnifier with an integrated model editor beside the photograph.

This is a source audit and revised implementation plan, not an implemented
UI or a browser/performance qualification.

## Current ownership and dependencies

| Source | Current responsibilities | Target |
| --- | --- | --- |
| ModernPhotoCalibrationEditor.js (1478 lines) | Captured scene, original photograph, rows/activePair/pending/editing/Undo, fit worker, residuals, draft v2 and portable v1–v3; also Main Model raster, picking, object masks, preview and floating-viewer lifecycle | Keep calibration state and image-side controller. Supply read-only model scene contracts and explicit selection/authoring commands to viewer. |
| ModernLandmarkViewer.js (1005 lines) | Isolated object viewer, optical crop and physical Free View, stable authored picking, local draft/confirmed point, committed marker rendering/selection, floating window geometry and session restoration | Extract host-independent model viewport lifecycle; mount inline in calibration grid. No independent observation store. |
| CurvatureCanvasDirectPreview.js | Paint effective-radius scene, source-pixel capture, owner/identity passes and vector paintCrop | Reuse painter and capture. No second optics implementation. |
| CurvatureModern.html / ModernApp.css | Photo and Main Model grid plus separate modeless dialog; fixed-window location/resize and fixed-size status slots | One inline model viewport for Globe. Keep stable raster layout and responsive stacked layout. |
| test_modern_smoke.py | Manual and full-scene picking, isolated object selection, floating-window move/resize, crop, Free View, fit, draft/portable | Preserve semantic coverage; replace obsolete window/canvas assumptions after routing changes. |

### Main Model is not just an image

`renderModel` (around 771–842) generates modelRaster, cropSource,
package identity pass, exact owner pass, approximate painter-visible
vertex index, and material marker projector. `openRegion` (around
891–905) uses ownerSpans and packages to choose a physical pivot.
`chooseModel`, `choosePhoto`, `savePair` (1011–1027) implement both
creation orders and legacy fast vertex pairing. `paintBest`,
`drawFitPreview`, `receiveFit` and worker completion (1382 onward)
manage the read-only fitted pose; completed fit automatically switches
to Best Camera. Do not remove these dependencies until their replacement
exists. In particular do not discard the exact owner pass before
replacing its pivot/inspection role. The approximate vertex index and
object mask have separate uses; remove only after parity tests.

### Magnifier is not yet a general optical navigation viewport

`openCrop` takes a fixed, validated source rectangle and paint/build
callbacks. `paintCrop` already supports the entire source raster
region and directly replays vector paths under a source-to-target CTM.
However wheel and drag in Scene View currently enter Free View; they
do not zoom/pan the optical image. `regionGeometry` requires an
owner and physical pivot from a visible owner seed. It transforms
all authored primitives across both banks into a local physical frame,
with 100000 primitive / 1000000 vertex budgets. An empty/sky crop has
no build callback; at present this also prevents optical capture/picking.
Separate optical navigation/capture from availability of a physical orbit
pivot. Keep explicit failure if physical geometry cannot be resolved;
never invent a calibration anchor for a pivot. Use selected visible
owner/point when appropriate, otherwise deterministic visible seed
near view center; no Free View if no valid pivot.

`regionCamera` holds a crop-dependent physical origin/focal scale.
Do not use virtual-radius points as physical coordinates, or convert
viewport pixels into saved photo pixels. Optical zoom/pan only transforms
the displayed source raster; it is not a change of FocalLengthField,
camera pose, Earth radius or atmosphere. Free View is geometric inspection
only. Use original source dimensions for capture and projector, not
current CSS or backing canvas dimensions.

## Target UI and invariants

- Photograph at left, one model viewport at right; at narrow widths
  stack vertically. Default Initial Camera Scene View, full captured
  optical frame. Navigate selects numbered correspondences, wheel zooms
  about cursor, drag pans; explicit Free View enters physical orbit.
  Reset View returns to full initial optical frame, not a camera reset.
  Retain optional rectangle zoom within the same viewport, not a popup.
- Initial and Best are two optical sources in the same viewport. Best
  is read-only for model authoring, but supports navigation and selection.
  Keep automatic Best on fit completion and return to Initial. No change
  to captured scene. Free View is explicit and based on Initial physical
  authoring; when going to Best, retain the initial local view separately
  rather than reusing an initial capture with the fitted pose.
- One activePair, one correspondence collection, one pending pair flow.
  Existing marker colors/numbers, hover, hidden statuses, overlap cycling,
  Fit/Validation, original-photo residuals, cancellation and Undo survive.
  Navigation and selection must not mutate rows, alter fit or cancel worker.
- Maintain stable viewport sizing independent of status text. Host
  lifecycle must not rely on dialog.open/show/close, fixed positioning,
  title dragging or global dialog key suppression in the inline path.
  Keep focus-scoped shortcuts (Tab for candidates only when appropriate;
  no accidental Delete/Undo while typing; Escape semantics explicit).
- Preserve fast legacy Vertex pairing (one direct click when unambiguous,
  explicit choice when ambiguous), legacy bN:pN:vN identity and manual
  fallback during migration. New Edge/Surface use explicit confirmation
  in 8F.5c; do not silently commit local picks. No Flat material authoring:
  retain existing Flat legacy read/vertex behavior during rollout rather
  than broadening new real-photo support. Do not change other Scene,
  Compare or legacy renderer screens.
- Keep object/span inspection capability; exact owner picking and physical
  pivot choice are useful, but separate floating isolated viewer is not
  required in the target Globe layout. Do not retire old object UI before
  covering equivalent inspection or an intentional documented fallback.
- Preserve photo raster original dimensions, numerical fit, worker
  contract, resolver, canonical anchor schemas and portable v1/v2/v3.
  No format bump for portable UI-only changes. Captured scene refresh
  still explicitly invalidates fit; pure viewport redraw never calls
  renderModel's current unconditional invalidateFit path.
- UI persistence is separate from portable data. Old IndexedDB draft v1/v2
  and localStorage curvature-calibration-magnifier-v1 currently bind
  session to id and serialized cropSource. Read old draft and migrate
  valid modelView/crop/local state to inline viewport; if unresolvable,
  fall back to full Initial view without discarding rows, photo or fit.
  Verify topology before restoring local points; no window rect migration
  needed. Persist view/source mode separately from worker/observations;
  avoid serializing embedded photo data on every hover or render.
- Performance: current Main Model runs ordinary/identity/exact-owner
  passes and projects all vertices; Magnifier replays vector paint on
  hover and builds indexed physical mesh. Do not retain both costly
  pipelines indefinitely. Reuse source capture/geometry while only
  viewport transform changes; measure real Soundly before removing
  fallback. Consider separate marker overlay or cached paint for hover
  if profiling shows a need. No unmeasured speed-up claims.

## Implementation sequence and gates

| Stage | Scope |
| --- | --- |
| 8F.5b.3a | Host-neutral viewport contract and optical navigation. Inline-capable lifecycle without changing currently shipping host. Full-frame and cropped source transform, anchored wheel zoom, pan, rectangle/reset; explicit Free View transition and pivot failure. Source/capture and physical geometry independence tests. |
| 8F.5b.3b | Mount one inline Globe viewport beside photo. Route initial and fitted camera source through it, preserve read-only Best and fit completion behavior; stable layout and selection including hidden/out-of-crop markers. Keep temporary legacy fallback route until migration gates pass. |
| 8F.5b.3c | Selected physical point orbit pivot; manual Soundly navigation gate. |
| 8F.5b.4a | Migrate fast vertex, manual fallback, owner/span inspection and draft/viewport session restoration. Test existing v1/v2/v3, old crop sessions, hidden workspace, reset/import/photo replacement, source changes and active fit. Keep Flat legacy route as compatibility boundary. |
| 8F.5b.4b | Remove superseded Globe Main Model event handlers, duplicate raster/index/hit/marker paths and obsolete window chrome/storage after parity. Rework browser tests from window position to inline viewport semantics. Measure Soundly; no alpha release with two visible model editors. |
| 8F.5c | Explicit Use in calibration for confirmed material point in inline model viewer; both creation orders, pending state, stable ID and no duplicate commit. |
| 8F.5d | Transactional Edit selected point (Vertex/Edge/Surface conversion), Apply/Cancel/Undo, original photo/ID/role/weight preserved. Local edit leaves fit valid; commit cancels worker and invalidates stale fit. |
| 8F.5e | Full browser and real interaction qualification, including non-Soundly layout, compatibility and numerical parity. Continue existing 8F.6/7 gates. |

Acceptance before 8F.5c: default full optical view, optical zoom/pan do
not enter Free View, explicit Free View and Reset, no modal/floating
window in normal Globe workflow, both optical source poses rendered
correctly, existing 13-point Soundly calibration unchanged (rows and fit),
click selection on photograph/table/model, hidden-marker identity,
fast Vertex pairing, migration without data loss and stable raster
across wheel increments and status changes. All current CI suites and
manual check of actual UI; document any gaps. No new authoring or editing
UI yet.

## Audit limitations

Static inspection of source and existing tests plus CI status. No local
browser or performance benchmark was executed. The precise inline layout,
gesture modifiers and pivot behavior are proposed defaults, to be validated
in implementation. The old isolated object and Flat fallback retirement
is conditional, not a promise to delete compatibility paths.
