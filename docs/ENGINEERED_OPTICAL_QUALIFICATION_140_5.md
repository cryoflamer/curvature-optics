# #140.5 — Expanded numerical qualification; no production promotion

## Question and outcome

Can #140.4's opt-in engineered-atmosphere shooting predictor/warm starts be
safely made the **default**? **Not established.** Broader tests found a
near-observer reference-domain limitation and an observable difference in
*nonmetric* legacy guide interpolation. Neither finding demonstrates that the
candidate's near-eye ray is physically wrong, but neither is permission to
silently change production rendering.

**No engine defaults, equations, UI, cache keys or rendering backends change.**
`shootingOptimization: 'engineered-experimental'` remains a strictly offline,
explicit opt-in; ordinary flat/inverse-engineered and custom profiles still
use the original reference path. We have **not** added WebGPU computation.

## Reproducible offline qualification

```sh
node tools/qualify-engineered-shooting-1405.js --suite=smoke > optical-1405-smoke.json
node tools/qualify-engineered-shooting-1405.js --suite=full > optical-1405-full.json
```

**An exit status of 1 is expected while the qualification gate is not met.**
The JSON is still written. `--step=2000 --fine-step=500` are the defaults
(metres) and may be overridden with `0 < fineStep < step`.

- A horizon-scaled grid spans both engineered profiles, both surface
  geometries, several atmospheric comparison radii, observer heights, ground
  and elevated targets, and the two sides of the approximate horizon.
  The horizon expression is used **only for choosing test distances**, never
  as a visibility oracle.
- Very-short-distance ground targets (0.1–100 metres) separately probe the
  steep shooting-angle limit that conventional multi-kilometre benchmarks miss.
- Every direct target is computed with baseline bracket-first shooting, the
  guarded predictor, **and** a smaller-step bracket-first reference. Status,
  launch-angle branch (2e-8 rad), residual (1e-6 m), ground-hit classification,
  contact type and first-impact distance (0.05 m) are checked. A matching
  `solver_failed` or `indeterminate` is **not** counted as a qualified result.
  The finer RK4 step is convergence evidence, **not an independent analytic
  multipath oracle**.
- Paired shared-field sequences exercise two broad and two tightly-spaced
  heights, with measured predictor/warm-start acceptance, verifying the
  optimization actually executes and doesn't use cached fake solves.
- Full optical scenes are rebuilt in fresh independent sessions for both
  **modern physical metric world** (`physicalWorld: true`) and the older
  **nonmetric guide path** (`physicalWorld: false`). Counts, topology and scene
  coordinates are checked with the original #140.4 2e-5 m tolerance. Scene
  sizes are 2, 10 and 85 authored towers in the full suite. Added a
  `--physical-world` option to the #140.4 benchmark for reproducing the
  modern app's physical-scene composition; the existing default remains
  unchanged to preserve older benchmark comparability.

## Observed qualification result on this development machine

| Suite | Scenario count | Not qualified |
| --- | ---: | ---: |
| Smoke: horizon-scaled direct rays | 128 | 0 |
| Smoke: near-observer direct rays | 56 | 16 |
| Smoke: warm-start-sequence targets | 160 | 0 |
| Smoke: paired scenes | 8 | 0 |
| Full: horizon-scaled direct rays | 1008 | 0 |
| Full: near-observer direct rays | 56 | 16 |
| Full: warm-start-sequence targets | 3600 | 0 |
| Full: paired scenes | 72 | 6 |

The six full-scene discrepancies are `physicalWorld:false` **Flat** fixtures
at comparison radius **3,185,500 m**, for both engineered atmospheres and
2/10/85 authored towers. The maximum projected **guide** coordinate delta
was ~843 m. **All 36 `physicalWorld:true` modern physical scenes matched**
within the existing numeric tolerance. This is a test-fixture distinction,
not evidence that the modern physical renderer has a 843-m geometric error.

### Why old nonmetric guides differ

For very near ground targets (e.g. `d=0.3 m`, eye height 15 m, atmosphere
comparison radius 3,185,500 m), the bracket-first solver returns
`solver_failed` because its angular bracket leaves the forward-x domain;
the guarded predictor instead integrates a finite residual-satisfying ray.
The old nonmetric guide draws from a sparse table of *only successful* radial
samples, so gaining a previously unavailable near-eye sample changes its
**linear interpolation** for several grid rings. This is why visual guide
coordinates can differ drastically even when object visibility/topology and
reported ground-horizon distance agree.

Neither the baseline failure nor the candidate success proves which branch
should be authoritative globally; the local result is an **unresolved
reference qualification**, not a demonstrated error in the candidate.
Production remains bracket-first. The modern physical metric guides sample
exact distances instead of interpolating this sparse legacy table.

## Decision gate

`qualifiedInSample` is false if any direct ray is unresolved/disagrees with a
paired or fine-step computation, any shared-field sequence disagrees, or any
scene comparison fails. `defaultPromotionAllowed` remains **false even if**
this finite suite happens to pass: universal branch uniqueness and grazing
limits cannot be inferred from a finite tested grid.

Investigate the baseline's steep-angle bracket failure separately, derive or
cross-check independent branch/first-hit oracles, and rerun the expanded suite
before proposing any production selection change. Comparing GPU performance
comes *after* validating numerical semantics; a reduction in RK4 calls alone
is not evidence of physical correctness.
