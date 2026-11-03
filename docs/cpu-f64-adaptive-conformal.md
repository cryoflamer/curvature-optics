# #140.12.44 — CPU f64 adaptive conformal Globe shooting (diagnostic)

## Purpose

Test whether an adaptive coarse conformal estimate can beat the existing CPU RK4 predictor on **both** the 48 authored near-range targets and the explicitly separate 1–100 km envelope. Compare four complete timed pipelines:

1. Unchanged `OpticalTargetProjection.solve` with `shootingPredictor: true`.
2. Original fixed two-step conformal estimate + original RK4 warm-start verification/fallback.
3. Adaptive 2/4/8/16-step conformal estimate + identical RK4 verification/fallback.
4. Adaptive estimate with a local Richardson fourth-order angle-error correction + identical RK4 verification/fallback.

The physical model remains `n(h)=1+N exp(-h/H)`, using the exactly conformal medium `m(u)=(r/R)n(h)` with `x=Rφ`, `u=R ln(r/R)`. **Only numerical predictors** are compared. An estimate from step-doubling is not an independent physical visibility certificate. Candidate status/angle must never be used to declare ground contact, visibility or absence of other optical branches.

## Adaptive policy

Two-step RK4 is preferred within 30 km unless the target is very close to the Earth boundary; long paths test progressively 4, 8 and 16 steps. After successive estimates, `|angle_fine - angle_coarse| × X / 15` is used as a *heuristic* for remaining endpoint-height error of a fourth-order method. `2e-7 m` is the generic threshold; near-surface targets farther than 5 km use `5e-11 m` to avoid discarding potentially useful refinement prematurely. These thresholds are experimentally chosen and do not replace the original RK4 tolerances or imply certified error bounds.

The local Richardson variant adds `(angle_fine - angle_coarse)/15` to the fine estimate. This is cheap, but the asymptotic fourth-order convergence assumption can fail at non-smooth or near-tangent paths; strict original RK4 always retains control. Surface candidates can still fail to warm-start an otherwise correct blocked ray. Never count unsupported candidates as successful solutions.

## Repeatability and report

In Modern Compare, enable the diagnostic probe with a standard-atmosphere Globe scene, then click **Benchmark Globe CPU f64 · adaptive conformal 2/4/8/16 + Richardson · ZIP**. Output:

- `results.json`: all per-target rows, median timings and each individual warmed round; warm-up excluded, order rotated between rounds.
- `authored-globe.csv`: 48 real authored physical target endpoints selected directly from Compare A.
- `stress-globe.csv`: eight surface and equal-height targets at 1/3/10/20 km.
- `envelope-eye-15m.csv`, `envelope-eye-100m.csv`: 20 target cases each, 1/10/25/50/100 km and altitudes 0/15/100/500 m.
- `performance.svg`: median timings for the four complete pipelines.
- `README.txt`: limitations and field descriptions.

Each complete-time measurement includes candidate generation and a call to the **unchanged** strict Globe RK4 solver, including fallback; the baseline has no prediction-generation component. Different modes time the same physical targets and use the same shooting parameters. Main and envelope timings must be compared separately, and CPU JIT/OS scheduling may affect millisecond-scale results.

## Non-goals and safety

Production optics, adaptive object geometry, Canvas painter and WebGPU are not changed. The 48 targets do **not** cover multipath completeness or guaranteed frame/pixel parity. Fast candidates do not bypass original ground-event classification. This experiment alone does not justify production promotion. The canonical `tools/webgpu-optics.html` is unchanged; do not create a new version-numbered HTML page.
