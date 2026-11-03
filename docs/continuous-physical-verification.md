# Patch 128 — continuous physical scene and verification

## Scope and invariant

In **Physical** rendering, the curvature slider must change one physical
parameter, `κ = 1 / R` (including exact `κ = 0`), without changing an object's
ground-metric east/north position, azimuth, authored dimensions or the
observer-fixed `Eye-Lvl` camera. The old `FlatEarth` display convention
mirrored the tower row; it remains in **Legacy** and **Independent** only.

`CurvaturePhysicalWorldGeometry.placement` now accepts an explicit curvature
separately from the historical orientation flag. The Physical scene author
passes the curvature explicitly and always uses the same right-handed local
orientation, including at exact zero. Inputs still store meter-valued
`ObjDist`, `ObjSidePos` and tower dimensions. There is no new persistent state
field; the exact-flat slider endpoint still selects `showModel = 2`.

The metric grid uses a uniform distance-based subdivision rule on both sides
of the endpoint. Its 100 km rendering extent is presentation-only; it is
**not** a claimed optical horizon. Styles and radial landmarks are identical
between the two geometries. A failed or indeterminate ground-shooting result
must not create a finite Physical optical horizon. A horizon is reported only
when a sufficiently narrow bracket between confirmed visible/blocked results
exists. The original **non-metric** reference guide arithmetic is preserved
for historical golden-scene tests.

## Repeatable checks

```
node --test tests/*.test.js
node --test tests/PhysicalContinuousScene128.test.js
node tools/benchmark-continuous-physical-128.js 5
```

New tests check:

- All 87 tower placements, stroked primitives, foundations and their
  flat-limit convergence, not just one selected anchor.
- Physical flat positions remain independent of the last finite radius;
  exact-zero orientation is the limit of positive curvature, not a mirror.
- Same grid landmark distances, styles and subdivision at the endpoint.
- Slider state and fixed camera at the 999-to-1000 step transition.
- Analytic straight-line vacuum angles on a plane and spherical vacuum
  tangent/occlusion classification.
- Standard-atmosphere finite/near-flat/flat convergence for a reliable,
  non-grazing target, without conflating vacuum with refraction.
- Failure/indeterminacy cannot manufacture a finite horizon; genuinely
  classified ground-event brackets may still establish one.
- Full two-bank 85+2 Standard-atmosphere optical scenes have matching
  counts and converged projected object coordinates at `R = 10^16 m` vs
  exact zero, with no unresolved outline or fill primitives.
- All historical Legacy/Independent scene hashes remain in the regression.

### Benchmarks, reference run (Node, 5 repeats, same host; indicative)

| Case | #127 median optics | #128 median optics | #127 guide pieces | #128 guide pieces |
|---|---:|---:|---:|---:|
| Earth, `R=6371 km` | 229.8 ms | 227.3 ms | 4000 | 1096 |
| Near-flat, `R=10^16 m` | 153.7 ms | 70.5 ms | 6112 | 2328 |
| Exact flat | 60.5 ms | 64.2 ms | 2328 | 2328 |

The near-flat shooting RK4 call count dropped from 217602 to 40439 in that
comparison. The earlier guide horizon was spurious: solver failures above
roughly 950 km were treated as blocked. With the new rules no **certified**
finite horizon was found in that scenario. This is *not* proof that the true
optical horizon is infinite. Times are influenced by JIT warmup, host load,
scene composition and adaptive cache behavior; this is not a browser FPS
promise. The exact-flat physical world changes orientation relative to the
old `FlatEarth` preview by design, so the old and new flat images are not
identical and a pixel-diff against #127 would be a misleading regression test.

## Browser acceptance

Headless Chromium was run through the actual page with both 85+2 tower banks,
Standard atmosphere, Physical canvas and `Eye-Lvl` camera for Earth, large,
near-flat and exact-flat curvature. All four completed without JS errors,
failed optical point evaluations, unresolved outlines or fill omissions.
The camera target and scale stayed identical. This is a smoke test, not an
independent visual proof or a substitute for inspection in the user's browser.

Suggested manual comparison: keep `Eye-Lvl`, `Height`, Pan/Nick/Roll, Zoom,
Atmosphere and both tower banks fixed; compare radius `6371 km`,
`6,000,370 km`, slider step 999, slider step 1000. The tower row must stay on
the **same side** across the last two steps. For a clean visual diagnostic,
export Geometry Diagnostics (ZIP) at near-flat and exact flat settings.

## Remaining limitations

- Atmospheric shooting finds only one forward-x branch, not all possible
  multipath solutions or caustics. Loss of numerical convergence does not
  prove physical occlusion.
- Ground projection is 2D radial and uses stratified `n(h)`; global error
  bounds for every refracted pixel and mutual 3D tower occlusion are not yet
  available. The foundations are authored fills, not a filled terrain mesh.
- In horizon-aim mode the camera **intentionally** tracks the geometric
  horizon; use `Eye-Lvl` for comparison at a fixed camera orientation.
- The old finite-radius `FlatEarth` Legacy scene deliberately retains its
  mirrored object arrangement. Legacy and Physical should not be mistaken
  for the same experiment when the model radio button changes.
