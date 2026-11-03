# #140.12.2 — WebGPU shooting angle-bracket refinement (A/B, research only)

**Scope:** diagnostic code and the existing `tools/webgpu-optics.html` only. No live
production CPU solver, scene projection, renderer, automatic GPU switching,
shared ray cache or WebGL backend changes. #140.10 warm-start experiment
remains **CLOSED / PARKED**, and #140.12 and #140.12.1 retain their failed
numerical verdict until a new user-run browser measurement shows otherwise.

## Evidence motivating this experiment

The user-provided, real Opera/Intel Gen-12LP #140.12.1 report
(`curvature-webgpu-optics-140.12.1-diagnostics.json`, 2026-10-30) recorded:

| Metric | 64 Flat targets | 64 Globe targets |
|---|---:|---:|
| CPU baseline | 28.2 ms | 44.7 ms |
| GPU warm median | 37.9 ms | 50.1 ms |
| GPU angle mismatches (`>1e-7 rad`) | 54 | 53 |
| GPU status mismatches | 4 | 3 |
| GPU ground-event mismatches | 4 | 6 |
| No-bracket / multiple-bracket targets | 0 / 0 | 0 / 0 |
| GPU final bracket width reported zero | 64 | 64 |

Review of the **actual** #140.12 WGSL shows a deterministic source-level cause
for *premature termination*: bisection stops and forcibly sets `a=b` as soon
as the absolute target-height residual is at most `config[11]`, **0.005 m**
for the scene fixture. But #140.11's separate angle-parity acceptance gate
is **`1e-7 rad`**. For a near target around 56 m away, 5 mm vertical error
can correspond to approximately `0.005 / 56 = 8.9e-5 rad` angular error.
A small arrival residual alone is therefore insufficient for angular parity.

**This establishes a weakness of the termination rule, not the complete
causal attribution of all 107 angular mismatches.** f32 ray integration,
interpolation and geometric differences might remain after root refinement.
The previously displayed zero-width brackets were artificially collapsed
by `b=a` on the residual gate, *not* proof that f32 had exhausted its
representable angle intervals.

## Changed numerical assumption, kept old control

`CurvatureWebGPUBatchShooting1412.solveBatch(request,deps,options)` now accepts
`options.refinement` with two explicitly bounded modes:

- `residual-stop` (default): the numerically unchanged preexisting WGSL kernel,
  including its 5 mm early stop. All historical modes remain reproducible.
- `angle-bracket`: same 33-angle sweep and same compensated f32 RK4 and
  first-ground sampling, but bisection does **not** terminate on a small
  target-height residual. It bisects until the bracket is no wider than
  `2e-8 rad`, the `f32` midpoint becomes an endpoint, or the existing
  28-iteration budget is used. Zero-residual endpoints can be exact roots.
  A failed intermediate arrival is a **fail-closed** solver result; never
  implicitly promoted to visible. The selected final angle is the midpoint
  of the retained bracket. Final arrival still must meet the original target
  residual gate, and ground evidence/status logic is unchanged.

The bound on the final bracket is a **numerical aim**, not a guarantee of
physical CPU parity: a biased or noisy f32 trajectory could produce a narrow
bracket around an inaccurate root. The benchmark expressly measures that.
An interval may also stop at a representability limit above `2e-8 rad`;
the retained (non-forced) interval and per-target telemetry expose this.

The two shaders use separate WebGPU compute pipelines. No CPU root search
is called inside the independent GPU batch; the CPU solver remains an
external reference. Both variants are exposed by a separate A/B module,
`src/diagnostics/CurvatureWebGPURootRefinement14122.js`.

## How to reproduce and interpret

Open `http://localhost:8000/tools/webgpu-optics.html`, select
**#140.12.2 — angle-bracket refinement A/B**, click **Run**, and export
`curvature-webgpu-optics-140.12.2-refinement.json`.

Each scene compares `residual-stop` vs `angle-bracket` on exactly the **same**
64 production-composed targets and the same independently solved CPU batch.
It reports strict #140.11 parity counts and per-target status/angle/residual,
ground evidence, bracket index/count/width, iteration count and change in
angle error. GPU cold and warm timing are reported for each variant;
three repeats reuse the device, pipelines and buffers *within each variant*.
The two variants use distinct GPU device/pipeline sessions. These are
CPU wall-clock upload+dispatch+fence/readback measurements and can be affected
by shader compilation, browser driver caches and ordering; they are **not**
GPU execution-time queries or end-to-end scene/frame timing.

A separate **7-target Flat/vacuum analytical batch** is included to isolate
root refinement from atmospheric refraction and surface grazing. For every
`[x,z]` with observer height `h=15 m`, the known angle is
`atan2(z-h,x)`. The report checks the CPU reference, original GPU and
refined GPU against the *same* `1e-7 rad` angle gate, and records any
unexpected contact/status. It also includes strict CPU/GPU comparisons.
Those targets have positive height and no expected ground contact; passing
this small analytical set does **not** prove grazing/terrain parity.

**Interpretation / next steps:**

1. If the analytical vacuum rays fail, inspect the f32 arrival integrator,
   ray propagation or kernel implementation, before tuning larger scenes.
2. If vacuum passes but scene angular parity still fails, profile the exact
   failing targets against the f32 trajectory and the f64 CPU reference.
3. If angles agree but status or contact fails, isolate the ground-event
   classifier in a subsequent experiment; this patch does not adjust it.
4. Only after numerical parity, assess throughput and end-to-end scene
   integration; the experimental threshold remains **2× cold-stage** speedup.

The A/B verdict **never** grants production use. On missing WebGPU or shader
compiler error, it emits `INCONCLUSIVE` with the failure reason, not imaginary
results. Node tests validate logic, request contracts and orchestration but
cannot establish WebGPU shader compilation or numerical correctness in Opera.
