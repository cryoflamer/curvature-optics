# Compatpatch 120 — Height Change: cold optical build research and optimization

## Trigger and measured cause

The user's `geometry-diagnostics (41).zip` showed that #119 reduced cached
redraws to ~58.5 ms but a cold Physical/Globe/Standard frame still took
~692.5 ms, including ~620 ms of optical computation on that browser.
Changing the observer's `Height` changes the shooting initial condition and
physical horizon. It is **not** a camera-only redraw: using a previously
integrated ray result as if it belonged to the new height would be incorrect.

The repeatable Node scene in `tools/benchmark-height-change-120.js` contains
85 first-bank + 2 second-bank towers with the same physical shooting adapter.
At Height 15 m it performs roughly 6,258 *exact target solves* using about
216,131 shooting RK4 step calls and 23,611 shooting attempts. The “fallback”
statistic counts requests whose field cells could not be interpolated: it is
**not** the number of failed integrations, nor does it count unique solves.
The ground horizon and polygon fills have their own physical evaluations.

## What was optimized (without changing the physical model)

1. `OpticalRayTracer.step()` still uses the same RK4 coefficients, state order,
   atmospheric `n` and `dn`, event detector and normalization. Explicit
   4-component arithmetic replaces callback-based Array `.map` and a temporary
   normal-vector array at every derivative stage. This reduces garbage
   collection and callback costs during hundreds of thousands of integrations.
2. `prepareStepper` validates the invariant geometry and refractive profile
   once per target solve, instead of reconstructing the same setup for every
   shooting RK4 step. The trusted branch is only used with internal states
   constructed from `cos`/`sin` and subsequently normalized/validated by the
   unchanged RK4 step. `advanceState` remains a checked public API.
3. The shared ray field constructs the same atmospheric profile once per
   field, instead of once per target solve. The cache is still scoped to the
   complete physical configuration including observer height; **no**
   cross-height ray interpolation, status guessing, or tolerance relaxation.

All clipping and grazing rules, step size (2 km for the ordinary standard
profile), horizon calculations, adaptive cell qualifications and the painter
remain unchanged.

## Height slider latency and accuracy

A new Physical-only `CurvatureHeightChangeScheduler120` replaces successive
height-change frames with one **final exact rebuild** after 150 ms without a
new height update. `CurveApp.Update()` and control updates still run on every
input: only the expensive Physical Canvas redraw is delayed. While waiting,
the previous frame stays visible with the explicit
`HEIGHT CHANGING: exact Physical optics pending` warning. Once scheduled,
the build is synchronous; it can still temporarily block the main thread.
This is **debouncing, not a Web Worker or an incremental integrator**.

Changes to Pan/Nick/atmosphere/mode that request a direct redraw supersede a
pending height-only timer. Legacy and Independent keep their previous redraw
behavior. The #117 camera-only preview/restore remains unchanged.

## New diagnostic evidence

The existing Geometry Diagnostics ZIP profile now includes three
`height-change-cold` samples, with detached, fully recalculated model clones
at 0.98×, 1.02× and 1.00× the currently selected height. `model.Update()`
recomputes the camera and horizon with the new eye height; the real model and
BaroModel are not touched. Each sample records the requested observer height,
`exactSolveMs`, `shootRK4Calls`, `shootEvaluations`, and the optical stage
breakdown `groundGuidesMs / outlinesMs / fillsMs / assemblyMs`.

**Nesting warning:** `exactSolveMs` is part of ground guides, outlines and
fills; do not add it to those stage totals. The tool records main-thread
execution, not GPU time, browser event latency or achieved FPS. No height
interpolation occurs in the profiler.

## Reproducibility and verification

```sh
node tools/benchmark-height-change-120.js --towers=85
node --test tests/PhysicalHeightChange120.test.js
node --test tests/*.test.js
```

The same height benchmark script was executed with the original #119 optics
sources (control) and the #120 sources (optimized) in Node 22. Example
cold-build series for heights 15, 15.3, 14.7, 15.3 m:

- #119 baseline: ~1031, 889, 920, 905 ms.
- #120 optimized: ~766, 644, 603, 655 ms.

The three post-first heights had approximate medians **905 ms vs 644 ms**
(roughly **29% shorter**). These are environment- and JIT-dependent samples,
not guaranteed real-browser timings. The synthetic benchmark omits Canvas,
main app/DOM control updates, scheduling and image presentation.

For the same `advanceState` inputs, 16,800 old/new RK4 state steps were
compared bit-for-bit (no differences). 54 target-point reference solutions
from #119 retained exact statuses and arrival angles within 1e-12 radians.
The complete 85+2-tower Globe/Standard physical scene was compared at 15 m
and 15.3 m: SHA-256 hashes of **every output primitive** matched the #119
oracle, as did physical horizon, exact solve counts, fill counts and all
unresolved indicators. Tests also check height debounce and diagnostic model
immutability.

## Browser acceptance and remaining work

1. Reproduce Globe + Standard, 85 towers, grid On, and move Height. An
   explicit pending message should appear while dragging; after the final
   change the complete, exact Physical scene should be drawn. No partial or
   approximated optical horizon is substituted.
2. Change Pan. The #119 fast cached camera redraw still applies.
3. Export Geometry Diagnostics (ZIP) again and compare
   `height-change-cold` samples and cold-frame timing with the #119 export.
4. Inspect different observer heights close to the horizon, Flat/inverse
   profiles, and rapid slider motion for any visual regression.

The main-thread synchronous solve remains a latency floor on the last input.
A further significant responsiveness improvement would require Worker-based
or genuinely cooperative calculation with cancellation; neither is claimed
by #120. The algorithm still searches a single forward shooting branch and
does not establish completeness for arbitrary atmospheric multipath rays.
