# Compatpatch 99 — audit of the existing optical engine

Scope: **read-only architecture audit and migration plan**. No changes to optics equations, scene geometry, user interface, or render output. Reviewed against the tree after patches 97, 97.1, 97.2 and 98. Findings distinguish executable behavior from proposed contracts.

## Inventory: what is already implemented

| Component | Existing behavior | Boundary / caveat |
| --- | --- | --- |
| `src/optics/OpticalRayTracer.js` (`CurvatureRayTracer`) | Independent 2D ray ODE with fixed-step RK4. State `[x,z,vx,vz]`, angle relative to observer tangent, metres; `trace()` can collect path samples and stop at ground. `atmosphere()` returns `n(h)`, `dn(h)` for vacuum, exponential standard atmosphere, or custom callback pair. | Not a pixel-to-world renderer. Step size is fixed, there is no local error estimate or event root solver; ground crossing uses first-order interpolation and endpoint `travelled` is not corrected to the interpolated impact distance. |
| `src/optics/OpticalTowerDiagnostics.js` | Maps a specific target distance/height into 2D Globe or Flat coordinates, performs shooting for an arrival angle; returns `visible`, `occluded`, or `no solution`. Vacuum angle is analytic. | Searches one bracket of angles (initially ±0.05 radians around direct line for non-vacuum); no multi-path enumeration, no global completeness guarantee. Ray-clearance testing uses sampled segments, not continuous event detection. `no solution` is a *solver outcome*, not proof that no physical ray exists. |
| `src/renderers/CurvatureInverseOpticsBridge.js` | Experimental projection/overlay and P4 tower replacement with exact shooting, analytic P4, fast interpolation, cached/map/polynomial and forward-bundle paths. | A specialized optical tower visualization, **not** the independent primary-Canvas physical renderer; many branches explicitly assume Globe + standard atmosphere. Analytic P4 is not RK4 and must be labelled accordingly. |
| `src/app/CurvatureModel.js`, `src/optics/OpticsBackendUI.js` | `ray-tracing` selection uses physical `rEarth` instead of effective `refractionRadius` for geometry; UI explicitly states the rays are **not** connected to main rendering. | The UI's profile selection is not sufficient to activate atmospheric image rendering. `custom` UI does not expose executable `n`, `dn` functions. |
| `src/geometry/CurvatureGeometryEngine.js`, `src/scene/CurvatureIndependentComposition.js` | Independent 3D tower/object placement, Globe/Flat and painter-order horizon layer composition. | Mask and layer order visually approximate occlusion. They are **not** first-intersection physics along a curved ray. |
| `src/app/CurvatureMainCanvasRenderer.js`, `src/renderers/CurvatureFrameRenderer.js` | Independent preview in the primary Canvas; both supported object groups, camera and painter output. | No physical ray visibility in primary Canvas; `Both` falls back to Legacy. |
| `tests/CurvaturePhysicsRegression.test.js` | Analytic vacuum geometry, tangency, visibility, two object groups and effective-radius semantics. | These do not certify numerical integration for atmospheric rays or a physical image renderer. |

## Actual numerical equations

Ray state is `s = (x,z,vx,vz)`, where `v` is a unit direction and the integration variable is path length (metres). For an index varying with local altitude `h`, the implemented equation is

`dr/ds = v`, `dv/ds = (n'(h)/n(h)) * (grad(h) - v*(v·grad(h)))`.

For Flat, `h=z` and `grad(h)=(0,1)`; for Globe, `h=hypot(x,z+R)-R`, `grad(h)=(x,z+R)/hypot(x,z+R)`. The observer starts at `(0,observerHeight)`. Vacuum (`n=1`) makes the second derivative zero, hence straight rays for either geometry. `standard` currently means `n(h)=1+N0 exp(-h/H)`, defaults `N0=0.000293`, `H=7350 m`; it is a demonstrative profile, not meteorological retrieval. Do not silently equate it with legacy effective `k` or the paper's inverse profile.

## Dependencies and proposed ownership

```text
Model (geometry + physical radius + observer/camera + profile spec)
    -> independent 3D world geometry (existing)
    -> ray ODE integrator (existing 2D; improve/validate)
    -> ray-to-surface / ray-to-object intersection & visibility (NEW)
    -> projection/image synthesis independent of Legacy horizon mask (NEW)
    -> Canvas renderer / optional debug ray visualization (existing + adapter)
```

