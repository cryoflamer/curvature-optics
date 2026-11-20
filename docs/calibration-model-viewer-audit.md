# Integrated calibration model viewer — architecture audit

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
