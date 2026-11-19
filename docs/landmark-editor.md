# 8F — 3D Landmark Editor

Status: 8F.0 completed; 8F.1 next. See [architecture audit](landmark-editor-audit.md) for the selected contracts and bounded checks. Tracking: [#7](https://github.com/cryoflamer/curvature-optics/issues/7), related to [#6](https://github.com/cryoflamer/curvature-optics/issues/6).
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

1. Select a specific placed object on the main scene; highlight it and show
   its identity, type and distance. Resolve occlusion and overlapping objects.
2. Open an isolated 3D viewer of that object's actual authored geometry.
   Orbit, zoom and pan independently of the physical experiment camera.
3. Pick a vertex, an arbitrary point on an edge, or an arbitrary point on a
   surface. Preview and confirm the marker; allow cancel and later editing.
4. Project the fixed geometric anchor back onto the main scene via the
   existing physical landmark projection; pair it with an original-photo pixel.
5. Edit an existing anchor without discarding the photo pixel, weight or
   Fit/Validation role. Invalidate stale fit results and support Undo.

The isolated viewer has no atmospheric refraction, horizon, or Earth-shape
simulation. It is a local geometry editor. Main-scene selection and final
projection must nevertheless respect the selected physical model, optical
method and visibility. Do not claim accurate occlusion where the current
renderer/projector cannot certify it.

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

### 8F.3 — Local picking
Ray intersection with actual triangles in the local viewer; nearest visible
surface, edge and vertex modes, hover preview, fixed marker, snapping
(including edge midpoint if useful) and local metric-coordinate readout.
Distinguish a click from orbit drag; allow precise adjustment and cancel.
Reject invalid or degenerate geometry; do not invent filled surfaces for
wire-only primitives.

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
Create and edit correspondences with the isolated viewer; update model/photo
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

- Reusable across scene types, not a Soundly-specific tool.
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
- [ ] Isolated viewer navigation leaves the experiment camera unchanged.
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
