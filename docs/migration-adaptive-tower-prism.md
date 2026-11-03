# Patch 112 — adaptive shared optical field for the tower prism

## Why the old field rarely interpolated

`CurvaturePhysicalSceneOptics.bounds()` already produces a 2D optical domain
covering the towers' rectangular world-space bounding region, expressed as
**horizontal ground range `d` and height above the physical ground `h`**.
The whole 3D tower prism needs no 3D atmospheric ray grid for the current
vertically stratified, azimuth-symmetric optical models. Azimuth comes from
geometry; the common field gives optical elevation `F(d,h)`.

The previous 13-distance × 4-height grid was much too coarse at the chosen
`1e-5 rad` qualification tolerance. Its occupied cells were rejected and
almost every tower point reverted to an independently shot RK4 ray.
Increasing uniform density helps, but prequalifies many parts of the prism
that no actual contour visits, and is expensive near the horizon.

## Algorithm and contract

`CurvatureSharedRayField.create()` now accepts:

- `adaptiveDepth` (integer 0–8, default **0** for the public legacy API),
  setting the maximum quadtree subdivision depth in both distance and height;
- `maxAdaptiveCells` (positive integer, default 4096), a cap on allocated cell
  nodes. Initial root cells are created as encountered and are always permitted;
  the cap prevents **further subdivision**. A cap hit falls back to exact
  shooting rather than returning an unqualified interpolation.

Physical scene optics enables `fieldAdaptiveDepth: 3` and
`fieldMaxAdaptiveCells: 4096` by default. The root grid remains 13 × 4.
Each requested cell checks four corner rays plus the centre and four edge
midpoints against an independent exact shooting result. The check terminates
as soon as it detects a non-visible probe or an error greater than
`fieldTolerance` (default `1e-5 rad`). If the cell fails, only the child
containing the requested target is recursively prepared. Sibling cells remain
uncomputed until actually visited. A still-unqualified leaf always calls the
original `OpticalTargetProjection.solve()` oracle. There is **no** interpolation
of an observed blocked, indeterminate or failed cell, and **no** extrapolation
outside the prism.

The same exact ray cache is shared by cell qualification, subcells, and
fallbacks. Changing model, observer height, geometry, atmospheric profile or
settings invalidates the scene-level cache as before; changing only the view
reuses the physical geometry. Ground guides and their independent 100 km Flat
**drawing** extent are unchanged by this patch.

**Accuracy caveat:** five interior probes do **not** mathematically certify
the error between probes or guarantee the global absence of an unobserved
multiple ray branch. The `checkedError` is a measured control, not a rigorous
upper bound. Current scope is the previously qualified, single-forward-ray,
smooth-profile model without mirages. Boundary-sensitive cells still use
exact RK4 wherever they fail qualification. Independent off-grid probes and
complete real-mesh comparisons provide additional regression evidence.

## Measured cold-scene results

One sample on 2026-10-27, Node.js in the test container; **not** measured
browser frame time. 85+2 transmission towers, 15 m observer, RK4 step 2000 m,
`fieldTolerance = 1e-5`, 13 × 4 base nodes, adaptive depth 3.

| Geometry / profile | Direct-only exact solves | Adaptive exact solves | Direct/adaptive visible pieces | Direct/adaptive unresolved |
| --- | ---: | ---: | ---: | ---: |
| Flat / standard | 5659 | 1628 | 3333 / 3333 | 0 / 0 |
| Globe / standard | 7105 | 3535 | 3560 / 3560 | 130 / 130 |
| Flat / inverse-spherical | 7482 | 4202 | 3512 / 3512 | 158 / 158 |
| Flat / exponential-occlusion | 7482 | 4202 | 3512 / 3512 | 158 / 158 |

For Flat + Standard, the same-session cold calculation changed from ~0.9–1.0 s
without adaptive refinement to ~0.2–0.3 s with it; timings vary with JIT and
system load. These totals count field projection solves only, separately from
33 ground-guide solves. In a real-scene paired comparison, output vertices
were aligned by original geometry primitive; the maximum **approximate**
angular displacement was ~0.016 px using a *hypothetical* 1920-pixel-wide
60-degree-FOV camera. This is neither a claim about actual device pixels nor
a globally proved subpixel bound.

`fieldStats` now reports `interpolations`, `fallbacks`, `acceptedCells`,
`rejectedCells`, `refinements`, `adaptiveLimits` and `maxDepthUsed` as well as
`solves`, `hits`, `cells`, `roots` and `points`. The status line shows counts
and the distance/height ranges of the *tower* field separately from ground
statistics. A `fallback` is an exact-point request, not an error; it may be
resolved from the exact-point cache.

## Reproducible validation

```sh
node --test tests/AdaptiveTowerPrism112.test.js
node --test --test-concurrency=2 tests/*.test.js
node tools/benchmark-adaptive-prism-112.js --towers=85
node tools/benchmark-adaptive-prism-112.js --globe --towers=85
node tools/benchmark-adaptive-prism-112.js --atmosphere=inverse-spherical --towers=85
```

The benchmark runs the same *real* object meshes in depth-0 and adaptive modes
and reports cold-scene preparation plus repeated cached transformation
separately. It does not measure Canvas painting, actual FPS or visual clutter.

### Browser acceptance

1. Select `TrnsmLine`, Objects 1 = **85**, Physical, Flat, Standard, eye 15 m.
   Both tower banks should remain visible and no budget-induced fragments
   should vanish. The status should show positive `interpolated points` and
   noticeably fewer `exact ray solves` than the previous ~5379–5659 baseline.
2. Switch to Globe + Standard. The distant towers should remain ground-clipped,
   and remaining `horizon/boundary` uncertainty must not be silently hidden.
3. Switch to Flat + `inverse-spherical`, with `R = 6371000`, then rotate the
   camera. Physical geometry should be reused; no new ray work should run for
   a camera-only change.
4. Check both 2 and 200 tower variants for visual crowding; density may
   legitimately cause overlapping wireframe contours. Polygon fills are
   **not** part of patch 112.

## Not solved by 112

The physical surface grid still has its separate approximate projection and
Flat drawing extent; it is **not** supplied from the new tower field. The
polygon interiors and mutual mesh occlusion are still missing. The 130/158
near-horizon boundary leaves remain explicitly unresolved. Full camera-aware
pixel error control, an optical-field sharing strategy with ground lines, and
performance under large tower counts remain future work (113+).
