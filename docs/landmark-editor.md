# 8F — 3D Landmark Editor

Status: 8F.0–8F.2 implemented; 8F.2 user-tested; 8F.2a implemented and user-inspected; 8F.2b modeless window implemented (CI pending); 8F.2c rectangular magnifier implemented (CI pending); 8F.2d Free View and Reset View implemented; 8F.2e sensitivity refinement implemented and user-approved on Soundly; 8F.3a mathematical core implemented (CI passed); 8F.3b Free View picking implemented; 8F.3c local adjustment implemented (CI pending); 8F.3d next. See [architecture audit](landmark-editor-audit.md) for the selected contracts and bounded checks. Tracking: [#7](https://github.com/cryoflamer/curvature-optics/issues/7), related to [#6](https://github.com/cryoflamer/curvature-optics/issues/6).
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
Keep original indices and weights; no internal triangulation edge as
authored edge. No committed calibration data until 8F.5.
#### 8F.3d — Scene View optical picking
Audit inverse mapping against the actual Canvas Direct projection, including
effective-radius Globe and signed nonlinear Flat embedding. Resolve material
coordinates, not interpolated screen pixels. Reject unresolved or ambiguous
optical hits and verify projection round trips. Do not apply Free View's
straight ray to refracted optical pixels.

### 8F.4 — Stable anchors and physical projection
Proposed logical types: Vertex (primitive + vertex), Edge (stable endpoints +
t in [0,1]), Surface (stable triangle vertex identities + barycentric weights
nonnegative and summing to one). Include stable bank/placed-object identity
and topology validation; exact schema is an 8F.0 decision. Resolve anchor
coordinates from authored geometry, not projected pixels. Interpolate within
the same geometric primitive as the selected mesh, then use the existing
physical placement/projection contract; verify consistency rather than
assuming interpolation commutes with every world transform.
Support Globe/Flat and existing supported calibration optics. Handle blocked,
out-of-frame, indeterminate and invalid anchors explicitly. Extend fit and
diagnostic horizontal range scaling to the new anchors. Keep the camera-only
objective and existing numerical methods unchanged.

### 8F.5 — Calibration integration
Create and edit correspondences with the 3D Scene Magnifier; update model/photo
markers, residuals and Fit/Validation groups. Preserve IDs, photo pixels,
weights and roles when editing an anchor. Cancel active fit and invalidate
stale results on committed changes; support existing Undo semantics and
transactional cancel. Viewer-only navigation must not invalidate a fit.
Preserve existing vertex workflow and integrate new kinds into the worker.

### 8F.6 — Persistence and compatibility
Version the portable experiment and draft schemas as needed; preserve v1/v2
imports, legacy vertex IDs and Fit/Validation roles. Round-trip anchors,
validate topology after geometry changes, and report unresolved anchors
rather than silently remapping them. Include worker/result validation and
tests for import/export, restoration and invalid inputs. No reference image
bytes in repository test fixtures without explicit rights and approval.

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
