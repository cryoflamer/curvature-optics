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

# 8F — 3D Landmark Editor

Status: 8F.0–8F.3d.2 implemented; Globe optical picking reported working by the user and CI passed. 8F.4.0 architecture approved; 8F.4a structural anchor module and 8F.4b physical resolver and 8F.4c optical projection and 8F.4d.1 numerical integration and 8F.4d.2 persistence and 8F.5a correspondence markers implemented; next 8F.5b. See [architecture audit](landmark-editor-audit.md) for previous contracts and bounded checks. Tracking: [#7](https://github.com/cryoflamer/curvature-optics/issues/7), related to [#6](https://github.com/cryoflamer/curvature-optics/issues/6).
Priority: begin before robust loss and multistart. Existing stage identifiers
remain unchanged. This is an authoring improvement, not a new estimator.

## Motivation and baseline

The current editor restricts object correspondences to authored vertices.
A recognizable photographic feature need not coincide with one of those
vertices; snapping to a nearby one may introduce systematic error. This is a
hypothesis to test, not an established explanation for all residuals.

Headless research used repository commit `d31e8c3c3f2bc16390913f4d1763454dc6bdeb6c`,
the manually annotated Soundly photograph (1176 × 791 original pixels, 13
vertex correspondences, Globe/Vacuum/Canvas Direct, seven free camera
parameters). All-point RMS was reproduced exactly: 21.97306453192998 px.
North = -3098.88 m, East = -67.17 m, Height = 59.35 m, focal = 2421.39 mm
(virtual sensor convention). With North fixed at its initial 0.027 m, RMS was
22.75 px, Height 43.38 m and focal 1958.14 mm. Five starts found essentially
the same local solution; all had stalled termination, not certified convergence.
Leave-one-out completed for all 13 points; #7 and #13 had held-out errors
76.76 and 79.18 px. Leave-two-out completed all 78 pairs (77 stalled, one
iteration limit); excluding #11/#13 gave fit RMS 10.07 px and validation RMS
61.47 px. The scaled Jacobian at the all-point solution had rank 7 and
condition number 5686; its weakest mode couples longitudinal position, height
and focal length. These results show sensitivity, not proof of wrong matches.
The test harness loaded the repository JS modules; in the pair sweep it cached
unchanged authored geometry with exact parity checked on baseline and one
exclusion; inactive dependencies were guarded. No source photo bytes or
personal experiment file are added here.

## Target workflow

1. In Magnifier mode drag a rectangle around any area of the main model
   scene. No preliminary object or span selection is required.
2. Open a movable, modeless 3D Scene Magnifier. Initially re-render the
   selected region in the exact original optical view, at higher sampling
   scale, with surrounding geometry and normal colors. Keep photo access.
   Orbit, zoom and pan independently; Reset View restores the initial crop.
3. Pick a vertex, an arbitrary point on an edge, or an arbitrary point on a
   surface of any eligible authored owner visible in the magnifier. Reveal
   owner/primitive identity when needed; preview and confirm the marker;
   allow cancel and later editing.
4. Project the fixed geometric anchor back onto the main scene via the
   existing physical landmark projection; pair it with an original-photo pixel.
5. Edit an existing anchor without discarding the photo pixel, weight or
   Fit/Validation role. Invalidate stale fit results and support Undo.

Scene View and Free View are distinct: Scene View uses the same optical
renderer as the main calibration preview, with only the viewport/framing
changed; Free View is an independent geometric inspection camera without
atmospheric refraction. Both use real authored geometry and the same
underlying owner descriptors. Final projection respects the selected physical
model and optical method. Do not claim accurate occlusion where the current
renderer/projector cannot certify it.

The isolated object viewer and precise owner selection were useful MVPs,
but user testing showed that a long road span viewed alone is difficult to
recognize, even with correct owner identity. The rectangular magnifier
supersedes mandatory object isolation as the primary workflow. Retain
the existing object/span identities and legacy vertex path; do not add
Soundly-specific station/neighbor controls. The generic rectangular region
is the user-facing selection, not an anchor or a permanent geometry crop.

## Implementation stages

### 8F.0 — Architecture and contract audit
Audit GeometryEngine local and placed geometry, object-bank/placed-instance
identity, primitive topology, triangulation, existing vertex picking, physical
placement and CameraLandmarkProjection/CameraPhysicalFit contracts. Identify
how bridge-road spans joining adjacent objects are owned and displayed.
Define stable identity and topology validation, local-to-world mapping, and
the view/picking contract before selecting the viewer technology. Distinguish
actual selectable surfaces from wire-only or decorative primitives. Decide
whether connected spans require a separate anchor identity; do not silently
attach a span to the wrong support. Document limitations and test fixtures.

### 8F.1 — Scene object selection
Select and highlight an individual placed instance, show bank/type/index and
distance; handle overlaps, hidden objects and cancellation. Preserve existing
fast vertex-picking workflow and scene behavior. Prefer explicit ambiguity
handling rather than silently selecting an obscured instance.

### 8F.2 — Isolated 3D viewer
Use the same authored geometry as the main renderer, not a duplicated model.
Provide orbit, zoom, pan, reset, standard views, orthographic/perspective and
wireframe display. Keep viewer state separate from physical camera, scene
physics and calibration result. Support reopening a selected object.

### 8F.2a — Precise object and span selection
Distinguish actual object owners from individual span owners (endpoint pair,
role and side). Extend the Canvas Direct ownership pass while preserving
painter order, terrain masking and legacy vertex selection. Highlight the
specific selected owner; provide manual owner/ambiguity fallback. A clicked
road span must open that span, not a package with the span hidden. Adjacent
supports and spans are optional context; no invented thickness. Test both
Soundly road sides, overlapping owners, support selection and unchanged fit.

### 8F.2b — Modeless movable magnifier window
Replace modal behavior with a floating nonblocking inspector. Drag title
bar, resize, clamp to viewport on open/resize, remember window position and
size as UI preferences (not portable experiment data). Keep photo and scene
interactive. Scope keyboard and pointer events to focused controls, release
capture on cancellation, close on workspace exit or invalid scene replacement.
This stage may use the existing object inspector content until 8F.2c is
implemented. Retain the window infrastructure for rectangular selections.
Navigation must not change correspondence state or cancel an active fit.
Test dragging, resizing, reopening and photo interaction while open.

### 8F.2c — Scene Magnifier: rectangle and exact initial view
Add an explicit Magnifier mode to Photo Calibration. Drag a rectangle in the
main model viewport; show the selection while dragging and cancel safely.
Map the rectangle from CSS/input coordinates through canvas backing pixels
and existing model pan/zoom to the original projection raster. Normalize
reverse drags, clip to valid image bounds, reject tiny/empty rectangles.
Do not require a selected owner, visible vertex, or even an object hit.
Open/update the modeless window with the selected region as its initial
Scene View. Re-render actual geometry at the magnified scale with the same
displayed physical camera (including roll), optical method, Earth model,
atmosphere, painter ordering, horizon mask and styling as the original view.
Use an off-axis projection/viewport transform equivalent to crop and uniform
scale, not a translated camera, changed focal parameter, or enlarged bitmap.
Preserve aspect ratio; letterbox as needed rather than stretch the image.
Retain all surrounding geometry intersecting the crop, including multiple
owners, both banks and partially intersecting primitives. No Soundly-specific
rules, station windows, or automatic isolation of the initially clicked owner.
Keep the existing owner identities available for later picking and optional
hover feedback; do not tint the initial scene by default.
Audit Canvas Direct projection, clipping, guides, mask, and stroke scaling
before implementation; a crop transform must not cause a different physical
camera or atmospheric computation. Test projected coordinates against the
original affine crop transform, occlusion/painter parity within tolerances,
Globe/Flat, nonzero roll, atmosphere variants, zoom/pan, resizing, and mixed
object types. Explicitly report renderer limitations; do not claim physical
depth or optical accuracy beyond the main renderer's own contract.

### 8F.2d — Independent orbit of the local scene and Reset View
Enable Free View from the magnified region with an independent local 3D
camera, orbit, zoom, pan and standard views. Choose a deterministic pivot
near the visible geometry of the rectangle (review robust depth/owner
selection rather than assuming a bridge station or a single object);
provide explicit handling of empty regions or ambiguous depth. Start from
the scene-relative direction and roll as closely as geometrically possible.
Use the actual authored physical geometry in a numerically stable local
frame; keep identities and original primitive indices. The screen rectangle
is a framing request, not a permanent 3D clipping boundary. Neighboring
geometry must become available when rotating, panning or zooming out.
Use generic spatial/visibility bounds with documented resource limits, not
type-specific adjacency or an arbitrary fixed set of selected owners.
Free View is a geometric inspection view, without atmospheric ray bending;
do not imply exact pixel parity with Scene View after rotation. Provide
Reset View / Scene View to restore the original saved region, physical
camera, optical settings, magnification and aspect-preserving framing
exactly (recomputed for current window size). Preserve the saved initial
view when navigating freely; a new rectangle establishes a new baseline.
Test multi-object regions, near/far overlap, pivot and frame stability,
scene reset after orbit/zoom/pan/resize, non-Soundly scene types, and no
mutation of experiment state. Require user verification on Soundly and
at least one other scene type before 8F.3.

### 8F.2e — Orbit sensitivity (implemented)
User testing on Soundly requested slower rotation. Use CSS-pixel deltas,
default 25% of previous coefficient, adjustable 5–100% with UI persistence
and a separate sensitivity reset. Verify angle scaling and camera isolation.

### 8F.3 — Local picking
Pick any eligible owner in the magnified region, independent of the initial
rectangle. In Free View use ray intersection with actual triangles; in
Scene View resolve against the actual optical projection (not an uncorrected
straight world ray). Audit this mode-specific inverse mapping before
implementation and reject ambiguous/unsupported hits explicitly. Nearest visible
surface, edge and vertex modes, hover preview, fixed marker, snapping
(including edge midpoint if useful) and local metric-coordinate readout.
Distinguish a click from orbit drag; allow precise adjustment and cancel.
Reject invalid or degenerate geometry; do not invent filled surfaces for
wire-only primitives.

#### 8F.3a — Mathematical picking core (implemented)
Pure geometry helpers over physical region items: indexed planar
triangulation, original vertex and perimeter/line edge indices, camera
unprojection, ray/triangle intersection, barycentric weights, perspective-
correct edge parameters including near clipping, snapped-point depth
filtering and coplanar candidates. Reuse EarClip with original index carried
as the third component; reject nonplanarity, self-crossings and backtracking.
Report rejected fills and geometric-only visibility; no UI, stored anchors
or optical inverse yet. Conservative tolerances documented in source.
#### 8F.3b — Free View picking UI (implemented)
Connect the core to the existing magnifier; distinguish click from orbit
drag, choose Vertex/Edge/Surface, surface hover and explicit ambiguous
candidates. Reconcile the geometric depth order with displayed painter
order, including invalid filled primitives and wireframe. Cache topology
per region, profile pointer queries and bound work; no silent selection
of an occluded feature. Stage candidate separately from correspondences.
#### 8F.3c — Marker, snapping and precise adjustment (implemented)
Persistent local marker across navigation, metric coordinates, midpoint
and endpoint/boundary snaps, precise adjustment, explicit confirm/cancel.
Snap vertex uses true metric distance to an edge endpoint or any original
vertex of the selected polygon, not maximum barycentric weight.
Keep original indices and weights; no internal triangulation edge as
authored edge. No committed calibration data until 8F.5.
#### 8F.3c.1 — Magnifier session persistence (implemented)
Restore the open crop and local view/selection after reload, bound to the
captured calibration draft and exact crop source. Validate recovered points
against regenerated physical geometry. Keep window rect and orbit sensitivity
as existing UI preferences. Clear on explicit close or experiment replacement.
No portable experiment schema change.
#### 8F.3d — Scene View optical picking
Audit inverse mapping against the actual Canvas Direct projection, including
effective-radius Globe and signed nonlinear Flat embedding. Resolve material
coordinates, not interpolated screen pixels. Reject unresolved or ambiguous
optical hits and verify projection round trips. Do not apply Free View's
straight ray to refracted optical pixels.

#### 8F.3d.1 — Renderer capture and material inverse (implemented)
Capture the actual optical camera-space vertices and clipped painter paths,
including the tangent mask, from Canvas Direct. Use physical topology and
perspective-correct weights; verify Flat continuous embedding within 0.1 source
pixel. Reject unresolved chord disagreement. Per-primitive inverse only.
#### 8F.3d.2 — Optical picking UI and visibility
Real-photo landmark authoring uses Globe only (user scope decision). Resolve
candidates with actual painter order, horizon masks and strokes, not a depth
oracle. Expose optical markers and reuse local editing and session persistence.
Flat nonlinear refinement and optical authoring UI are out of scope; existing
Flat forward/model comparison and inverse diagnostic core remain unchanged.
No fit or correspondence changes.

### 8F.4.0 — Approved material-anchor and correspondence architecture

The Globe optical picking baseline (`d10fefb8`) passed CI run
[44634760850](https://github.com/cryoflamer/curvature-optics/actions/runs/44634760850)
and was reported working by the user. The following plan is approved;
implementation beyond local picking has not yet started.

#### Invariants

- One canonical correspondence collection owned by Photo Calibration; the
  table, Photograph, Main Model, Scene View and Free View are synchronized
  representations, not independent stores.
- A pair has a stable ID, original-photo pixel, material anchor, weight and
  Fit/Validation role. Editing either side preserves the other side and
  all unrelated fields. Viewer navigation and local draft edits do not
  change observations or invalidate a fit.
- Anchors are camera-independent: stable authored owner/primitive identity,
  original vertex indices, topology guard and material weights. Never use
  raster coordinates, effective-radius XYZ, local viewer order or transient
  camera-space positions as persistent identity.
- Vertex, Edge and Surface are first-class material anchors. Edge uses
  original endpoints and a bounded parameter; Surface uses an authored
  triangle and normalized nonnegative barycentric weights. Exact serialized
  schema is to be chosen in 8F.4a after auditing existing contracts.
- Real-photo anchor authoring and calibration target Globe and supported
  Globe optics. Do not extend Flat optical inverse authoring. Preserve
  existing Flat comparison/forward functionality and legacy readable data.
- Preserve the existing fast vertex workflow, camera-only objective,
  estimator, original-pixel residual convention and Undo semantics.

#### Interaction contract

**New pair:** choose a photo point then a material point in Magnifier, or
reverse that order. Navigate/orbit and local Confirm point remain inspection
actions. Explicit Use in calibration submits a confirmed anchor to the same
pending-pair mechanism as the existing vertex workflow. If both sides are
available, create exactly one pair; otherwise stage the missing-side state.
Keep Magnifier open. Never create a pair merely by clicking or confirming
a local candidate. Existing vertex shortcuts and manual controls remain.

**Existing pair:** render existing observations in both magnifier views,
with stable pair numbering/colors and active selection. Selecting an
existing marker or pair row synchronizes all representations. Enter an
explicit edit transaction for its model anchor, initialized from the
committed anchor. Support adjustment, snapping or complete re-picking,
including a change of anchor kind. Apply atomically replaces only the
model anchor, preserving pair ID, photo pixel, weight and role. Cancel
discards tentative changes and retains the committed observation and fit.
A committed change participates in Undo, cancels active fit and invalidates
stale results. Do not confuse selecting a pair with beginning an edit.
Reuse the existing photo-side editing workflow.

Visibility: use actual optical painter coverage in Scene View and existing
geometric/painter reconciliation in Free View; suppress hidden or unresolved
markers and distinguish out-of-crop points. Never silently remap an invalid
anchor. Keep selected pair identity even when its marker is hidden; provide
explicit status. Existing candidate ambiguity controls remain available.

### 8F.4 — Stable anchors and physical projection

#### 8F.4a — Canonical material anchor representation (implemented)

Pure module `src/calibration/CameraMaterialAnchor.js`; not loaded by the UI,
projector or worker yet. Existing runtime observations and schemas stay
unchanged. New logical landmark shape (not yet a portable schema):

```js
{ id: "pair-7", anchor: {
  kind: "surface",
  owner: {kind:"object", bank:0, objectType:8, stationIndex:2,
          column:0, drawn:2, total:5},
  primitive: 4,
  signature: "bank-v1:sha256:<64 lowercase hex digits>",
  indices: [2,5,8],
  weights: [0.2,0.3,0.5]
}}
```

The outer observation kind agrees with anchor.kind. All kinds have the same
index/weight representation: one index/weight 1 for Vertex, two for Edge
(the second weight is t after sorting), three for Surface. Retain original
authored indices; sort indices together with their weights, validate finite
weights in [0,1] with absolute sum tolerance 1e-9, normalize and assign the
floating remainder to the largest term. Boundary weights do not implicitly
change kind. Canonical descriptor keys are exact, exclude observation IDs,
and do not claim cross-primitive geometric equivalence. Use an explicit
physical tolerance for coincidence checks later.

Owner values follow the actual GeometryEngine metadata, including drawn,
total and column; span owners retain ordered adjacent same-column endpoints,
role and side, with primitive ordinal 0. The signature is a versioned token
for a bank-level SHA-256 digest; 8F.4b must define and implement deterministic
synchronous digest generation from the canonical bank/layout/authoring
topology contract, without camera or hypothesis curvature. Structural
validation is not a proof that an index, edge, triangle or digest matches
the scene. 8F.4b must reject stale, ambiguous, truncated, degenerate and
non-authored topology and preserve original connectivity when canonical
index sorting differs from the viewer's winding.

Legacy vertex adapter preserves opaque headless landmark.id and the old
bank-global primitive/vertex indices; legacyVertexKey provides the portable
bN:pN:vN rule. No invented signature or automatic upgrade without actual
physical resolution. A new landmark may retain the legacy ID as an opaque
pair ID after explicit upgrade; anchor identity is independent. The
fromPick adapter strips screen/depth/local XYZ and transient enumeration
and requires an explicitly supplied ID and signature. New strict shape
validation rejects unknown fields; existing legacy runtime APIs are
unchanged. Portable v3, draft and worker integration remain 8F.4d.

Source audit: editor pair/upsert and importExperiment currently use vertex
IDs both as pair keys and mesh lookups; legacy portable versions 1/2
validate vertex observations, and import verifies bN:pN:vN. Draft v1
reconstructs vertex rows. CameraPhysicalFit accepts metric/vertex and
dispatches by outer kind; headless vertex IDs may be opaque. Its result
points use landmark.id; horizontal scaling currently uses authored vertex
ranges. CameraLandmarkProjection builds method-specific banks and uses a
shared fromWorld projection. GeometryEngine already emits owner/ordinal
metadata and suppresses new owners for truncated sequences. Worker loads
the existing projection/fit modules. These callers are deliberately
unchanged in this commit.


#### 8F.4b — Physical resolver (implemented)

`CameraMaterialAnchorResolver.create(model)` snapshots the ten layout
fields and Globe radius, sets Height=0, lazily generates banks via the
shared physical authoring engine, and returns camera-independent ENU XYZ
in metres (reference surface origin). `resolve(anchor)` returns validated
anchor, bank/global primitive index and physical point; `upgradeLegacy`
uses the actual legacy bank index, retaining the original observation ID;
`resolveLandmark` handles both representations. `fromPick` checks the
transient index against the resolved identity before discarding it.
No viewer XYZ or pixel participates in resolution.

Signature encoding v1: SHA-256 of ASCII JSON array
["bank-v1", bank, ordered [layoutField,value] pairs, ordered
[identity, quantized vertices] pairs]. Identity is owner, local ordinal,
type, effective mode and original vertex count; quantized vertices are
rounded integer micrometres generated at Height=0, curvature=0 and fixed
reference radius 6371000 m (encoding only, not Flat calibration). Exact
layout fields are bound; no camera, actual Earth radius, atmosphere or
other-bank settings are bound. Submicrometre neutral-coordinate changes
may share a signature by design. Actual physical geometry is independently
generated and its ordered structural identities must agree with the
neutral bank; truncated, ambiguous and malformed banks fail explicitly.
Digest is synchronous pure JS; no async Web Crypto in a numerical path.

Shared EarClip indexed surface and authored edge adapter retains original
indices, rejects nonplanar/degenerate/wire-only surfaces, and uses the
same tolerances as Magnifier. Compare sorted tuples, not triangle winding.
World point uses origin-relative weighted interpolation. The physical
resolver is authoritative; when wiring viewer/optical variants, a
numerically different triangulation must not silently remap an anchor.
Actual optical projection and fit integration remain later stages.

#### 8F.4c — Globe projection (implemented)

Canonical vertex/edge/surface use the existing point projection contract.
The physical resolver verifies the signature and original connectivity,
and binds the method-specific bank by ordered identity, ordinal, type,
mode and vertex count. Interpolate the same weights on that target bank,
not screen pixels or a new triangulation. Reject degenerate target
segments or triangles. Accurate banks already subtract observer height;
Canvas Direct banks use virtual effective radius at Height=0. Legacy
vertices retain their original path and numerical behavior. Invalid
material anchors return invalid_anchor, no pixel. Existing terrain,
raster and ray statuses remain; painter mesh occlusion remains not-tested.
New anchor projection is Globe-only. Fit, portable/draft and authoring UI
are unchanged. In 8F.4d reuse physical resolver caches across camera
evaluations to avoid repeated full-bank signature generation.

#### 8F.4d.1 — Numerical calibration integration (implemented)

CameraPhysicalFit accepts mixed metric, legacy vertex and canonical material
observations. Normalize canonical descriptors before evaluation; keep the
observation ID, weight and original photo pixel unchanged. All supplied rows
remain in the objective. The UI's existing fitRows boundary continues to
exclude Validation rows only at the caller; residualRows and the projector's
kind dispatch work with material rows as well.

A per-fit opaque projection context owns the physical resolver and at most
one target bank binding per bank, keyed by method, radius and authored
Height. It is matched to the captured physical hypothesis/layout and
cannot be reused after a layout/radius change. Reuse physical signatures
through fit and diagnose; rebuild target bindings when optics or height
requires it. Material ranges use physical points at the initial observer
frame and feed the existing median horizontal scale, with overrides
unchanged. Invalid anchors cannot supply a scale estimate and still
invalidate the entire objective; do not drop their residuals. No change
to QR, Jacobian, objective, locks or convergence policy.

Five focused headless regressions passed (mixed known pose, scale,
cache parity, invalid topology, Fit/Validation residuals). Full Node and
browser CI pending. Previous CI passed Node and architecture, but the
known Scene workspace restoration timeout recurred in Chromium.
8F.4d.2 will enable the editor's read paths and versioned persistence,
including stale result validation before portable import/draft restore.

#### 8F.4d.2 — Persistence and editor read paths (implemented)

Portable v3 emitted only with canonical anchors; vertex-only remains v2.
Draft payload v2 reads v1 and uses the same normalization and physical
topology guard. Material result binding is a canonical JSON equality guard,
not an authenticity certificate. Model markers are independent of legacy
quick-pick candidates. Photo-side edit, weight, role and residuals remain
available; material authoring and model-side editing deferred to 8F.5.
Visibility is the existing terrain projector contract until painter
markers are qualified. No silent remapping. Four new and sixteen existing
headless editor tests passed; v3 import/worker/draft browser scenario
added for CI.

| Commit | Scope and acceptance gate |
| --- | --- |
| 8F.4a | Audit current vertex IDs, observation/draft/portable and worker contracts; define one canonical material-anchor representation and strict validation with legacy vertex adapters. Test valid and malformed kinds, weights, indices and identity; no new UI or schema rollout yet. |
| 8F.4b | Resolve anchors against shared authored physical topology; verify identity/topology and reject unresolved geometry. Test independent XYZ for vertices, edges and surfaces, placement including bridge spans, invalid topology, old vertex parity, and independence from viewer/camera. |
| 8F.4c | Project anchors with supported Globe optics and explicit projection status. Verify physical/effective geometry correspondence and material interpolation rather than assuming transforms commute. Test independent projection and round trips across camera changes, visibility and invalid/out-of-frame cases; preserve vertex numerical parity. |
| 8F.4d.1 | Integrate canonical anchors into the headless fit, diagnose, worker, original-pixel residual dispatch and physical range scales. Reuse one per-fit physical resolver and bounded method-specific target cache. Mixed synthetic known pose, legacy parity, invalid anchor and held-out residual tests. |
| 8F.4d.2 | Integrate versioned draft/portable observations, marker and pair read paths, result consistency and validation. Test old imports, round trips, stale/invalid results, roles and topology rejection. No new authoring UI until these contracts work end-to-end. |

### 8F.5 — Calibration integration

| Commit | Scope and acceptance gate |
| --- | --- |
| 8F.5a | Display committed correspondences in both magnifier views using the shared anchor resolver; stable numbering/colors, visibility and crop handling; no editing yet. Test existing vertex and new material marker placement. |
| 8F.5b | Synchronize active pair selection across table, photo, model and both magnifier views; selection itself must not mutate observations or invalidate fit. Test hidden markers and ambiguous selections. |
| 8F.5b.2 | Architecture audit: replace separate Main Model and Magnifier with one integrated Globe model viewport. See [integrated viewer audit](landmark-editor-audit.md#integrated-calibration-model-viewer--architecture-audit). |
| 8F.5b.3a | Host-neutral viewport and optical zoom/pan/reset, explicit physical Free View. |
| 8F.5b.3b | Inline Globe viewport with Initial/Best optical sources and shared selection. |
| 8F.5b.4a | Fast Vertex, owner inspection, fallback and draft/session migration. |
| 8F.5b.4b | Retire duplicated Globe model paths after parity; browser and performance qualification. |
| 8F.5c | Add explicit Use in calibration for a locally confirmed anchor in the integrated model viewport; reuse pending-pair flow in both click orders, prevent duplicate commits, preserve fast vertex workflow. Test creation, cancellation, missing-side states and persistence. |
| 8F.5d | Add transactional edit of existing model anchors, including type conversion and precise adjustment. Apply retains original photo pixel, ID, role and weight; Cancel retains old fit and observation; Undo restores committed changes. Test active-fit cancellation and stale-result invalidation only on committed edits. |
| 8F.5e | End-to-end browser qualification: both creation orders, old/new anchor editing, Apply/Cancel/Undo, cross-view synchronization, reload and exchange, fit/residuals, non-Soundly geometry, and legacy vertex workflow. Resolve UX regressions before real-photo research. |

### 8F.6 — Persistence and compatibility qualification

The schema and persistence implementation is moved forward into 8F.4d so
newly authored pairs are usable immediately. Retain 8F.6 as the final
compatibility audit: v1/v2 imports, legacy vertex IDs, Fit/Validation roles,
worker/result validation, draft and portable round trips, explicit handling
of incompatible topology and no silent remapping. No reference image bytes
in repository fixtures without explicit rights and approval.

Each commit is independently bounded, tested and documented, with CI and
user-visible verification status recorded; split further if required rather
than mixing unrelated changes. 8F.7 remains the real-photo research gate.

### 8F.7 — Qualification and real-photo research
Test synthetic vertex/edge/surface anchors with known camera and independently
computed coordinates, local-to-world transforms and projection parity,
camera/viewer independence, visibility and invalid topology. Add browser
tests for selection, orbit, zoom, picking, edit/cancel/Undo, persistence and
Fit/Validation. Re-annotate Soundly using identifiable features and compare
against the unchanged 13-vertex baseline; keep a predetermined held-out set
and document changes in feature identity. Repeat all-point fit, leave-one-out,
leave-two-out, multiple starts and SVD with the same physical assumptions;
compare residual vectors, validation RMS, pose stability and conditioning.
Report negative results and termination status, not just improved training RMS.

## Principles and non-goals

- Reusable across scene types, not a Soundly-specific tool; no station-based
  neighborhood or mandatory single-owner selection.
- Single source of authored geometry; no independent replica of the object.
- Independent local viewer camera and globally fixed physical anchor.
- No automatic sliding of anchors during camera optimization.
- Arbitrary points on featureless surfaces are not independently identifiable
  in photographs; a point must correspond to a recognizable physical feature.
- Better picking precision does not guarantee better pose conditioning.
  Features spanning distances, heights and lateral positions remain important.
- Do not infer Earth shape or historical atmosphere from training RMS alone.
- Avoid numerical solver changes and unrelated refactoring in this workstream.

## Definition of done

- [ ] Individual object selection and highlighting are reliable in supported scenes.
- [ ] Modeless rectangular magnifier re-renders the same initial optical view
  with independent orbit/pan/zoom and reliable Reset View.
- [ ] Multi-owner context and the generic workflow are verified on Soundly
  and another scene type before local picking.
- [ ] Magnifier navigation leaves the experiment camera unchanged.
- [ ] Vertex, edge and surface anchors are selectable and physically projected.
- [ ] Existing correspondences can be refined without losing photo pixels or roles.
- [ ] Fit, Validation, residuals and stale-result invalidation work for new anchors.
- [ ] Portable JSON and drafts round-trip; older experiments remain readable.
- [ ] Topology changes produce explicit invalid-anchor handling.
- [ ] Geometry, projection, solver and browser regressions pass.
- [ ] Soundly comparison and limitations are documented.

## Roadmap after 8F

Resume 8C.5a (existing SVD diagnostics exposed in UI), 8C.5b (Huber loss if
justified), 8C.5c (automated influence analysis), 8C.6 (multistart/DLT/P3P),
8D (whole-model photo overlay), 8E (acceptance and persistence).
Each 8F stage should be a bounded, independently tested commit referencing #7.
