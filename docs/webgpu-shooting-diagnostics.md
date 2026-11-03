# #140.12.1 — independent GPU shooting discrepancy diagnostics

**Status:** diagnostic instrumentation implemented; new browser run required.
**Scope:** experimental #140.12 independent GPU shooter, not the parked #140.10
GPU-assisted CPU warm-start approach. **No production code, physical model,
comparison tolerances or release gates were changed.**

## Observed reason for the investigation

The user-provided native-browser `curvature-webgpu-optics-140.12-independent-shooting.json`
(2026-10-30; Intel Gen-12LP) reports 64 production 12-tower mesh targets in
each scene:

| Observed quantity | Flat | Globe |
|---|---:|---:|
| CPU batch | 34.7 ms | 56.8 ms |
| GPU cold | 867.5 ms | 71.3 ms |
| GPU setup | 826.5 ms | 18.9 ms |
| GPU upload/dispatch/readback | 41.0 ms | 52.4 ms |
| Cold speedup | 0.040× | 0.797× |
| Status mismatches | 4 | 3 |
| Angle mismatches | 54 | 53 |
| Residual mismatches | 3 | 0 |
| First-ground event mismatches | 4 | 6 |
| Unresolved | 3 | 3 |
| Max angular difference | 4.8832e-5 rad | 4.8837e-5 rad |

The existing, predeclared decision **`BATCH_NUMERICAL_STOP` remains binding**.
The aggregated report cannot identify whether the discrepancies come from root
coverage, root refinement, `f32` numerical precision or first-ground sampling.
The extreme Flat setup time does not by itself establish that the warm solver
is slow; it also does not override failed numerical parity.

## New observability (not a new shooting algorithm)

The #140.12 refinement shader now writes observability into previously unused
result-buffer slots. It does not change how candidate brackets are selected,
root angles are refined, ground events are sampled or statuses are assigned:

- `bracketIndex`: the selected 0-based interval from the **33-angle** sweep;
  `-1` means no interval was selected. A bracket is an interval of a sign
  change in the sampled residuals, **not a certificate** of a unique root.
- `bracketCount`: number of detected sign-changing intervals for that target.
  It is not a complete multipath count, and tangencies may not be captured.
- `refineIterations`: bisection iteration count for the selected bracket;
  at most 28. Invalid arrival can terminate refinement early.
- `finalBracketLowRadians`, `finalBracketHighRadians`, and
  `finalBracketWidthRadians`: the final retained interval. A narrow interval
  does not establish CPU parity if the GPU model has `f32` drift.
- `rawStatusCode`, `rawArrivalValid`, `rawGroundContactCode`: GPU output
  classifications **before** the strict #140.11 decoder rejects a result.

The diagnostic report contains a `perTarget` entry for **every** indexed target
(in original fixture order), with the target's `[x,z]` coordinates, CPU and GPU
statuses, angles, residuals, path lengths and first-ground evidence, raw GPU
search metadata, numerical deltas and `flags`. To avoid drift in tolerances,
each target's flags are computed via the **same**
`CurvatureOpticalBatchContract1411.compare()` method used for aggregate
qualification. Flag names are `statusMismatch`, `angleMismatch`,
`residualMismatch`, `groundEventMismatch` and `unresolved`.

**Interpretation:** flags localize *where* disagreement occurs, not its cause.
`bracketIndex = -1` is useful root-coverage evidence; many full-28-iteration
refinements with relatively wide brackets suggest inadequate convergence;
a tiny bracket with persistent angular mismatch points toward model or
precision disagreement. None of those interpretations alone proves causality.

## Repeat timing methodology

For each scene, #140.12.1 runs the independent CPU reference **once** and
creates one WebGPU adapter/device, two pipelines, bind groups and five buffers.
It then submits the same two-stage shooting workload **four** times:

1. **First pass:** reports `gpuSetupMs`, `gpuUploadToReadbackMs` and
   `gpuColdMs` using the original definitions and the first GPU result.
2. **Three repeated passes:** re-upload input/config and run both GPU stages
   with the **same pipeline and resources**; map/copy results after each pass.
   Report `warmRunMs` (three samples), `gpuWarmMedianMs`, `warmSpeedup`, and
   `warmOutputBitwiseStable` against the first pass.

`warmOutputBitwiseStable` uses raw output-bit comparison to detect differences
between runs; it is a *repeatability* check, not a correctness check. Any
instability blocks the diagnostic performance interpretation. Measurements are
wall-clock upload+dispatch+readback, *not* GPU timestamp queries, shader-only
time, GPU utilization, frame latency or an end-to-end Scene/Compare test. The
single CPU measurement and three warm GPU samples are not a statistically
controlled CPU/GPU benchmark. Browser/driver caches and scheduling may affect
times. These data are **diagnostic**, not a new performance authorization gate.

## Run / export

Serve the repository locally and open
`http://localhost:8000/tools/webgpu-optics.html`. Select
**#140.12.1 — per-target parity and warm timing**, click
**Run #140.12.1 detailed parity + warm timing**, and export
`curvature-webgpu-optics-140.12.1-diagnostics.json`.

The older #140.12 mode remains available in the same selector and continues
to export its original file. **Do not create separate HTML pages in `tools/`**.
The #140.12.1 JSON should be inspected before changing angle sweep density,
refinement, precision or first-ground event handling; change only one testable
hypothesis at a time.

## Verification and limits

Node tests check telemetry layout, per-target flags, repeat-run resource reuse,
error handling, old-mode compatibility and browser button wiring. A mock
WebGPU device does **not** compile WGSL or measure real GPU execution.
Actual shader compilation, measured `warmRunMs` and physical agreement must be
verified in a real WebGPU browser. The old numerical decision is not revised
without new evidence. **CPU production solver/renderer stay authoritative.**
