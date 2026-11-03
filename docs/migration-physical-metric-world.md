# Compatpatch 126 — continuous-curvature physical world and metric ground grid

## Why this is a physical-path-only migration

The physical Optical Solver already accepts curvature through the stable
`CurvatureSurfaceGeometry` kernel (#124–125). The independent scene authoring
was still using two other conventions:

* Legacy Globe latitude/longitude guide spacing `aDelta=aDip/nLines`, meaning
  a larger Earth radius **changed the physical grid spacing**; `LineSpacing`
  describes this historic grid, not a universal physical property.
* Legacy tower placement via rotations of `(R+h)`, followed by subtraction of
  `R+observerHeight`. The resulting geometry could lose small altitude offsets
  when `R` was enormous. The physical silhouette inverse transform likewise
  used `hypot(x,y,z+R)-R`.

The new `CurvaturePhysicalWorldGeometry` defines **one physical authoring
contract** for both surface guides and placed objects. It uses the same
continuous-curvature kernel as RK4 and retains exact zero curvature in that
kernel. The optional legacy scene authoring API and all historical reference
hashes are deliberately preserved. Only the main **Physical** Canvas asks for
`composeOpticalMain(model,globe,{physicalWorld:true})`.

## Coordinate and grid conventions

Coordinates are local ENU metres relative to the foot of the observer, with
world `z=surfaceHeight-observerHeight`. Surface distances are **arc metres**,
not planar chord length or a fraction of the horizon. The physical surface
is `CurvatureSurfaceGeometry.createFromCurvature(k)` where Globe uses
`k=1/rEarth` and Flat uses **exactly `k=0`**.

Metric reference circles (metres): 100, 250, 500, 1000, 2000, 3000, 5000,
7500, 10000, 12500, 15000, 20000, 30000, 40000, 50000, 75000, 100000.
24 radial azimuths use the same radii as interpolation landmarks. Circles
have 64 authored angular sections, and the shared optical guide projector
subdivides them further while using **surface-arc** rather than straight-chord
interpolation. Grid rendering is bounded to 100 km (or a smaller safe fraction
of a tiny modeled sphere); the bound **is not an optical or geometric horizon**.
The visible horizon is computed independently through the existing physical
shooting and ground-contact checks. Turning off the grid does not switch off
that horizon.

In metric mode `CurvaturePhysicalGroundGuides` calls the exact ground oracle
at each **distinct** distance and memoizes the result across all azimuths.
This removes the large near-eye angular distortion from sparse linear radial
sampling. No approximate ray is substituted for an exact one, and the same
physical field cache is shared with the tower solver. Legacy guide sampling
and the old physical-scene SHA-256 fixtures are unchanged when metric mode is
not requested.

## Towers and their basis

Physical placement retains the authored longitude/latitude orientation and
local foundation/tower plane, but the anchor is evaluated by the shared
numerically stable `surfacePoint3` kernel. A local horizontal tangent basis
and the actual surface outward normal form the authored axes. Existing
object bank shapes, foundations, variation rules, painting order and grouping
are preserved; physical visibility continues to be delegated to RK4 instead
of the legacy geometric mask. For today's 6,371 km radius, baseline tower
coordinates agree with the previous placement to approximately nanometres.

In the physical projector, the inverse surface coordinate and altitude now
use the same stable kernel for both contours and filled polygons; the legacy
inverse projection is retained for historical fixtures. Vacuum analytic
projection and guide horizon formulas also have a stable physical mode.

## Architectural boundaries and limitations

* **No curvature slider yet.** The UI still selects `showModel=1/2`; #127
  will replace this with continuous physical control and a camera that does
  not use the legacy finite geometric horizon as an image scale.
* **No Legacy drawing changes.** `CurvatureModel.Update`, `nLines`, `aDip`,
  `dDelta`, the legacy `LineSpacing` value, GraphX3DX, diagnostic capture
  scenes and historical grid authoring are preserved. The computed value is
  explicitly labeled **Legacy LineSpacing** to avoid confusing it with the
  fixed physical grid.
* **No invented near-flat finite horizon.** In standard atmosphere, the
  physical optical horizon can be beyond the 100 km grid rendering extent;
  its distance is not inferred from grid clipping. Engineered atmospheric
  profiles remain distinct from physical surface curvature.
* **No guarantee of a faster total frame.** The new grid is denser and the
  distinct-radius ground solves are exact. The user-browser profiling ZIP
  determines real end-to-end latency; future optimizations must preserve the
  metric distances and projection accuracy.
* **No z-buffer or complete multipath solver.** Previous physical silhouette,
  fill and mutual-occlusion limits still apply.

## Validation

`node --test --test-concurrency=4 tests/*.test.js`

`tests/PhysicalMetricWorld126.test.js` checks:

1. Geodesic ring radii and exact surface points for all selected curvature
   values from Earth through the exact plane and very large radii.
2. Legacy vs physical surface placement of tangent axes, normals and bases.
3. Exact metric ground-ray elevations and reuse across azimuths.
4. Full 85+2 Globe/Standard silhouette/fill parity with the #125 physical
   geometry (object segment counts and order, 0 unresolved, projection vertex
   differences below 1 micrometre on the 1,000 m render sphere).
5. The ~6 million km-radius screenshot configuration (R = 6,000,370,000 m)
   and a still larger R = 10^16 m, including stable metre-level altitudes.
6. Main browser source loading order and Legacy scene isolation.

Historical full-scene SHA-256 tests run unchanged by using the legacy-authored
scene path and historical arithmetic, while the **new** physical main Canvas
uses the metric path. These are intentional distinct visual-grid outputs.

## Browser validation requested after applying #126

Use **Physical** mode, Globe, Standard atmosphere, Height around 7 m, and
compare R = 6,371 km with R = 6,000,370 km. The grid must have the same
*ground metre* rings in both scenes, but different physical projection;
`Legacy LineSpacing` must no longer be interpreted as its spacing. Verify
that object/foundation silhouettes and optical horizon are visible and the
latter is not placed at an artificial 100 km boundary. Compare with Flat
and optionally Vacuum. Then export **Geometry Diagnostics (ZIP)** for
checking real browser timings, visibility and scene stats. Pan and camera
framing still have historical radius/horizon coupling pending #127.
