# #140.12.47 — lazy hybrid conformal shooting / full-frame attribution

## Scope

- **Unchanged default**: the standard production Globe/Flat shooting algorithm is still selected unless a caller explicitly passes `shootingOptimization: 'conformal-hybrid'`.
- Only standard **Globe**, positive observer height, and the existing standard profile are eligible. Flat, vacuum, engineered or custom refractive profiles cannot enable the conformal path.
- `OpticalSharedRayField.exact()` now supplies an optional *lazy* callback `shootingLateWarmStart` to `OpticalTargetProjection.solve()`. The standard cheap warm-start/direction/guarded predictor runs **first**. A conformal prediction is computed only if those inexpensive stages fail the original residual tolerance; otherwise there is no conformal work.
- The callback can only return a candidate angle. The same original RK4 endpoint solver integrates it, checks angle domain and residual, then runs the original finite ray and opaque-ground/contact checks. Invalid/unavailable/nonconvergent candidates fall through to the original angular bracket. **No new authority** is granted to the conformal predictor, and no multipath completeness claim is made.

## Instrumentation

- `profileShootingStages: true` enables conditional per-stage timing, RK4 call counts and shot evaluation counts in `OpticalTargetProjection.solve()`; aggregation is stored in `field.stats().shootingStageMs`, `.shootingStageRK4`, `.shootingStageEvaluations`. Stages: previous-height warm, direct geometry angle, cheap predictor, late conformal certification, bracket fallback, and ray trace.
- Candidate generation cost is separately recorded in `conformalPredictionMs`; a late conformal proposal still costs a physical RK4 certification shot (`stageRK4.late`). Stage times are **not a partition** of the entire render: JavaScript overhead, field generation and painting are additional, and instrumentation itself changes timings.
- `hybridBaselineSolved` counts shots settled by initial/warm/guarded cheap predictor before late refinement, not necessarily all successful shots; `hybridLateAttempts`, `hybridLateAccepted` and `conformalAttempts` distinguish actual late work. The original `shootRK4Calls`, `shootEvaluations`, `predictorAttempts` and strict statuses are also retained.

## Browser A/B

In Modern Compare (Globe + standard atmosphere) press **Audit lazy hybrid shooting · baseline / hybrid / conformal · 8 hot frames · ZIP**. It warms each of three modes once, then runs 8 rotating-order measured physical Canvas frames per mode. Every frame gets a distinct optical session and cold optical ray field. Stage profiling is enabled identically for baseline, hybrid and always-conformal. Output contains:

- `results.json` — medians and all 8 samples per mode, predictor stage breakdown, gradient calls/levels, structural parity and strict per-pixel comparison of last frames.
- `baseline-real-frame.png`, `hybrid-real-frame.png`, `conformal-real-frame.png` — actual rendered Canvas snapshots.
- `baseline-vs-hybrid-diff.png`, `baseline-vs-conformal-diff.png` — red pixels with any channel delta greater than 8, for visual scanning. A strict zero-change assertion is **only** in the JSON and is not implied by an all-black >8 diff.

The camera/model/source is fixed to current Compare A. Timings include JS JIT noise, scheduling and per-shot instrumentation. One scene, even with exact pixel parity, does **not** establish global branch equivalence, full ground-surface generality, or a provable speedup. Default promotion is explicitly out of scope.

## Targeted numerical observation

A local pre-browser Node sweep (eye heights 1, 5, 15, 100, 300 m; 100 distance/height combinations per eye, 1–120 km) found only two late conformal calls per 100 targets, neither accepted. Thus the hybrid may match baseline speed rather than beat it; it is a falsifiable fallback strategy, **not** a promised optimization. The full-frame warm browser ZIP must decide whether further work is justified.

No WGSL, canonical `tools/webgpu-optics.html`, optical material, existing default painter, or versioned diagnostic HTML pages were modified.
