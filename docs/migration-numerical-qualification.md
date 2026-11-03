# Compatpatch 100 — numerical ray-core qualification

## Scope

This patch qualifies and hardens the **existing** 2D `CurvatureRayTracer`; it does not implement an optical image renderer or change `CurvatureApp.html`, `DrawModel`, Independent painter composition, P4/legacy-k, or camera projection.

All distances and path lengths are in metres, all angles in radians. The ray state is `[x,z,vx,vz]` in the observer's tangent frame; the observer starts at `(0,observerHeight)` with unit direction `(cos(angle),sin(angle))`.

## Confirmed and fixed defects

1. **Ground distance was overstated.** `trace().travelled` advanced by a complete RK4 step even if `hitGround` was set at a fraction of that step. Example: a Flat vacuum ray from 10 m at -0.1 rad impacts at `-10/sin(-0.1) = 100.166861... m` along the ray. With a step of 30 m, the old result reported `120 m`.
2. **First-order interpolation was inconsistent with an integrated curved path.** Instead of interpolating the endpoint position and direction linearly, the impact is now bracket-refined within the last step by reevaluating RK4 from the *same start state* at trial substeps; `travelled`, `angle`, `height`, the last collected sample, and `(x,z)` all refer to the refined event. This is a single-step root refinement, **not** an adaptive step-size integrator.
3. **Non-finite numerical inputs could enter the solver.** Validation now rejects non-finite/non-positive radius, invalid length, step, observer height, angle, atmosphere constants, missing profile functions and non-finite propagated state. The new `advanceState(state, signedDs, options)` exposes the *same RK4 step* for explicit time-reversal and convergence checks; negative steps are supported only by this low-level API.

## Independent checks (12 test cases)

`tests/OpticalNumericalQualification100.test.js` checks:

- straight rays for both geometries and multiple vacuum directions against analytic line endpoints, with the final non-divisible step;
- planar ground impact against `s = -h/sin(angle)` at three step sizes;
- Globe ground impact against the **first positive** quadratic ray/sphere root, including close-to-tangent launch angles;
- non-impact when the Globe ray clears the surface, and no curvature-induced horizon for a horizontal Flat vacuum ray;
- termination at the requested finite length, zero-length and an immediate downward launch from ground;
- numerical refinement of a smooth, deliberately strong exponential refractivity profile in both geometries;
- straight-line propagation through a constant-index medium;
- conservation of `n(z)*vx` in planar stratification and `n(h)*(x*vz - (z+R)*vx)` in radial stratification;
- reciprocal positive/negative path stepping with error decreasing as step length shrinks;
- rejection of invalid inputs and non-physical refractive index/gradient results.

The analytical references do **not** use Legacy DrawModel, a painter horizon mask or the effective-radius `k` model. These checks qualify the 2D integrator, **not** an arbitrary 3D object visibility engine or image equivalence.

## Remaining limitations and next patch

- Ground-event detection still requires the height to cross from nonnegative to negative across a full step. A grazing ray can touch and rise again without changing sign, and a large step can conceal multiple contacts. Ground starts directed horizontally are not treated as ground impacts.
- RK4 remains fixed-step; no per-step local error estimate, adaptive subdivision, or generic event metadata exists.
- Some custom `n(h)` profiles may fail during RK4 evaluation below the physical surface when a coarse step overshoots terrain. General robust region-boundary handling belongs in event-aware integration.
- `OpticalTowerDiagnostics.solveAngle()` still has a limited root-search interval and sampled clearance; `no solution` is not evidence of invisibility.
- Physical 2D object/ground first-hit semantics and the 2D-to-3D embedding have **not** been implemented.

**Proposed #101:** event-aware ray/terrain intersection and explicit visibility result types, including tangent/step-skipped event investigations, and independent vacuum cross-checks. Avoid plugging an incomplete event solver into the primary Canvas.

## Validation

Run `node --test tests/OpticalNumericalQualification100.test.js`, then `node --test tests/*.test.js`. No browser check is required: no UI, drawing or model settings changed in this patch.
