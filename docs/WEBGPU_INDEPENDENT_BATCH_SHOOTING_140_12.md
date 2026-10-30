# #140.12 — independent GPU batch shooting: bounded prototype

**State:** implemented as a *diagnostic-only experimental solver*, awaiting
**real WebGPU browser measurements and shader-compilation verification**.
This is a new architecture and does not reopen or overwrite the parked #140.10
GPU warm-start performance verdict. **No production backend switching**.

## Question and falsifiable hypothesis

Can a WebGPU kernel *find its own shooting roots* and measure first-ground
contacts, instead of merely guessing a launch angle that forces the CPU solver
to repeat the solve? We compare the independent GPU answer directly with the
existing unchanged CPU shooting reference over real production-composed 12-tower
mesh targets in Flat and Globe. The CPU reference is run **separately**, not as
part of the GPU measured path.

## Implementation and algorithm

- `src/diagnostics/CurvatureWebGPUBatchShooting1412.js` implements an
  `async solveBatch(request)` compatible with the #140.11 response contract.
- Stage A (`WGSL_SWEEP`): **33 independent rays per target** are dispatched as
  separate GPU invocations. The launch directions span ±0.2 radians around
  the target's geometric line of sight. The same compensated f32 RK4 integration
  primitive introduced in #140.9.1 computes the signed height residual at the
  target's **x** plane.
- Stage B (`WGSL_REFINE`): **one GPU invocation per target** chooses the
  nearest detected sign-changing interval and performs up to 28 bisection
  iterations *on GPU*. The final integrated ray is then sampled in 8
  subdivisions per RK4 segment to detect first crossings and contact
  uncertainties. Output contains angle, residual, path length, status and
  first-ground evidence, not just a proposed warm-start angle.
- Invalid, unbracketed or nonconvergent outputs are marked `solver_failed`.
  A surface contact without positive crossing evidence is conservatively
  `indeterminate`; a `blocked` status requires an observed prior crossing.
  **This is not an implementation of the complete CPU event detector**.
- Two compute dispatches execute in the same command encoder, and the results
  are read back once; the CPU never retraces GPU rays within `solveBatch`.
- Model scope: first forward-x branch, flat/globe, supported named
  atmospheres, numeric supported profile options; no arbitrary JS profiles,
  custom curvature, legacy surface arithmetic or near-vertical geometry.
  Target/steps/GPU resources have bounded allocations, and requests outside
  this scope are rejected instead of approximated silently.
- The GPU solver is exported as `CurvatureWebGPUBatchShooting1412`; it is **not
  imported into the live app render path**. The existing Canvas/WebGL2
  selector remains unrelated to WebGPU optical shooting.

## Run in browser

With the repository served through `http://localhost:8000/`, open
`http://localhost:8000/tools/webgpu-optics.html`, select
**#140.12 — independent GPU batch shooting**, and click **Run independent GPU
shooting comparison**. Export the resulting
`curvature-webgpu-optics-140.12-independent-shooting.json` for review.

The mode uses the committed, deterministic
`tools/reference/webgpu-real-scene-targets-14010.json` (64 mesh targets for
Flat plus 64 for Globe), transformed into the exact target-plane coordinates
of the CPU reference. It runs the baseline and the GPU implementation for each
scene separately, reporting cold GPU setup, upload-to-readback, status counts,
status/angular/residual/ground differences and per-scene speedup. A browser
with native WebGPU is required; no mock measurement counts as GPU performance.

## Gates and limitations (do not change after viewing a result)

1. **Numerical/physical first.** The same strict #140.11 comparison contract:
   status equality, angular error ≤ 1e-7 rad, residual difference ≤ the
   request's 0.005 m stage tolerance, first-ground event kind equality and
   first-ground distance error ≤ 1 mm. No `solver_failed` or `indeterminate`
   on either side is permitted for an all-pass sample.
2. **Performance only after numerical acceptance.** Both Flat and Globe must
   show **≥2× cold GPU-batch speedup** versus the independent CPU solver.
   Cold GPU includes device/pipeline setup and upload/readback, but **does not
   include** adaptive scene composition, guides, fills, painting or caching.
3. Even if the two stage gates pass, the verdict is only
   `BATCH_STAGE_PASS_ONLY`: full scene qualification, browser support/fallback,
   async scene orchestration and repeated runs are still required before any
   production switch. A numerical mismatch yields `BATCH_NUMERICAL_STOP`, a
   speed failure yields `BATCH_PERFORMANCE_STOP`, missing GPU measurements
   yields `INCONCLUSIVE`.

Important caveats:

- A finite, centered 33-angle sweep is **not exhaustive**: tangent roots and
  disjoint/multiple sign-changing intervals can be missed. The prototype
  selects only the nearest bracket to line of sight; no global multipath
  completeness is claimed. The current ground finder samples a finite set of
  intermediate points and does **not** reproduce the full CPU event/bisection
  near tangencies. Its results MUST be judged against CPU, including ground
  contact evidence, rather than assumed certified.
