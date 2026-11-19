# 8F.0 — Architecture and contract audit

Status: completed (design and bounded headless checks, no production code).
Source baseline: `af6ddd3bbca9879c54aaee7aae45a3ca3775fedd`, branch `built-in-demo`.
Tracking: #7, related to #6. Next: 8F.1.

## Subsequent refinement

The original package-selection/modal/front-view MVP has been implemented and
user-tested. Its usability limitations prompted 8F.2a–c in the current
[implementation plan](landmark-editor.md), which supersedes the original
viewer selection and initial-view defaults below. The anchor and projection
contracts remain unchanged.

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
