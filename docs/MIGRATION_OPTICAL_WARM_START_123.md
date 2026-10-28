# Compatpatch 123 — verified cross-target warm starts for Standard shooting

## Motivation: less work, not lower precision

The user's browser `geometry-diagnostics (45).zip` measured a median
`height-change-cold` frame around 327.3 ms after #122, with the exact optical
solver still a substantial part of the cost. #121 had already reduced trials
per exact target via a guarded angle correction; #122 removed redundant scene
assembly copies. This patch reduces **independent trial RK4 integrations per
exact target** without changing the number of target samples, RK4 recurrence,
step size, solver tolerances, event detector, horizon or painter.

An audit of a reproducible 85+2 tower Globe/Standard scene at eye height 15 m
found 6,258 uncached target problems and 16,779 shooting trials. Many targets
share practically identical horizontal distance but differ in physical target
height, particularly among tower outline/fill samples. The function mapping
physical target height to the successful launch angle is smooth in this
standard profile away from near-field steep angles. **Two already solved**
heights at the same distance therefore supply a cheap secant-angle guess.

## Guarded algorithm

- A single newly constructed `CurvatureSharedRayField` owns a map of the last
  two successfully integrated `(height, launch angle)` pairs for each *0.1 mm
  distance bucket*. Distance bucketing is used solely to choose a candidate;
  the exact target cache continues using its original full `(d,h)` keys.
- Seeds are attempted only for built-in `standard` atmosphere with the #121
  predictor enabled and `d >= 5,000 m`. Vacuum, inverse spherical,
  exponential-occlusion and caller-provided profiles do **not** opt in.
- A seed is accepted as the final angle only after the **original RK4 solver
  integrates it to the exact requested target x** and its altitude residual
  satisfies the **original tolerance** (including the stricter ground-endpoint
  tolerance). The result then passes through the **unchanged ray ground-event
  verification and visibility classification**.
- Invalid, overly distant (more than 0.02 rad from the straight direction),
  failed or inaccurate guesses are discarded. The original #121 direction-
  first predictor and bracket fallback run unchanged. No guessed/interpolated
  ray is returned directly to the scene.
- The two most recent distinct heights are stored. The history and cache
  disappear with the field, including after any observer height, geometry,
  atmosphere, radius or scene-config change; there is **no cross-height
  scene reuse**. The extra map contains at most two small records per distinct
  0.1 mm distance bucket encountered in this scene.

Internal test setting `settings.shootingWarmStart:false` disables **only**
this #123 optimization, leaving #121's verified predictor and ground-clearance
shortcut enabled. The older `settings.shootingOptimization:false` still
explicitly disables the #121 predictor as well.

## Exact-call evidence (Node, reproducible)

`node tools/benchmark-optical-warm-start-123.js` compares the same cold
physical scene with only `shootingWarmStart` switched on/off, alternating
measurement order. At eye height 15 m and 85+2 Globe/Standard towers:

| Count | #122 / #123 disabled | #123 enabled |
| --- | ---: | ---: |
| Unique exact target solves | 6,258 | 6,258 |
| Shooting launch-angle evaluations | 16,779 | 13,066 |
| RK4 calls *inside shooting* | 159,685 | 112,076 |
| Verified warm-start attempts | 0 | 2,248 |
| Accepted warm starts | 0 | 1,987 |
| Misses (old solver used) | 0 | 261 |

So ~22.1% of launch-angle trials and ~29.8% of shooting RK4 calls are avoided;
the 1,987 accepted candidates account for 88.4% of warm-start attempts in
this particular scene. At height 15.3 m the test similarly reduced shooting
RK4 calls 154,527 -> 109,402. This does not reduce the 6,258 *different*
physically qualified target problems.

**Timing warning:** paired Node cold-build timings varied substantially across
runs due to JIT, GC and concurrent scheduling. Some accelerated full frames
were faster, others were slower. The reduced RK4 counts are deterministic;
a precise wall-time improvement is **not** claimed until the user's browser
ZIP confirms it. There is no Worker/background computation or UI change.

## Optical correctness and test scope

`tests/OpticalWarmStarts123.test.js` compares a full 85+2 tower Globe/Standard
scene at heights 15 and 15.3 m with the same source and #123 disabled/enabled.
The ordered type/mode/point count of every projected primitive, all tested
visibility/fill/ground-horizon statuses, and all counts match. Maximum sampled
coordinate difference on the 1,000 m presentation sphere was ~1.3e-7 m.
The accelerated root is not required to match the baseline angle bit for bit,
because both are exact RK4 **evaluations** satisfying the same residual
criterion. This is the same numerical distinction already documented in #121.

The #122 SHA-256 goldens are still tested unchanged with the internal
`shootingWarmStart:false` switch. Tests exercise successful and failed
warm-start guesses, fallback angle identity, cache and atmospheric scope,
residual and final ground-event classification. These are regression bounds
for tested scenes, not a global mathematical proof of single-branch completeness
or arbitrary atmospheres' contact behavior.

The existing Geometry Diagnostics ZIP includes raw per-frame and per-stage
`warmStartAttempts`, `warmStartAccepted` and `warmStartMisses` alongside
`shootEvaluations`, `shootRK4Calls`, `exactSolveMs` and the #122 work attribution.
Counters are per new exact target, **not** additions to the number of scenes.

## Browser acceptance

Run Physical / Globe / Standard / 85 towers / Grid On at eye height ~15 m.
Compare `height-change-cold` wall/optics/exact-solver medians with ZIP #45,
including warm-start accepted/miss totals. Check the physical horizon, near-
grazing silhouettes, foundations and Pan cached performance. If the gains
are modest despite the deterministic drop in RK4 calls, focus further work on
measured costs rather than loosening optical error controls.
