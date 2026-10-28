# Compatpatch 119 — Camera-aware Physical ground-guide screen LOD

## Measured cause

The user's `geometry-diagnostics (40).zip` Physical performance profile showed
~433.6 ms median for warm full-grid redraws, versus ~31.0 ms with ground guides
removed. The warm frame spends much more time validating/copying geometry and
projecting tens of thousands of ground segments than in cached optical shooting.
This patch reduces input primitive counts **before** the shared
`CurvatureRenderFrame` snapshot and `CurvatureFrameRenderer` validation.

## Implementation

`CurvatureScreenSpaceGuides119` constructs an index of coherent ground-guide
chains from the **already optically transformed** scene, reused across camera
changes via a weak reference to its immutable source primitives. It treats only
`line` primitives marked `metadata.physicalGround` as candidates. It never
simplifies the `physical-horizon`, tower strokes, tower polygons, fills, or
non-ground primitives. Different styles, kinds, angles, disconnected endpoints
and scene layers start distinct chains; missing optical segments are never
bridged.

For each camera orientation and viewport, the candidate chains are projected
using the same camera basis, perspective divisor and canvas pixel transform as
`CurvatureStrokePreview`. Visible, near-plane-safe runs undergo screen-space
Ramer–Douglas–Peucker simplification at **0.5 backing-store pixels**. New
straight segments use real endpoints from the physical ray-projected scene:
no surrogate atmospheric model is evaluated. The maximum perpendicular
sampled-vertex deviation is checked while selecting each chord. This bounds
error relative to the previously piecewise-linear *sampled polyline*, not to
an unknown continuous optical ray, and is not a global perceptual or
subpixel raster equivalence proof.

Whole runs wholly outside one viewport half-plane are culled, as are segments
with **both** original endpoints behind the camera near plane. Every segment
crossing or sufficiently near that plane is preserved unchanged and delegated
to the existing camera clipper. The optical horizon is not a viewport/culling
limit; this is purely screen presentation. All original physical line and
polygon data remain cached and unmodified. During slider drag, the existing
#117 whole-curve preview remains active; once settled, #119 builds the
screen-error-limited full-grid frame.

## Reproducible command-count proxy

```
node tools/benchmark-ground-screen-lod-119.js
```

The synthetic 160-curve, 77,600-segment scene is intentionally dense and
coherent, approximating the high fragment count seen in the user's profile.
It exercises the actual independent snapshot/validation, painter and Canvas
API calls with a **fake** 2D context. Example single-run numbers: baseline
77,600 lines versus 1,868 screen-LOD lines; the separate LOD preprocessing
cost ~37 ms in Node. This is *not* a browser FPS or verified 85-tower
performance result. Hardware, physical scene layout, camera near-plane
crossings and styles influence the actual reduction.

## Browser acceptance

1. Load Physical / Globe + Standard / 85 objects / grid On, and compare the
   same camera angle with #118. The Physical diagnostic now includes the
   screen-grid source/discarded/output counts and a separate screen-LOD time.
2. Drag Pan and let it settle. The #117 interactive preview should return to
   the full **screen-LOD** grid after 180 ms. Towers, horizon, fill and
   camera depth ordering should remain the same.
3. Use the existing `Export Geometry Diagnostics (ZIP)` and compare
   `performance-profile.json` and `performance-samples.json` across #118/#119:
   cold/warm/interactive/Pan/grid-off; note `screenLodMs` and
   `screenLodStats`. `snapshotOnlyMs` excludes screen preprocessing.
4. Check Globe/Flat, different elevations/zooms and a horizon-skimming camera.
   Near-plane crossings are deliberately kept exact.

If browser speed is still too slow, diagnose actual viewport and ground-guide
curve distribution before decreasing tolerance; don't alter RK4 or ground
visibility to make an attractive benchmark.

## Out of scope

- The continuous unsampled optical curve cannot be certified by RDP.
- Line antialiasing, stroke joining, alpha accumulation and GPU rasterization
  can differ slightly even with <0.5 px sampled-vertex deviation.
- Physical fill, world-space ground visibility, tower occlusion, the
  adaptive optical field and Legacy/Independent paths are unchanged.
