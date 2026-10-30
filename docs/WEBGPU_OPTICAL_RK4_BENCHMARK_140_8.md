# #140.8 — Isolated WebGPU optical RK4 batch benchmark

## Purpose and non-goals

The #140.3 cold optical profiler measured hundreds of milliseconds in exact
shooting, including over 100,000–250,000 RK4 calls for realistic scenes. In
#140.4–#140.7 the CPU shooting path was qualified and its bracket boundary
repaired. GPU compute is now tested **in isolation**; no production optical
solver, caching, scene geometry, renderer, or existing UI is changed.

This is a controlled **independent fixed-step initial-value batch**, not the
full target-shooting problem. GPU threads each integrate their own ray
sequentially. There is no parallelism among the steps of *one* ray.

## Run in browser

From the repository root:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/tools/webgpu-optics-1408.html` in an eligible
WebGPU-enabled browser (secure context: localhost). Choose atmosphere,
Flat/Globe geometry, number of independent rays, RK4 steps per ray, step
length and repeats; click **Run CPU + WebGPU comparison** and **Export JSON**.

Start with **Vacuum / Flat**, `count=1024`, `steps=256`, `step=50 m` to check
the execution plumbing; then compare `standard`, `exponential-occlusion`,
and `inverse-spherical` on Flat/Globe. Repeat with longer paths (e.g.,
`steps=2000`) to reveal accumulated f32 drift. Set numerical tolerances for
the intended output rather than assuming that a GPU result must be valid.
All inputs and both tolerances are recorded in the exported report.

## Numerical contract

- CPU reference: `CurvatureRayTracer.prepareStepper`, same production **f64
  RK4** recurrence, on **f32-quantized initial state vectors**.
- GPU: WGSL `f32` derivative/RK4 for the supported `vacuum`, `standard`,
  `exponential-occlusion`, `inverse-spherical` refractive profiles. Flat uses
  `h=z`; Globe uses the stable local-curvature metric formula. Each output is
  `[x,z,vx,vz]` with the direction normalized **after every RK4 step**.
- Test vectors are deterministic, span near-horizon launch angles
  -0.012..+0.024 rad, and start at `x=0` and the selected observer height.
- All rays have identical step count; there is no event handling, ray
  termination, target seeking, ground crossing, occlusion or branch search.
  **A mathematical trajectory can pass below the opaque ground; it is not
  evidence of visibility.**
- Fail-closed gate: report `qualified=false` if *any* ray's final position
  or direction angle exceeds the supplied absolute tolerance, or a
  nonfinite result occurs. Default tolerances: 0.1 m and 1e-5 rad.
  Also reports maxima and p95; a finite sampled gate is **not a global
  numerical or physical correctness proof**.
- The WGSL shader must compile **on the actual target browser** before a
  genuine GPU measurement is available. Node mocks test host wiring, not WGSL.

## Performance contract

- `cpuMedianMs`: wall-clock time for CPU ray integration (same seeds, count,
  step length and step count).
- `gpuUploadToReadbackMedianMs`: wall-clock time from staging input/config
  upload, through compute submission, to reading/mapping all output states.
  It is **not** a pure shader-duration / GPU timestamp.
- `deviceAcquisitionMs` and `pipelineSetupMs` are measured separately for
  one-time startup overhead. A warm-up GPU dispatch is excluded from medians.
- `ratioCpuToGpu` is only a **wall-clock batch ratio**, not an application
  FPS improvement; it is irrelevant to production promotion unless the
  numerical gate passes and full target-shooting/ground logic is accounted for.
- Browser GPU presence does not establish dedicated GPU hardware acceleration.
  Hardware status stays `unverified`.
- Workload limited to 12 million steps and 65,536 rays, to avoid accidental
  runaway benchmarks.

## Verification performed in this patch

`node --test tests/WebGPUOpticalBenchmark1408.test.js` checks deterministic
seed/config packing, exact CPU prepared-stepper equivalence for all four
profiles on Flat/Globe, vacuum straight-line invariance, strict numeric
rejection, invalid workloads, an unavailable WebGPU path, and the host-side
buffer/dispatch protocol with a fake GPU. **A fake device is not a GPU test.**

The environment used for authoring may not provide a working browser GPU
adapter; until an actual user-browser JSON is available, **no real GPU speed
or numerical parity is claimed**. The standalone benchmark reports actual
hardware execution and compilation failures at runtime.

## Promotion policy

Neither passing this benchmark nor a wall-clock GPU speedup permits selecting
GPU for production optics. A future step must establish physical precision
under target shooting, early ground events, branch ambiguity, critical grazing
and large-distance rays, then measure overhead for actual scene jobs. The
opt-in engineered CPU predictor remains unchanged/disabled by default.

## #140.8.1 browser compatibility correction

Opera exposed two independent blockers in the initial browser run:

1. The WGSL compiler rejected assignment to a two-component vector swizzle
   (`out.zw=...`). The direction normalization now writes `out.z` and
   `out.w` separately, preserving the intended arithmetic.
2. Several HTML number inputs used integer or fractional `step` constraints
   incompatible with their own defaults (for example `min=0.001`, `step=1`,
   `value=50`). Physical quantities and numerical tolerances now use
   `step="any"`; counts remain integers. Numeric values are read through
   `HTMLInputElement.valueAsNumber` so localized decimal presentation does not
   require manual string parsing.

The new Node tests guard these browser-facing contracts and confirm that
shader compilation diagnostics are surfaced before dispatch. **They do not
compile WGSL on a real GPU.** The shader must still be run in Opera or another
WebGPU-capable browser; no hardware results are asserted by this patch.