- The GPU uses f32 arithmetic even with Kahan position compensation. Fixed
  precision may prevent satisfying 1e-7 rad and millimetre-level event gates,
  especially for long paths or ground endpoints. A failed strict gate is a
  scientifically useful outcome, not permission to loosen the checks after
  seeing results.
- The shader is compiled through `device.createShaderModule`, inspected with
  `getCompilationInfo` where supported, and used in compute pipelines on the
  browser device. The Node test mock only exercises JavaScript orchestration,
  **not a real WGSL compiler**; runtime WebGPU compilation and numerical
  outcomes remain explicitly unverified in the authoring environment.
- Test GPU limits, background browser contexts and driver failures separately.
  An available WebGPU API alone never authorizes production selection.

## Next step (conditional)

Review the exported **real-browser** #140.12 report before planning any
new patch. If it fails numerical gates, identify whether root coverage, f32
precision or first-contact detection caused the failure. Only if stage gates
pass should the project proceed to async optical-scene preparation and a
fallback-capable optional backend. Do **not** integrate `solveBatch` into
`OpticalSharedRayField` or synchronous rendering merely because WebGPU exists.
Keep the **single** `tools/webgpu-optics.html` page for future diagnostics.

## Follow-up #140.12.5 — one-session shooting scaling

The #140.12.5 research mode reuses the original `residual-stop` WGSL shooting
algorithm without changing its physical integration or tolerance. The research
API `createSession(capacity, deps, options)` creates a single bounded WebGPU
session with two reusable pipelines and one set of buffers sized for up to
1024 targets. `session.solve(request, {warmRepeats})` accepts successively
larger batches without recompilation, reports wall-clock phases (upload,
encode/submit, wait/readback) and raw-output bitwise repeat stability, and
`session.close()` releases resources. The legacy one-shot `solveBatch` remains.

The existing canonical `tools/webgpu-optics.html` now includes a scaling
mode with 64, 128, 256, 512 and 1024 ray batches. Larger cases are **exact
replications of the 64 existing tower targets** to isolate size scaling; they
are not more independent geometry or full frames. For each size the CPU f64
batch is measured separately once. The GPU's launch-angle image proxy is
assessed on the original 64 rays with a default illustrative **1 px** budget,
plus independent CPU replay for those 64 rays outside timed GPU runs. Repeat
stability and unchanged outputs for the first 64 rays across batch sizes
are reported. A GPU wall-clock phase may contain scheduling/queue waits;
these are not pure device-time GPU timestamps.

This produces **`PERFORMANCE_PROFILE_ONLY`**, not a full-frame image
comparison, rendered silhouette test, or permission for GPU production
routing. The old 2× cold gate remains in archived historical tests but is
**not** a gate for the profiling report. Browser results must be uploaded
before drawing conclusions about real GPU/CPU throughput or frame quality.

## #140.12.6 — dense physical tower-edge shooting (research only)

The prior #140.12.5 browser measurements showed **11.93× Flat / 11.53× Globe
warm GPU shooting speedup at 1024 rays** on Intel Gen12 LP, but those batches
repeated the same 64 targets. The next test removes that limitation without
changing production optics or introducing new application modules.

- The **existing** `tools/generate-webgpu-scene-targets-14010.js` also samples
  twelve subdivisions of each physical object polygon edge **before** optical
  coordinate transformation. The existing reference JSON retains its original
  64 vertices verbatim and includes a new set of **1024 unique** polygon-edge
  points for Flat and Globe. These are actual points on original physical
  boundaries, not interpolations between separate towers or repetitions of
  the same 64 rays. Regenerate using the existing fixture generator.
- The existing `CurvatureWebGPUPhysicalTolerance14123.js` exposes
  `runDensePerformance()`: nested, deterministic bit-reversal ordering spreads
  target selections across the scene while keeping every earlier batch prefix
  identical. Sizes are 64 / 128 / 256 / 512 / 1024, configurable up to 1024.
  One WebGPU device/pipeline/buffer session per scene; independent CPU f64
  shooting baseline per size; separately recorded browser warm timings.
- At the largest batch, a **1D vertical projected visible-target point-occupancy
  diagnostic** compares CPU/GPU visible sample rows, including strict sample-row
  occupancy differences and unmatched rows outside a **1 px** neighborhood.
  Every unresolved or differing visibility classification remains listed for
  review, regardless of angle shift. CPU ground replay is capped at 24
  contentious targets and happens **outside** GPU timings. The existing HTML
  shows magnified CPU/GPU/discordant projected target-row strips to inspect
  gross mismatches. **These are not actual silhouettes or rendered images.**
- The eleventh experiment mode lives in the **same**
  `tools/webgpu-optics.html`; export
  `curvature-webgpu-optics-140.12.6-dense-performance.json`.
- `DENSE_PROFILE_REVIEW_ONLY` does **not** establish frame parity, FPS, complete
  occlusion equivalence, or authorize GPU production rendering. Actual
  application projection, filled geometry, clipping, painter, async orchestration,
  driver-dependent rendering and full-frame timing remain separately untested.
  Node tests validate construction/orchestration, not real WGSL execution.
