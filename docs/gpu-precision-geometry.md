# #140.12.29 — GPU precision geometry and input audit

## Scope and executable entry point

Use the opt-in **Compare → CPU / WebGPU → Audit GPU precision geometry · Globe / Flat / hi+lo inputs** action in `CurvatureModern.html`. Export `curvature-compare-140.12.29-gpu-precision-geometry.json` and attach the file for analysis. The diagnostic creates its own three compute pipelines (`f32`, `classic_ds`, `integer_residual_ds`), reuses the **exact WGSL double-single arithmetic helpers from #140.12.28**, and runs 48 targets (six surface arc distances × eight local altitudes).

This is a *geometry-only* experiment; no shooting, first-contact classification, atmospheric integrals or painting is changed.

## Why the four coordinates must be distinguished

For the Globe, the actual `CurvatureSurfaceGeometry.createFromCurvature(1/R).surfacePoint2(d,h)` gives local tangent-plane `(x,y)` for **surface arc length** `d` and radial height `h`. The analytic central angle is `d/R`, and the CPU Cartesian comparison is `atan2(x,R+y)`.

For the GPU, test these alternatives separately:

1. **#140.12.27 f32 normalized baseline**: `atan2(k*x_f32, 1+k*y_f32)`, using the same CPU-f32-packed curvature `k=f32(1/R)` as the original shader.
2. **Direct arc angle**: `d/R`. This requires no trigonometric approximation; measure ordinary `f32` and both double-single versions.
3. **Independent Cartesian check**: `atan(x/(R+y))` from the actual GPU hi/lo Cartesian `(x,y)`. The small positive argument is approximated with `q - q³/3 + q⁵/5`. The omitted term is bounded by `|q|⁷/7` in the accepted range `0<=q<0.016`; its bound is reported in metres along the reference surface. **Do not reuse this approximation for arbitrary near-vertical or backward rays.**

The report keeps **both CPU f64 references**, `d/R` and `atan2(x,R+y)`, and reports their tiny source-geometry discrepancy instead of conflating it with GPU arithmetic error. The independent Cartesian geometry is a *diagnostic cross-check*, not a proposed production formula.

The input experiment compares:

- `R + h` evaluated **on GPU** from independently split `R` and local `h`, followed by subtraction of `R`.
- `R + h` computed in CPU `Number` first, then packed as **a different** hi/lo input, followed by subtraction of `R` on GPU.
- The analogous Flat-coordinate construction from independently split origin `15,000,000.125 m` and local `d`, versus a prepacked absolute `origin+d`.

These paths distinguish: `f32` cancellation, error introduced by splitting arbitrary binary64 into two `f32` limbs, and error introduced before the GPU by first computing a large absolute coordinate in CPU binary64. **A two-limb representation does not reconstruct arbitrary binary64 inputs exactly.** The previous 0.1-m example loses approximately 1.86 nanometres when the precomputed large coordinate is packed; that does not establish a broken two-sum operation.

## JSON and numerical interpretation

`gpuAssistedFrame.summary[mode]` provides maxima in physical metres for polar angle, independent Cartesian polar angle, local radial height, prepacked absolute height, Flat local distance and prepacked Flat distance. `perCase[]` has the signed errors and raw `hi/lo` outputs. `sourceInputDiagnostics[]` records CPU f64 input-split errors and source Cartesian coordinates for each target. Timing includes dispatch and readback (32 benchmark iterations, five warmed samples), not isolated GPU kernel latency. Benchmark iterations change the Cartesian test distance slightly; correctness output always comes from a *single* iteration.

Interpret the metrics in this order:

1. Check `maxOmittedPolarSeriesBoundSurfaceMetres` and CPU scene arc-vs-Cartesian baseline discrepancy.
2. Compare old normalized `f32 atan2` errors against `f32 d/R`, classic DS `d/R` and integer-residual DS `d/R`.
3. Compare DS Cartesian-angle errors; this includes source Cartesian coordinate packing and the bounded arctangent approximation.
4. Compare separate `localHeight` vs `packedAbsoluteHeight` and `flatLocalDistance` vs `flatPackedDistance`, especially for 1 µm and 0.1 m.
5. Assess time only after confirming correctness; kernel-only performance, compile correctness across GPUs and expanded random/adversarial arithmetic vectors remain unverified.

## Stop conditions and next stage

This experiment does **not** establish IEEE binary64 emulation or certify geometric visibility. Its domain is finite, forward, small-angle targets with default Earth radius and origin; it tests the geometry of the existing scene, not refraction or ray integration.

If real WebGPU results establish a stable precision improvement for geometric angles and coordinate differences, use the results to specify **#140.12.30 high-precision shooting**. Keep independent CPU f64 reference and do not silently promote statuses or alter production rendering.
