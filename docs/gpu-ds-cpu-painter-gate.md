# #140.12.40 — Real-scene GPU double-single shooting feasibility gate

## Why this is a gate, not a completed GPU painter

The requested end goal is **the existing CPU f64 RK4 target shooting, visibility,
adaptive projected polygon construction and Canvas painter**, with only the point
shooting performed as large WebGPU double-single (DS) batches. It would allow
actual CPU/GPU frame PNG parity and fair cold/warm timings.

**That end goal is not yet implemented.** The GPU DS solver already present in
`CurvatureGpuHighPrecisionShooting141232.js` is a **bounded radial Bouguer
quadrature/secanter**. It is not the CPU solver in
`OpticalTargetProjection.js`/`OpticalRayTracer.js`: the GPU code does not
integrate the same RK4 state equations, use the same forward-x bracket search,
refine the same finite-path endpoint, or certify first-ground events with the
same grazing/endpoint logic. DS arithmetic improves precision but does not
magically make these different solvers equivalent.

The gate exercises the best available real GPU DS code on **48 points sampled
from the actual authored physical tower/foundation edges**, compares their
launch directions and candidate contact flags against the same-target CPU f64
RK4 solver, and always marks the results `eligibleForCpuPainter:false`.

## UI

In Modern Compare, select GPU probe / Globe / standard atmosphere, then click:

> Audit CPU f64 vs GPU DS · real-scene shooting gate · PNG + JSON ZIP

The button produces `curvature-compare-140.12.40-gpu-ds-painter-gate.zip` with
these files:

- `results.json`: target lineage, full per-ray CPU and GPU measurements,
  projected screen-space differences, status gates, timings, capabilities.
- `cpu-reference.png`: actual unmodified Compare A Canvas image.
- `cpu-f64-ray-positions.png`: 48 CPU f64 angles projected onto a white canvas.
- `gpu-ds-ray-positions-NOT-a-frame.png`: 48 GPU DS root angles projected onto
  a white canvas; **not a rasterized GPU object frame**.
- `visibility-and-pixel-disagreement-SAMPLES-ONLY.png`: ambiguous/unresolved or
  displacement/mismatch markers at sampled directions; not an occlusion mask.
- `performance-48-target-batch.png`: GPU DS compile, 256/512-node dispatch +
  readback, and independent CPU shooting (bar ordering explained in README).
- `README.txt`: provenance, limitations and image legends.

The GPU launch seeds are straight-line angles from original metric target
coordinates, never CPU shooting roots. CPU roots are evaluated **after** GPU.
Only physically authored vertices or points interpolated along original authored
edges are used. A deterministic distance-ordered subset picks 48 distinct
points including near and distant towers if both exist.

The accepted domain is limited: spherical Globe, standard exponential
atmosphere, observer height between 0 and about 147 m, monotone radial-leg
trajectories, target heights in `[0,min(200 m,0.02H)]`, angular magnitude below
0.54 rad, no radial turning points. If the user scene supplies fewer than 48
eligible points, it fails visibly rather than making up synthetic scene targets.

The original shader only supports **48 targets per request**. Measurements for
64/256/1024/4096 are explicitly `not_supported` / `durationMs:null`, never
invented. The `gpu-ds.png`, `difference.png` and GPU full-frame visibility map
that a final exact-shooting implementation would generate are **not present**,
because no genuine CPU-equivalent GPU DS-painted frame exists.

## GPU timing boundaries

The DS 256- and 512-node times are GPU dispatch **through readback**, not pure
GPU execution. Shader compilation and CPU reference timing are separate.
Measurements cover different algorithms and cannot yet prove full-frame GPU
speedups. The CPU image is captured before the comparison and is not repainted
in the timed CPU 48-target oracle.

## Next required port (not bundled in #140.12.40)

1. Port the same stable `metric2`/`derivative`/normalized RK4 stepper to DS WGSL;
   validate every helper and live WGSL compilation.
2. Port the CPU first-forward-x bracket, regula falsi, path-length endpoint and
   first-ground event finder. Return `solver_failed` or `indeterminate` when
   GPU cannot certify the original CPU statuses.
3. Match adaptive exact requests in `OpticalSharedRayField` without hidden CPU
   fallback, and prove status/topology equivalence on original tower geometry.
4. Reuse the untouched polygon builder and Canvas painter; then export *actual*
   `cpu-reference.png`, `gpu-ds.png`, `difference.png` and full-frame timing.
5. Measure warm/cold costs for real batch sizes 64/256/1024/4096, excluding no
   extra CPU work from one variant while including it in another.

No production solver, optics, painter, render backend, WGSL or canonical
`tools/webgpu-optics.html` page is modified by this diagnostic.
