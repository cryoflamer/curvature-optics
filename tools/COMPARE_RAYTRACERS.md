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
