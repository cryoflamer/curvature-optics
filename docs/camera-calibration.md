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
