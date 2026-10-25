# Independent numerical ray-tracer comparison

From the project root:

```sh
node tools/compare-raytracers.js
```

The default reference is the **unchanged** `simulator/solver.js` from the separately supplied
`chatgpt-pack-full-inverse-geometrical-optics-20261025-0737.tar.gz`, copied to
`tools/reference/original-solver.js`. The small `tools/reference/adapter.js` translates
between APIs and reports the original solver's visible/no-solution status without inventing
an occlusion classification.

The two solvers are separate RK4/shooting implementations. The test compares their launch
angles at distances 3, 6, 12 km and target heights 10, 20, 40 m with observer height 15 m
and Earth radius 6,371,000 m. Both use the **same** exponential profile:

`n(h) = 1 + 0.000293 exp(-h / 8500)`.

**Important:** the normal CurvatureApp `standard` profile defaults to H=7350 m, while the
original simulator uses H=8500 m. The test passes `atmosphereOptions` to the current
solver for this comparison only. It does **not** change the app's normal rendering or
its atmospheric defaults. Without this matching profile, a difference would be physical
input mismatch rather than numerical solver disagreement.

The current solver is also checked at step lengths 25, 10 and 5 metres. The original solver
uses its own internally chosen RK4 step and cannot be controlled with the same `step`
parameter. The displayed reference difference is thus an inter-implementation comparison,
not a matched-step experiment. `0.1 arcsec` is a preliminary threshold, not a certified
accuracy bound. Both implementations share the same physical equation, so agreement alone
is not a proof that the model or its assumptions are correct.

To use a different adapter, run:

```sh
node tools/compare-raytracers.js --reference /absolute/path/to/adapter.js
```

The adapter must export `solveAngle(options)` returning
`{status:'visible'|'occluded'|'no solution',angle:radians|null}`.

## Horizon regression (included in the same command)

The test now locates the **current solver's** standard-atmosphere visibility
transition at 18, 20, 25 and 30 km (observer 15m), using bisection on target
height. It samples 0.25m and 1m to either side of that boundary (when height
remains positive), checks 5m-vs-10m integration-step visibility agreement,
and compares the reference solver's visible/not-visible decision and angles.

The original reference adapter reports `no solution` for both a blocked ray
and numerical failure; the test therefore compares **binary visibility**, not
`occluded` versus `no solution`. The boundary is located with the current
solver, not independently: this checks nearby behavior but is **not** an
independent prediction of the refractive horizon location. Offsets of 0.25m
avoid the ambiguous exact tangency point.

A separate vacuum test uses the analytic spherical tangent condition:
`distance/R = acos(R/(R+observerHeight)) + acos(R/(R+targetHeight))`.
It checks visibility 1m on either side of tangency, where positive heights
permit. This is independent of the numerical refraction integrators.

These tests use a 0.1 arcsecond angle-difference threshold; they do not certify
physical atmospheric accuracy, near-exact-tangent behavior, or multiple-ray
solutions (e.g. ducting).

## Effective-radius physics sanity check

Run `node tools/check-effective-radius.js` to compare the numerical limiting
visible height at 20/25 km with the **approximate**, locally constant-gradient
Earth-radius model. The effective radius is `1 / (1/R + (dn/dh)/n)` evaluated
at the observer's altitude (15 m). The analytic tangent construction is then
applied to that radius. Refractivity N0 is swept through 0, 0.00015,
0.000293 and 0.00045 with H=8500 m. The script checks that stronger negative
refractivity gradients lower the visible-height threshold and that the
approximation is within 1 m over this limited range.

**Caveat:** This is a paraxial approximation, not an exact solution to the
exponential atmosphere. The current numerical solver allows 0.03 m negative
clearance along sampled rays; the inferred visibility boundary is consequently
slightly lower than exact geometric tangency even for N0=0 (roughly 0.04–0.06 m
in these tests). The vacuum comparison therefore allows 0.1 m; it must not be
interpreted as a precision measurement of atmospheric refraction. This test
does not validate actual meteorological conditions or ducting.