`OpticalTowerDiagnostics` is a **target-point shooting client** of the integrator. It should remain available for numeric verification; it should not be the primary per-pixel renderer. `CurvatureInverseOpticsBridge` remains a specialized experimental comparison until its coupling to tower-specific geometry and standard-profile assumptions has been disentangled. Keep the `Canvas engine` selector separate from `Optical comparison` and from the eventual physical profile selector.

## Proposed contracts (design target, NOT present APIs)

1. **Profile** `{name, n(h), dn(h), validHeightRange?}`: `h` and distances in metres, `n>0`, finite derivative. Explicit handling of regions below terrain, and validated standard/custom parameters. No legacy `k` implicit conversion.
2. **Ray input** `{geometry: 'globe'|'flat', radius, observerHeight, initialAngle, maxPathLength, stepPolicy}`; output `{samples?, termination: 'range'|'ground'|'failure', pathLength, endpoint, accuracy?, events?}`. Forward and backward integrations should use the same ODE, with an explicit reference frame and tangent-angle convention.
3. **Intersection** returns the first physical hit along the *integrated* path, with entity/material, path length and world-space position; tangent contact and near-ground numerical tolerance must be specified. Globe terrain in 2D is `hypot(x,z+R)-R=0`; Flat is `z=0`. General 3D objects require a separate 3D strategy; do not treat the present 2D solver as if it already intersects full meshes.
4. **Visibility** must distinguish `visible`, `blocked`, `solver_failed`, and `not_searched` (particularly for multiple rays). A single shooting failure cannot imply physical invisibility.
5. **Rendered frame** carries scene/camera/profile identity, numerical tolerances and diagnostics. Painter-order horizon masking may serve as the *comparison* path, but may not decide physical ray visibility.

## Risks to resolve before connecting optics to the primary Canvas

- **Dimensional mismatch**: current ray propagation is 2D in a chosen vertical plane, whereas the independent objects/camera exist in 3D. Decide how each camera azimuth defines its vertical propagation plane and how projected rays intersect off-axis 3D objects; avoid assuming that 2D rays directly hit arbitrary 3D mesh triangles.
- **Finite-step horizon contact**: a sampled segment can cross or graze the ground between nodes, and first-order impact interpolation is approximate. Test with independent analytic line/sphere intersections before adding refraction.
- **Numerical stiffness and conservation**: monitor direction normalization, optical invariant(s) appropriate to radially stratified media, error versus step size and reversibility; guard excessive steps and invalid profiles.
- **Shooting completeness**: a single root bracket misses some solutions and ducting/mirage multi-image cases; report limitations rather than rendering missing rays as occlusion.
- **Control state**: `opticsMode=ray-tracing` currently changes geometry radius, but does not activate ray-driven visibility. Avoid claiming otherwise. Keep vacuum and effective-radius as different physical assumptions.
- **Occluder semantics**: the existing white polygon/disk is an illustration of legacy draw order; it must not be reused as a physics oracle in the new path.

## Follow-on patches (revised sequencing)

- **100 — numerical-core qualification**: use existing `CurvatureRayTracer`; add independent vacuum straight-ray endpoint and impact tests for Globe/Flat, RK4 step-convergence, reciprocal integration experiments and invalid-parameter tests. Fix any measured defects in isolated commits. Do not render new images yet.
- **101 — event detection and 2D physical visibility**: continuous or bracket-refined surface intersection, clear `blocked/visible/failure` semantics, explicit target-point shooting with verified root range. Cross-check vacuum against patch 98 geometric oracles.
- **102 — atmospheric test suite**: use configurable `n(h)`, verify homogeneous-index straight rays, standard exponential bending direction, refinement convergence, reversible paths and near-tangency stability; compare analytic/lower-dimensional test cases. Evaluate paper inverse profile separately, not by fitting an image.
- **103+ — image synthesis**: map camera rays to world geometry first in a deliberately controlled 2D scene; specify the 3D embedding and intersections before connecting to full Pontchartrain tower geometry. Preserve Legacy and painter preview for regression/debugging.

**Acceptance criterion for the eventual physical renderer:** with `n(h)=1`, Globe produces the analytic geometric visibility boundary, Flat has no curvature horizon, and both agree with known ray/object intersections *without any horizon-law or legacy mask in the visibility algorithm*. With nontrivial profiles, visibility emerges from the same ray equations plus geometry, with recorded numerical error and explicit failure states.

## Verification for patch 99

Review-only files: this document and root `PROJECT_STATE.md`. Run `node --test tests/*.test.js` to verify that existing behavior remains intact. No browser visual test is needed. A future patch changing numeric algorithms should have dedicated independent tests rather than rely on visual parity.
