# #140.10 — One opt-in real-scene GPU shooting integration spike

## Evidence and gate correction

The real #140.9.1 JSON records **18/18 compensated numerical passes**, all four
compensated Vacuum analytic checks passing, and both representative GPU batch
ratios above 3x. Its `NUMERICAL_STOP` was caused by counting the **two failing
naive 100-km Vacuum analytic comparisons** in the compensated gate. The #140.10
correction tracks `baselineFailedAnalyticalChecks` separately from
`failedAnalyticalChecks` (compensated only). Baseline failures remain visible
as diagnostic context; compensated analytic failures still prohibit promotion.
Do not re-run the 36 synthetic ray tests to correct that accounting error.

## Exact integration boundary

`tools/generate-webgpu-scene-targets-14010.js` derives **64 mesh vertices each**
from the repository's production `CurvatureIndependentComposition.composeOpticalMain`
(`physicalWorld: true`) and `OpticalTowerSilhouette.coordinate`, sampling a
12-tower scene for Flat and Globe. Regenerate the committed fixture with:

    node tools/generate-webgpu-scene-targets-14010.js

`CurvatureWebGPUSceneSpike14010` uses the existing compensated WGSL derivative
and RK4 to propose a launch angle for each target (four bounded Newton
attempts). It passes each angle to the **unmodified** `OpticalTargetProjection.solve`
using the existing `shootingWarmStartAngle`/`shootingPredictor` interface.
The CPU solver has the final say on shooting residual and first ground events;
GPU never labels a target visible/blocked, and no live production hook is made.

This is a genuinely hybrid target-shooting experiment (the solver can accept a
GPU-proposed warm-start angle), not a standalone batch of arbitrary ray seeds.
It is deliberately **not** a full composed scene, clipping, fill, guide, Canvas
or frame integration. In particular the measured GPU/CPU ratio cannot be called
full-scene speedup, even if the stage gate passes.

## Run exactly once on the user's GPU

    python3 -m http.server 8000

Visit `http://localhost:8000/tools/webgpu-optics-14010.html`, click
**Run one cold scene-shooting spike**, then **Export #140.10 JSON**.
The report includes CPU shooting baseline, GPU device/pipeline setup, upload
through readback, and CPU-certified shooting of the same target sets. The
**cold** hybrid time includes all three costs, not just shader execution.

## Predeclared stop gates

1. Missing device/data/shader or inconsistent results: `INCONCLUSIVE`; no GPU
   promotion. A failed compilation is surfaced instead of represented as data.
2. Any CPU-visible/blocked/indeterminate status mismatch, unresolved ground
   result, or angle mismatch >1e-7 radians: `SCENE_NUMERICAL_STOP`. Keep
   the CPU backend.
3. Zero accepted warm starts in either scene, or cold GPU-assisted shooting
   stage below **2x** CPU-only speedup:
   `SCENE_PERFORMANCE_STOP`. Stop this GPU-assisted shooting approach.
4. Otherwise: `STAGE_PASS_ONLY`, never production authorization. One would
   still need independently authorized *full-scene* evidence, and that must
   not be inferred from this shooting-stage measurement.

This terminates the promised one-shot integration experiment. It does **not**
authorize further synthetic RK4 tuning, automatic GPU selection, or replacing
CPU ground events. A single cold run can reject a branch on numerical grounds;
it cannot establish portable production performance across systems. If timings
are close/noisy, consider the evidence `INCONCLUSIVE` rather than promoting GPU.

## Safety and known limits

- Only `standard` atmosphere and two deterministic 12-tower meshes are sampled;
  the candidate is not certified for engineered profiles, caustics, or multipath.
- Candidate GPU shooting approximates fixed-x residual using a finite-distance
  endpoint; an independent CPU solver always validates and can reject it.
- The CPU solver's target residual tolerance is unchanged; no numerical gate is
  loosened to make the GPU candidate pass.
- GPU timing uses browser wall clock and includes uploads, dispatch and
  readback. Hardware acceleration remains unverified.
- No full-renderer/frame/FPS or cold scene-composition claims are made.
- The production CPU scene path, selector, cache and renderer remain untouched.
