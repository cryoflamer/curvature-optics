# #140.12.33 — Actual-camera pixel-space DS ray-sample audit

## Motivation

The goal is image-space correctness, not the smallest ground-margin error in metres. Previous #140.12.32 measured launch angles and radial contact margins. #140.12.33 maps those **independent GPU-owned shooting angles** and **independent CPU f64 RK4 shooting angles** to the actual physical Compare A camera's **Canvas backing-store pixels**. The same GPU batch also reports an independent CPU f64 2048-node Bouguer root to isolate quadrature error.

This is **not** an actual rendered GPU DS frame or a full-frame CPU/GPU pixel comparison. Current GPU DS diagnostics solve 48 isolated rays, not an image-wide raster field. No sample-row count may be interpreted as the number of wrong image pixels; the module explicitly sets `actualRenderedImageCompared: false` and `fullFramePixelParityEstablished: false`.

## Run

Open `CurvatureModern.html` → Compare → CPU/WebGPU probe → **Audit pixel-space DS shooting · real Compare camera**. Requires standard exponential atmosphere, Globe, real WebGPU, and a rendered Compare A physical camera; the source #140.12.32 radial monotone branch restrictions remain in force.

The audit captures the **live GraphX3DX Camera** (including `SceneSize`, `ScreenSize`, zoom, orientation) and **CurvatureCanvasProjection** window transform (`ScaleX/Y`, `OffsetX/Y`, `ContextScale`) with the real Compare A Canvas backing dimensions. It validates that the graph matches the physical camera model and rejects a changed camera/viewport before reporting. Vertical target rays are projected along the camera's pan azimuth with physical pitch/aim and roll. The projection has its own independent parity tests against `CurvaturePerspectivePreview.project` using 3D world points (including rolled cameras).

The GPU predictor and independent DS secant passes (256 and 512 quadrature nodes) complete **before** the CPU f64 RK4 reference and Bouguer root. The CPU reference never selects GPU angles or changes GPU calculations. This is the same #140.12.32 experiment extended with post-hoc pixel-space reporting, not a second shooting implementation.

JSON automatically downloads as `curvature-compare-140.12.33-pixel-space-audit.json`, or an `-error.json` on failure. Manual Export JSON also works.

## Metrics (per 256/512 mode)

- `inFrameBoth`, `outOfFrameBoth`, `edgeOfFrameMismatch`, `projectionUnavailable`: prevent unseen/outside rays from being included in in-frame shift statistics.
- `maxPixelDisplacementPx`, `meanPixelDisplacementPx`, `rmsPixelDisplacementPx`, `p95PixelDisplacementPx`: distance between **projected GPU DS** and **independently projected CPU f64 RK4** launch directions for **in-frame target samples only**.
- `maxPixelDisplacementFromCpuBouguer2048Px`: additional isolated reference against the independent 2048-node CPU f64 Bouguer shooting root.
- `subHalfPixel`, `overHalfPixel`, `overOnePixel`: 0.5- and 1-backing-pixel displacement thresholds among in-frame paired samples.
- `changedPixelCell`: same target changes `(floor(x), floor(y))` in backing-store sample coordinates. A cell change alone does not prove a visually distinguishable pixel, and no raster object or silhouette is painted.
- `sampledVerticalRowOccupancySymmetricDifference`: difference between the SETS of integer rows occupied by projected point samples. This is **not** a pixel-diff or a full-column silhouette metric.
- `visibilityAgree`, `visibilityMismatch`, `visibilityUncertain`, `visibilityUnresolved`: GPU DS same-angle first-ground-contact classification vs independent CPU f64 RK4 shooting status, only for rays in both viewports. Ground margins within ±1 cm are excluded as `uncertain`, not marked correct or incorrect.
- `stageGpuDispatchToReadbackMs`: preserved per-mode WebGPU timing; total phase timings and DS shader setup cost are separately exported.

Each of the 96 source sample rows retains both reference and GPU projected pixel coordinates, angle values, sampled visibility, and contact margin for inspection. Neither the 0.5 px budget nor matching discrete row occupancy proves visual equivalence.

## Scope and next step

The current 48 rays lie on the camera-aligned meridian and use the limited first-forward monotone radial model. They do not sample arbitrary geometry boundaries, near-tangent turning rays, image pixels, or a 2D horizon contour. Full-frame pixel parity requires a **DS GPU optical field plugged into the experimental painter**, paired with a separately painted CPU f64 scene, with identical camera, target geometry, background, resolution, and image-difference measurement (including a horizon/occlusion ROI). The current results cannot certify that integration or authorize promotion to production.

No `tools/` HTML variant is added. Production shooting, ground visibility/occlusion rules and frame painting remain untouched.

## Validation

`node --test tests/ModernGpu*.test.js tests/ModernBouguerInvariant141227.test.js` and `node --check` for changed JavaScript files. Pixel projection is cross-checked against the real `CurvaturePerspectivePreview.project` calculation at non-zero pan/tilt/roll. Synthetic tests cover subpixel thresholding, integer pixel-cell differences, ambiguous ground contacts, stale graph/canvas rejection, and JSON/UI wiring. These are Node and mock tests: they **cannot compile/execute WGSL on a native GPU**, and numerical GPU behavior must be verified through the automatic browser JSON.
