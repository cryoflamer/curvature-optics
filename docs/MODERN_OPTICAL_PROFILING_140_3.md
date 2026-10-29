# #140.3 — Cold/Warm optical computation profiling

Purpose: measure **fresh optical projection work** rather than inferring its
cost from redraws of cached rays. No change to the physical solver, numerical
settings, scene coordinates, visual backends or atmospheric profiles is intended.

## Browser procedure

1. Open **Scene → Display → Render profiler**, choose a physical atmosphere
   (for example `standard` or `inverse-spherical`), choose Canvas 2D as the
   reference renderer, and keep model and viewport dimensions fixed.
2. Press **Start recording**. Then press **Cold optical sample** 5–10 times.
   Each click schedules **one** ordinary redraw, and clears only that
   viewport's `CurvaturePhysicalSceneOptics` camera-independent cache just
   before the optical transform. It does not clear arbitrary JS/runtime
   caches, reload the page, or change the physical model. Wait for each redraw
   to finish before clicking again.
3. Press **Warm optical sample** 5–10 times without changing any settings.
   Each click schedules one redraw **without** cache invalidation. Reports
   include only actual cache hits under the warm heading; cache misses are
   counted separately. A failed/partial cold build may not populate the cache;
   check for warm misses and unresolved numerical work.
4. Press **Stop recording** and **Export JSON** (file name
   `curvature-optical-profile-140.3.json`). The `opticalSamples.Scene` group
   provides separated cold/warm medians and p95 and the actual cache-hit count.
5. In **Compare**, both A and B are sampled on one button press, each with
   their **own** session and atmosphere. Their results appear separately under
   `opticalSamples.A` and `opticalSamples.B`. Compare viewport sizes may differ
   from Scene; compare only comparable workloads.

Regular **Recalculate scene** remains unchanged and is tagged `normal`, not
cold or warm, even when its optical cache happens to miss or hit.

## Export fields

`profile.opticalSamples.{Scene,A,B}` contains:

- `cold`: actual cold builds requested by Cold sample that missed the cache;
- `warm`: actual cache hits requested by Warm sample;
- `warmCacheMisses` and `coldUnexpectedHits`: count requests that **did not**
  meet their stated cache condition and are *excluded* from cold/warm medians.

`cold.opticalStages` is an aggregate of the physical adapter's existing
`fieldSetupMs`, `groundGuidesMs`, `outlinesMs`, `fillsMs`, `assemblyMs`,
`sceneAdoptionMs`, and `exactSolveMs`; all CPU-side elapsed wall times.
`sceneAdoptionMs` is **nested in** `assemblyMs`.
`exactSolveMs` is **nested within** ground/outline/fill work; adding it to the
phase total would double-count. Some setup/phase time is not direct RK4 work.

`cold.opticalWork.{ground,outlines,fills}` summarizes per-phase *new* solves,
cache hits, interpolation/fallback counts, target shooting evaluations,
RK4 calls, and warm-start/predictor counters from the *existing* physical
adapter. Those values are not extra work: they break down the same cold
transform. `cold.fieldStats` includes whole-field counters where available.
All counts and durations in exported samples are bounded to the latest 60
records per viewport, and stale cache-build diagnostics are **not** attached
to cached rays.

## Interpretation and safeguards

- A "cold" sample resets only the **camera-independent optical scene cache**,
  not browser JIT, code caches, geometry generation, shader programs or the
  complete application state. It forces fresh optical field construction and
  target shooting for non-vacuum atmospheres. Vacuum can be an inexpensive
  analytic fast path (zero numerical shooting is expected there).
- A warm cache miss may occur if the model/geometry/atmosphere changed or the
  previous solve was incomplete/uncacheable; it is not a valid warm datapoint.
- The optical transform stage includes cache key generation and projection
  adapter overhead. The `exactSolveMs` counter is a *subset*, not the total
  physical work. Counters are useful for selecting future GPU kernels.
- Sample sizes under about 10 are exploratory; repeat runs and compare
  workloads separately for Scene and Compare. Browser thermal throttling,
  garbage collection and the main-thread event loop introduce noise.
- No GPU ray tracing is performed in this patch; WebGL2 geometry/shimmer
  settings are unaffected. Do not treat CPU wall time as GPU execution time.
- Existing ordinary redraws and `CurvatureModernApp.getRenderProfile()`
  remain supported. Export includes explicit cold/warm groups; JSON `version`
  is `140.3`.
