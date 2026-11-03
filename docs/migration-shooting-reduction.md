# Compatpatch 121 — fewer expensive Standard shooting and ground-event RK4 evaluations

## Browser evidence and scope

The user's `geometry-diagnostics (43).zip` after #120 measured a median
`height-change-cold` frame of ~656.6 ms, including ~586.6 ms of optical build
and ~413.9 ms in the exact target solver. This patch addresses **how many
RK4 integrations are run**, not the RK4 equation, integration step, target
residual tolerance, horizon/visibility thresholds, or Canvas painter.

The reference Globe + Standard scene at 15 m with 85+2 towers required
6,258 **unique target solves**, but 23,611 shooting trial integrations and
216,131 RK4 step calls *during shooting*. Each successful target also ran a
separate expensive ground-contact trace with sampled substeps. A fallback
sample is not necessarily a failed target solve.

## Two guarded reductions, Standard only

### 1. Locally predicted, still-exact shooting angle

The reference `CurvatureTargetProjection.solve()` first shoots the straight
line-of-sight angle, then opens a bracket with an initial 0.02 rad step and
refines it. For a smooth Standard near-surface atmosphere, the initial shot is
often already very close to the correct ray. An opt-in prediction uses the
straight-ray fixed-x derivative `d(z_residual)/d(angle) = x / cos(angle)^2`
for its *first* candidate, then an **observed secant** derivative for up to
three attempted corrections. **Every candidate is actually integrated and
checked against the ORIGINAL target tolerance.** If it fails to contract,
leaves a restricted angular region, becomes non-finite, or does not converge
quickly, the same initial shot and old bracketed method are used. There is no
unverified extrapolated ray or changed shooting tolerance. A narrower
numerical residual can lead to a slightly different, still-qualified arrival
angle compared with #120; bitwise-identical pictures are not claimed.

The predictor is enabled only for a field constructed from the known Standard
profile; user-provided, vacuum and engineered profiles stay on the old path.
An explicit internal `settings.shootingOptimization:false` disables both
#121 shortcuts for A/B tests and retains the #119/#120 reference scene hashes.
This opt-out is not an end-user UI control.

### 2. Skip substep ground-event searches only on safely clear spans

`CurvatureRayTracer.trace` previously called `groundEvent()` (at least eight
intermediate RK4 samples, plus possible root searches) *on every travelled
step*. The Standard exponential `n(h)` has a known conservative bound on
`|n'(h)/n(h)|`, which also bounds the magnitude of geometric-ray curvature.
For a step of path length `L`, any continuous curve with curvature bounded by
`K` stays within `K L^2 / 8` of its endpoint chord. Physical ground altitude
is 1-Lipschitz in Euclidean coordinates. If the chord's minimum clearance is
larger than the deliberately inflated `K L^2 / 4 + 0.001 m` margin, the
segment cannot reach the ground under the stated smooth-ray assumptions.
The next position is still computed by the **same RK4 recurrence**, once.

The safety condition includes a conservative lower altitude estimate
`h_start - L` when bounding the Standard exponential profile. All uncertain,
near-ground, crossing and grazing spans keep the **unchanged** ground-event
sampling and refinement. No shortcut is enabled for custom or engineered
atmospheric profiles. The continuous-ray bound and finite RK4 integration
are not a globally certified numerical enclosure for arbitrary profiles;
these controls are deliberately profile-specific and regression-tested.

## Results of paired local Node runs

Run `node tools/benchmark-shooting-reduction-121.js --towers=85` to execute
unaccelerated/accelerated scenes within the **same source tree** in alternating
order, rather than comparing different binaries/builds. Example samples:

| Eye height | Reference cold | #121 cold | Exact shooting evaluations | RK4 shooting calls |
| --- | ---: | ---: | ---: | ---: |
| 15 m | 792 ms | 461 ms | 23,611 -> 16,779 | 216,131 -> 159,685 |
| 15.3 m | 823 ms | 439 ms | 23,032 -> 16,347 | 209,238 -> 154,527 |
| 14.7 m | 629 ms | 391 ms | 23,271 -> 16,526 | 211,598 -> 156,290 |

At 15 m the numerical ground-event substep checks reduced from 36,833 to
2,878, and 33,955 step segments passed the cheap clearance test. The
predictor converged on all 6,258 target solutions in **this particular
scene**; separate tests explicitly exercise a non-convergent predictor that
falls back to the original solver. Timings vary with JIT, CPU and GC. They
exclude Canvas and DOM; the user's browser ZIP is the final performance test.

## Physical accuracy and regressions

- All 443 prior tests pass, including the original #120 SHA-256 full-scene
  reference hashes with `shootingOptimization:false`.
- #121 compares each full physical primitive/vertex at Globe heights 15 and
  15.3 m against the original unaccelerated source. Types/order/counts,
  visible/hidden/boundary classifications, fills and horizon are unchanged.
  Maximum difference in the 1,000 m arrival presentation points in the
  independent same-process comparison was ~5.5e-6 m (angular difference
  below 1e-8 radians). This is far below a pixel at normal camera FOV,
  but not bitwise identity and not a global continuous-curve error proof.
- A varied set of 180 target problems checks reference vs accelerated
  residuals, arrival angle and classification, including near-surface points.
- 80 explicit Standard full-ray ground-event comparisons cover Globe/Flat,
  heights near zero, descending and ascending paths, and confirm identical
  terminal states and contact events. A difficult profile case exercises
  predictor fallback. Engineered atmosphere stays on the old solver.

`performance-samples.json` now includes per-frame `predictorAttempts`,
`predictorAccepted`, `predictorFallbacks`, `provenClearGroundSteps` and
`fullGroundEventSteps`, alongside the #120 shooting and timing counters. The
Physical status summarizes confirmed fast-shooting roots and clear ground
steps during a cold build.

## Acceptance

1. Reproduce Physical / Globe / Standard / 85 towers / Grid On; drag Height
   and wait for the exact final frame. Check the tower/foundation/horizon
   picture, particularly at low eye heights and grazing boundaries.
2. Export the existing **Geometry Diagnostics (ZIP)** and compare its
   `height-change-cold` wall/optics/exact-solver values with the #120 ZIP.
   Record predictor accept/fallback counts and ground step bypasses.
3. Check Pan/Nick cached redraws and Flat Standard/engineered atmospheres.

This patch does not implement off-thread rendering or eliminate the remaining
synchronous 100–400+ ms optical rebuild. If the new browser profile reveals
another bottleneck, optimize it based on that evidence rather than relaxing
precision or increasing interpolation heuristics blindly.
