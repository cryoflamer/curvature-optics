# Camera calibration from reference observations — deferred research plan

Status: design decision and research backlog, not an implemented optimizer.
The next work is completing the demo infrastructure (7C–7E). Calibration
(8A–8E) follows, then real Causeway calibration and final authoring (9A–9B).
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
