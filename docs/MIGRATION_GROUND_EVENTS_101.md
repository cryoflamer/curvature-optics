# Compatpatch 101 — bounded first-ground-event detection and vacuum target visibility

## Scope and purpose

This patch strengthens the **existing 2D** `CurvatureRayTracer` against a known false-negative: checking only the altitude signs at the ends of each RK4 step misses a ray that enters and exits a Globe during the same step, and misses a true tangent touch with no sign change. The scene geometry, old `DrawModel`, Independent painter, Optical P4, camera and UI are unchanged. No precomputed horizon distance enters the event solver.

## Event search

`trace()` now samples the RK4 trajectory **within** each path-length step (default: eight equal subintervals, `eventSubsteps` accepts integers 2–64), preserving spatial ordering. The solver:

1. Refines ordinary altitude sign-changing entries by repeated integration from the same step start.
2. Watches for a change in the altitude derivative `dh/ds = grad(h) · v` from negative to nonnegative. Bisection on this derivative locates the local minimum. If the minimum lies below the surface, it refines the **first entry** before that minimum even when the final step endpoint lies above ground.
3. Labels a minimum within the configurable `contactTolerance` (default `1e-6 m`, accepted interval `(0,0.01] m`) as `grazing`. This is **a tolerance-dependent possible contact**, not a proof of physically exact tangency. Downward launches from the ground terminate immediately; rays departing tangentially from the ground do not count their starting point as a blocking hit.

`trace()` retains `hitGround`, `travelled`, `points`, `x`, `z`, `angle`, and `height` for compatibility and adds:

- `termination: 'ground' | 'range' | 'range-unchecked'`. The last value is returned with `stopAtGround:false`; it must **not** be interpreted as proof of terrain clearance.
- `event: null` or `{kind:'ground', contact:'crossing'|'grazing', pathLength, x, z, height, tolerance}`. Event path length is absolute from the observer, in metres. A `grazing` event means the integrated minimum is within the specified altitude tolerance, so a downstream visibility query must preserve uncertainty.

**Accuracy boundary:** This is a bounded substep search with RK4 trial integration, **not a globally complete continuous root isolator**, adaptive RK4, or a proof that all extrema and ground contacts have been enumerated. An arbitrarily sharp profile may have multiple extrema in one sampling interval; steep/invalid custom `n(h)` may fail if RK4 evaluates below the physical atmosphere before event localization. Lowering `step` and increasing `eventSubsteps` is an explicit convergence check, not an absolute completeness guarantee. The tolerance is a numerical classification band, not a physical soil thickness.

## First controlled 2D target-visibility query

`vacuumTargetVisibility({geometry, radius?, observerHeight, target:[x,z], step?, eventSubsteps?, contactTolerance?})` shoots the **unique straight vacuum ray** from `(0,observerHeight)` to the target in the observer tangent plane (metres):

- `visible`: no earlier surface crossing was detected (a crossing only at the target endpoint is not an occluder).
- `blocked`: the first **crossing** is before the target.
- `indeterminate`: a `grazing` event is before the target, within the numerical contact tolerance.

Returns `{status,ray,target,caveat}`; invalid inputs throw rather than being silently classified `blocked`. Passing atmospheric options is rejected: this API explicitly **does not search the boundary-value problem for curved atmospheric rays**, enumerate multiple paths, or intersect 3D meshes. It is a finite-ray, 2D ground-only check. The `visible` label is conditional on the bounded event search's documented numerical assumptions.

## Regressions

`tests/OpticalGroundEvents101.test.js` checks eleven cases independent of painter masks and `legacy-k`: 

- a tangent Globe vacuum ray detected for several RK4 step sizes, including a single 35 km step, and a tangent exactly at the requested endpoint;
- entry and exit during the **same RK4 step** compared with an independent line/sphere quadratic oracle, choosing the first root;
- near-tangent rays with positive clearance, and Flat vacuum behavior;
- unchanged `stopAtGround:false` sampling with an explicitly unchecked termination;
- target-point occlusion at 5/25/40 km with 15 m observer and 0/23 m targets on Globe; no curvature horizon for a Flat target;
- grazing target visibility is `indeterminate`, not falsely `blocked`;
- invalid step/tolerance/target/profile arguments fail explicitly.

Run `node --test tests/OpticalGroundEvents101.test.js` and `node --test tests/*.test.js`. No browser verification is needed.

## Follow-up

**102:** atmospheric and event convergence qualification, including strong smooth custom profiles, sampled minima near a tangent, monotonicity of refractive invariants, and investigation of coarse-step failure modes. **Later:** robust shooting/multipath confidence levels and 2D-to-3D physical intersections. Do **not** substitute the present vacuum-only target test for a physical image renderer.
