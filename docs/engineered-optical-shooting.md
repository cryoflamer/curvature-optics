# #140.4 — Engineered-atmosphere shooting qualification (CPU-only)

## Why the #140.3 predictor/warm-start counters are zero

`OpticalSharedRayField` has intentionally enabled the #121 guarded shooting
predictor and #123 height-based warm-start guesses only for the built-in
`standard` profile. Engineered `exponential-occlusion` (`n(h)=n0*exp(h/R)`)
and `inverse-spherical` are not numerical failures: the reference path is
*deliberately* bracket-first. These profiles can graze the ground or have
multiple relevant shooting branches. An integrated ray meeting a point-target
residual tolerance is **not proof** that it is the same branch found by the
reference bracket-first solver, nor proof that there are no other branches.

## What #140.4 adds

`shootingOptimization: 'engineered-experimental'` is a narrowly-scoped,
**explicit opt-in** for the two built-in engineered profiles, with no custom
`profile`. It reuses the existing #121 verified integrated shooting predictor
and #123 same-distance height seeds. Predicted rays must still meet the same
endpoint tolerance; the original final physical-ground event check is still
run. The ordinary `standard` behavior is unchanged; ordinary engineered and
custom fields still use the original bracket-first solver.

The experiment is intended for *offline CPU comparison*, **not** for
production enabling. No Scene or Compare controls were added, no atmosphere
or curvature equation was changed, and the legacy/modern renderer defaults,
GPU canvas, shimmer, experiment serialization and ray-cache keys are unchanged.
The setting is already forwarded by the physical scene adapter through
`options.settings.shootingOptimization`; the benchmark constructs fresh
independent optical sessions so no live UI state is modified.

## Reproducible cold-scene benchmark

Run from the repository root:

```sh
node tools/benchmark-engineered-shooting-1404.js --atmosphere=exponential-occlusion --geometry=flat --towers=85 --repeats=5 > engineered-exp-flat.json
node tools/benchmark-engineered-shooting-1404.js --atmosphere=inverse-spherical --geometry=flat --towers=85 --repeats=5 > engineered-inverse-flat.json
node tools/benchmark-engineered-shooting-1404.js --atmosphere=exponential-occlusion --geometry=globe --towers=10 --repeats=5 > engineered-exp-globe.json
```

Options `--towers=2|10|85|200`, `--geometry=flat|globe`, `--radius=<metres>`
(the *comparison* atmospheric radius), and `--repeats=1..20` are supported.
These are the repository's deterministic authored tower fixtures, **not** a
snapshot of whatever is currently displayed in the browser. An invalid
configuration or failed scene equivalence sets a nonzero process exit code.
Do not interpret `qualifiedInSample: true` as a mathematical proof.

For each paired sample the benchmark rebuilds a complete optical scene
with fresh, independent sessions. Execution order alternates across pairs.
It compares status-derived counts, primitive type/mode/topology and every
physical scene coordinate (maximum absolute difference ≤ `2e-5` metres)
and exports shooting/RK4 counts, predictor/warm-start acceptance and wall-clock
optical time. In addition, the tests compare direct ray shooting across both
geometries, both engineered profiles and near-grazing horizons, including
visibility status, angle, target residual and ground-hit classification.

`exactSolveMs` is nested inside total optical time. CPU wall times include
Node JIT, garbage collection and scheduling effects and are **not** GPU or
browser timings. No WebGPU compute shader was added in #140.4. The baseline
and experimental runs both use the same RK4 integrator and precision.

## Representative result and decision gate

On the initial 85-tower Flat exponential fixture (two paired local Node runs),
reference shooting evaluations were 28,203 per cold scene versus 14,548 with
the experimental setting; RK4 calls were 252,475 versus 129,370. Geometry
and visibility matched in those tested scenes within the stated tolerance.
The observed time reduction is encouraging, but the two-run measurement is
**not** a general performance estimate. Verify with repeated cold runs on
the target machine and different scene/radius/height configurations.

**Do not enable by default** until a wider branch-sensitive qualification
passes: multiple near-grazing targets, profile radii, observer heights,
settings, independent analytical/smaller-step oracles, and full-scene geometry
including unexpected occlusion and unresolved counts. An unexpected mismatch
should be investigated, not papered over by a larger tolerance.

A later GPU compute study must separately compare f32/f64 numerical accuracy,
branch selection, launch/transfer overhead, and CPU-vs-GPU wall time. A large
number of RK4 steps is not the same as an equal number of *independent* rays.
