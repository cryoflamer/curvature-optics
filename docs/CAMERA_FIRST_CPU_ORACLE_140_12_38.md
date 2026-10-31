# #140.12.38 — Camera-first CPU f64 first-ground-contact oracle

## Motivation

The previous GPU-first B pipeline evaluates a target-point shooting field on a finite grid, infers a visibility status from neighboring grid nodes, and adaptively constructs polygons. A stable subpixel shooting angle alone does not certify the topology of this reconstruction. This experiment checks an algorithmically different **forward** question: *starting at a camera pixel, where does its curved ray first touch the Earth, if at all within 30 km?*

This is a **diagnostic**, not a production replacement. Do not claim that the present 2D first-ground-contact mask is a 3D image or a certification of any tower/object pixel. Main renderer, WebGPU and WGSL are untouched.

## Physical method and validation

1. The exact live Compare A `CurvaturePhysicalCamera` and `CurvatureGpuPixelSpaceAudit141233.capture()` furnish the camera axes, image-plane focal distance, window transform and actual backing dimensions. Pixel centers at `(column + 1/2, row + 1/2)` on a 64×64 sampling of this viewport determine 3D world directions, including pan, nick and roll.
2. For each 3D direction, axial symmetry of the Globe/standard-atmosphere model reduces that single ray to a 2D radial meridian plane with launch elevation `atan2(vz, hypot(vx,vy))`. The azimuth is recorded. This reduction is **not** valid for general laterally varying media.
3. `CurvatureRayTracer.trace` integrates each such ray **forward** in CPU f64 (RK4, 250 m outer steps with 8 event substeps and explicit grazing checks). No inverse shooting root, precomputed angle grid, status interpolation, polygon reconstruction, or screen z-buffer is involved.
4. The endpoint is classified as `ground`, `grazing`, or `range`. `range` means *no first ground contact observed by 30 km*; it does **not** certify unobstructed infinite sky, nor absence of a distant return.
5. An **independent vacuum analytic control** solves the straight-line/sphere quadratic with stable near-side root `C / (-B + sqrt(B²-C))`, where `B=(R+h)sin(beta)` and `C=h(2R+h)`. Both the hit/no-hit decision within 30 km and contact-distance error are measured for every vacuum pixel.
6. An **independent step-convergence control** traces 41 identical directions centered on the geometric vacuum horizon with 250 m and 100 m RK4 steps in standard atmosphere. It reports classification differences and contact-distance offsets; only 5 selected paths are sampled for visualization.

**Independence boundary:** no inverse shooting or GPU grid is shared, but it *does reuse* the existing CPU tracer differential equations and RK4 recurrence, so it is not an independent proof of the refractive model's mathematical correctness. The straight-line/sphere vacuum reference is independent of RK4.

## UI

Modern Compare → GPU/CPU diagnostic probe → **Audit camera-first CPU f64 · 64×64 ground-contact · ZIP**. No WebGPU device is required. Requires Compare A = Globe / standard atmosphere, Height > 0 and a fresh physical camera snapshot. Two 64-row passes yield to the browser every four rows. Progress, errors and a full failure JSON are reported by the existing diagnostic UI. The main A/B renderers are not redrawn or modified by the oracle.

## ZIP layout

`curvature-compare-140.12.38-camera-first-cpu-oracle.zip`:

- `camera-first/report.json`: camera snapshot/physics, complete 4096+4096 sample records, analytic reference stats, full 41-direction convergence sweep, five selected 2D trajectories, constraints.
- `camera-first/vacuum-ground-mask.png`, `camera-first/standard-ground-mask.png`: 64×64 sampled ground masks enlarged without interpolation to 512×512 PNG.
- `camera-first/vacuum-vs-standard.png`: difference of finite-range first-ground-hit classification.
- `camera-first/horizon-convergence.png`: 41 samples, coarse and fine classifications with disagreements marked.
- `camera-first/sample-trajectories.png`: five forward standard-atmosphere rays from near the vacuum geometric horizon, tangent-plane Earth curve, **exaggerated/clipped** vertical scale.
- `camera-first/README.txt`: legend and physical limitations.

Mask: turquoise = first ground crossing, amber = tolerance grazing, navy = no ground contact within range (not proof of sky). Vacuum red = analytic/numerical hit disagreement. The comparison mask shows classification changes; it is not a per-pixel 3D-rendering error image.

## Acceptance and next steps

- The sample grid is completely populated (64×64 for both atmospheres) for the same camera and physical sphere. No uncertain or failed sample is quietly treated as a sky pixel.
- Vacuum agrees with the independent analytic first-contact classification away from tangency and shows small contact-distance errors, including low and high camera rays.
- Standard rays converge between the specified RK4 steps away from grazing. Status discrepancies near the finite first-contact boundary remain visible as first-class diagnostics.
- Experimental code does not affect `CurvaturePhysicalSceneOptics`, `CurvatureMainCanvasRenderer`, old shooting or GPU flags.
- No 3D object intersection, multipath certification, actual-frame parity, or GPU implementation is attempted. Later experiments can add mesh intersections and GPU forward tracing only after this ground-only oracle is evaluated.
