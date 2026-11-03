# #140.12.39 — Camera-first CPU object/Earth first-hit diagnostic

## Goal

Test the **physical visibility architecture**, not just numerical accuracy of the inverse CPU/GPU target shooter. For each real Compare A camera direction, send a CPU f64 ray **forward** from the observer and find the first contact with Earth or an *authored world-space* filled object polygon. Never use the already refracted/projected polygons, GPU interpolation/status grids, or screen z-depth to define a candidate object hit.

This is an **optional diagnostic** alongside #140.12.38, not a replacement production renderer. It does not execute WebGPU or modify the existing ray solver/Canvas display.

## Important scene-model discovery

Curvature's tower authoring is primarily **outline geometry**: polygons with `mode & 1` but no `mode & 2`, and thin `line` primitives. In one real 2+2 tower test scene, only 4 polygons are genuinely filled, compared with 20 outline-only polygons and 6 lines. Consequently, any physically faithful opaque-triangle ray caster will mostly see foundations, **not** the entire tower silhouette displayed by the Canvas line painter.

For this reason the ZIP contains **two separate classifications**:

1. `kind`: first Earth / *authored opaque filled polygon* / range. The opaque source polygons are triangulated in their original metric 3D coordinates. This is a restricted first-hit physical approximation for opaque planar faces.
2. `proxyKind`: the above **plus** outline-only polygons treated *hypothetically* as opaque planar silhouettes. This visual sensitivity experiment is **not** physical visibility and should not be used as a correctness oracle or to authorize production. Line segments are not inflated into fictitious solid objects.

Opaque/outline polygon triangulation uses the existing `CurvaturePhysicalPolygonFills.planeTriangles` ear-clip helper, **only** for the authored world-space rings. Failed/self-intersecting rings are listed in `summary.mesh.failedTriangulations`. The test does **not** use `CurvaturePhysicalPolygonFills.project()` or the target shooting sampler.

## Method

- Require Compare A Globe, standard atmosphere, positive observer height, and captured physical Canvas camera.
- Construct the original physical metric scene using `CurvatureIndependentComposition.composeOpticalMain(model, true, {physicalWorld:true})`.
- Sample **64×64 directions** across the actual camera backing store with `CurvatureCameraFirstOracle141238.pixelRay`. For each pixel, integrate its observer-centred meridional ray using existing f64 `OpticalRayTracer.trace`, standard atmosphere, 100 m RK4, maximum 30 km, ground-event detection on, `collect:true`.
- Rotate the traced \\(x,z\\) meridional samples into world \\((x\sin\phi,x\cos\phi,z)\\). Filter impossible triangles by their azimuth-plane side and intersect each **piecewise-linear chord** with original 3D triangles via two-sided Möller–Trumbore. Select the **earliest** positive path-length contact, competing with first Earth ground event. Screen-space `z` and painter order play no role.
- Choose one additional **focused 64×64 crop** around the authored object with the largest approximate vacuum-projected footprint currently in the camera. That projection is **only a crop locator**, not the source of physics/visibility. Crop dimensions and offsets are saved under `focusedRoi.bounds`; every cropped-pixel direction is traced from scratch through the atmosphere. The original uncropped 64×64 map is also retained.
- For up to 128 focused (or, if no ROI exists, full-frame) object/proxy-hit pixels and neighbouring pixels, repeat the **same rays** at 50 m. Report classification/source changes and contact-distance deltas. This is a bounded *sampled convergence check*, **not** a complete proof that thin/grazing hits cannot be missed.
- Export the diagnostic maps, the current Compare A CPU Canvas sampled at exactly the same centres (for a **visual comparison only**), and the complete report to one ZIP.

## Export

Use **Audit camera-first CPU f64 · 64×64 objects + Earth · ZIP** in the Compare diagnostics section. File: `curvature-compare-140.12.39-camera-first-objects.zip`.

The ZIP includes `camera-first-objects/report.json`, `first-hit-mask.png`, `object-source-indices.png`, `objects-only.png`, `outline-as-opaque-proxy.png`, `production-cpu-sampled.png` and three focused variants `focused-first-hit-mask.png`, `focused-outline-proxy.png`, `focused-production-cpu-sampled.png` (if an in-view object exists), plus `README.txt`.

Mask legend: orange=object, teal=Earth, amber=grazing Earth, dark blue=no contact within 30 km. Source index map uses **diagnostic false colours** (not object materials). The production sampled image contains guides, lines, fill styles and compositing; **colour mismatch against the semantic mask is not evidence of a physics bug**. No GPU image is re-rendered by this experiment.

## Limits and next decisions

- Shared CPU RK4/atmosphere with #140.12.38; independent **rendering direction** (forward rays) and **visibility architecture**, not independent ODE implementation.
- 100 m integrated path chords can miss thin objects, near-tangent hits or multiple crossings within a step. 50 m agreement for sampled pixels does not certify the rest of the frame.
- No supported physical thickness for 1D `line` strokes or outline-only polygons; the optional proxy is intentionally labelled nonphysical.
- Alpha compositing, textured/transparent objects, line stroke widths, nonlinear/curved authored faces, physically meaningful object volume and multiple scattering are out of scope.
- `range` means **no first contact within 30 km** (not infinite-sky visibility). Objects farther than 30 km cannot be classified.
- Earth and object first-hit distances are compared by **integrated ray path length**, not ordinary screen z or camera distance. Ties at a surface are tolerance-dependent.
- This is a coarse classification comparison against the existing CPU Canvas only, **not** pixel-perfect frame equivalence with its coloured line drawing.

**Decision:** If primary opaque masks miss the tower but the outline proxy finds it, the immediate issue is a missing physical solid representation of outlines in the ray caster—not evidence of wrong GPU RK4. Before replacing the production pipeline, establish which objects are meant to be physically opaque and model their surface/volume consistently.
