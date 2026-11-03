# Compatpatch 103 — stratified-atmosphere target projection and physical visibility

## Scope

A standalone `src/optics/OpticalTargetProjection.js` introduces
`CurvatureTargetProjection.solve(options)` for a **two-dimensional vertical section**.
No Canvas, tower mesh, HTML script selection, optical P4 or Legacy renderer changes.
Input coordinates are **metres**, angles **radians**; the observer is at
`(0, observerHeight)` and the target is a finite `[x,z]` in the observer's
local tangent frame, with `x > 0` and the target above the opaque boundary.
For Globe targets, users must convert surface-arc distance and target altitude to
this frame; see `OpticalTowerDiagnostics.target()` for the existing convention.

The profile is either `profile: {n(h), dn(h)}` or
`atmosphere: 'vacuum' | 'standard' | 'exponential-occlusion' | 'inverse-spherical'`
plus `profileOptions`. The default is `standard`. `radius` is the geometrical
Globe radius (default 6371000 m), distinct from a Flat profile's
`profileOptions.occlusionRadius`. No profile is inferred from the renderer mode.

## Algorithm and contract

1. Find the initial tangent-relative launch angle connecting the observer and
   target at **the target's actual x coordinate**. A forward RK4 path is stepped
   without ground termination, and the last path-length step is refined by
   bisection in x. It is **not** a linear interpolation of coarse trajectory nodes.
2. Start at the geometric line-of-sight angle, expand a bounded bracket on the
   side indicated by its height residual, and bisect the launch angle until
   the residual meets `targetTolerance` (default 1e-6 m, tightened to 1e-10 m
   for opaque-ground endpoints). The vacuum shortcut uses the unique exact
   straight-ray angle.
3. Reintegrate the finite path with the bounded first-ground-event detector
   from patch 101; inspect the first **prior** contact, not the destination
   itself. A crossing strictly before the destination is `blocked`; a numerical
   grazing event is `indeterminate`; a clear ray is `visible`. Near a ground
   endpoint, tiny early crossings within the shooting error envelope are
   treated as endpoint arrival when safely descending, or as uncertain near
   tangency.
4. Failed bracket search, integration, or convergence yields `solver_failed`
   with a reason and no angle. **It never means the target is occluded.**

Successful return fields: `status`, `angle`, `residual` (metres), `pathLength`
(metres), `target`, `ray` (the tracer's first-event result), `evaluations`,
`reason`, `scope`. Failed returns have `status:'solver_failed'`, `angle:null`,
`ray:null`, `residual:null`, `reason` and `evaluations`.

Controls: `step` (path-length metres, default 50), `targetTolerance`
(0 < epsilon <= 0.1 m), `initialSpan` (radians, default 0.02), `maxSpan`
(radians, default 1.2), `maxIterations` (default 48), `maxSteps` (default 100000),
`eventSubsteps` (default 8) and `contactTolerance` (default 1e-6 m).
Parameters are validated. The solver is bounded and uses the existing
`advanceState` and `trace` APIs; the angular search is not unbounded.

## Nonclaims and limitations

- **Single forward-x branch, not exhaustive multipath shooting.** A blocked
  returned path does not prove every mathematically possible alternative path
  is blocked, particularly for arbitrary custom profiles with anomalous
  stratification. A failed search must not be rendered as an occluded object.
- Target visibility means **first intersection with the 2D ground only**. This
  patch does not solve 3D geometry/mesh intersections, attenuation, magnification,
  angular field interpolation, or the Independent Canvas horizon renderer.
- The patch 101 finite RK4 substep event detection has bounded rather than
  mathematically complete guarantees for rapidly changing index profiles.
  Tangency is deliberately classified with a numerical tolerance.
- Optical equivalence of the inverse-spherical Flat profile covers the
  **grazing visibility boundary**, not the entire projected Globe image.
- The module is not yet wired to the HTML page; its CommonJS interface can
  be used independently in Node and its browser global is available if loaded.

## Regression coverage

`tests/OpticalTargetProjection103.test.js` checks 14 cases, including analytic
vacuum Flat/Globe, exact nonparaxial exponential-angle oracles, inverse-spherical
and exponential grazing-distance boundaries (with configurable R), a near-exact
grazing classification, standard-atmosphere bending and Globe horizon shift,
physical ground endpoints, RK4 step refinement, explicit solver failure,
custom profile geometry separation and invalid input rejection.

Run `node --test tests/OpticalTargetProjection103.test.js` and
`node --test tests/*.test.js`.

## Next milestone

**104:** a shared cached, x/h-indexed ray field over the common tower bounding
prism to avoid repeated shooting for each tower vertex. Measure field evaluation
against this independent point-shooting API before any production Canvas switch.
