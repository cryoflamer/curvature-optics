# #140.9.1 — Final bounded WebGPU f32 coordinate-drift diagnosis

## Starting point (measured by the user, Opera / Intel Gen-12LP)

The exported #140.9 matrix (`curvature-webgpu-optics-140.9-matrix.json`)
completed all **18** cases: **10 passed**, **8 failed** the preselected absolute
**0.1 m** position / **1e-5 rad** angular tolerances. The eight failing
cases were **all eight 100-km** mathematical paths (2,000 × 50 m).
Normal 12.8-km cases and both batch-scaling cases passed.

- Vacuum/Flat and Vacuum/Globe, 100 km: **2.64655 m** maximum position error,
  despite near-zero angular difference. They need **no atmospheric physics**.
- Standard/Flat long: **2.87428 m** max position error; measured batch speedup
  about **30.24×** (166.3 ms CPU vs 5.5 ms GPU; excludes WebGPU setup).
- The Standard/Flat normal batch reached **21.77×** and passed numerical gates.
  Large 4,096-ray batch reached **83.85×**; not an end-to-end scene speedup.

**Hypothesis, not proof:** f32 adds ∼50 m per step to an ever-growing
coordinate (up to ∼100 km). At larger coordinates its representable spacing
approaches millimetres, so rounding accumulates over 2,000 steps. Near-zero
Vacuum angular drift supports this hypothesis but does not rule out other f32
losses (RK4 intermediate stages, refraction, shader optimizer, etc.).

## Exactly one opt-in correction

The default #140.8 shader is **not changed**; the original `advance` and
main loop remain the default. `CurvatureWebGPUOpticsBenchmark.run({
accumulation: 'compensated' })` selects a second WGSL shader. It uses **the same
four-stage RK4 and the same derivative/atmosphere calculations** but computes
the RK4 increment before adding it to the position and uses a two-component
Kahan correction (`x` and `height`) when accumulating the position. Direction
updates are unchanged. The `accumulation: 'naive'` mode is the explicit
baseline; omitted accumulation maintains the pre-#140.9.1 default. The host
CPU reference remains the unmodified f64 `OpticalRayTracer.prepareStepper`.

An independent **Vacuum straight-line analytic reference** is computed from
the *same f32-quantized seed*, using f64 calculations and the normalized seed
direction, **without calling RK4**. Both CPU-vs-analytic and GPU-vs-analytic
are reported in Vacuum/Flat and Vacuum/Globe, long and normal. This diagnostic
is not a general analytic solution for refracting atmospheres. Offline Node
unit tests verify the CPU long-path Vacuum agreement to <0.001 m; actual WGSL
and hardware accuracy can only be confirmed in the browser.

## Single reproducible browser run

From the repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/tools/webgpu-optics.html` in Opera, keeping
the **same 0.1 m / 1e-5 rad tolerances** and **5 repeats** used in #140.9.
Click **Run final 18-case paired diagnostic**; then **Export #140.9.1 JSON**.
It executes the **same 18 fixed scenarios** twice (baseline and compensated),
exports per-case CPU and upload-to-readback GPU times, position and angular
errors, Vacuum analytical comparisons, and a fail-closed decision. It
preserves the source report's near-horizon seed angles, geometric parameters
and RK4 step sizes. Stopping after a comparison yields `INCONCLUSIVE`.

WebGPU device/pipeline creation still occurs for each mode/case and is
reported separately; CPU and GPU timings are browser wall-clock, not shader
isolated timestamps. WGSL compilation on the user's actual GPU is necessary.

## Stop decision — after THIS diagnostic, no further microbenchmarks

- **`INCONCLUSIVE`**: missing/errored/unavailable **paired** results, missing
  analytic Vacuum checks or cancellation. Do **not** accept the GPU result or
  reclassify missing evidence as success. A single environment repair to
  complete the originally specified run is permitted; no new algorithmic
  explorations.
- **`NUMERICAL_STOP`**: **any** compensated path exceeds either unchanged
  numerical tolerance, reports non-finite values, or fails the independent
  Vacuum analytic check. **Stop this f32 GPU RK4 branch.** Retain CPU; document
  numerical limitations. Do not loosen thresholds after seeing the result.
- **`PERFORMANCE_STOP`**: all numeric checks pass but either predeclared
  Standard/Flat normal or long batch performs under **3×** CPU/GPU speedup
  after the correction. Stop this GPU optimization branch.
- **`SPIKE_CANDIDATE`**: **all 18** corrected cases plus independent Vacuum
  checks pass, and **both** representative batches reach **≥3×**. **Stop all
  isolated RK4 benchmarking.** Permit at most **one bounded opt-in real-scene
  GPU integration spike**. This is **NOT** permission to change production
  defaults.

The single optional integration spike must qualify agreed real scenes for
shooting, ground events, occlusion, near-grazing/multipath, CPU/GPU parity and
cold/warm full-scene timing. Require **≥2× cold end-to-end scene-optics** gain,
no visibility regression and no degraded typical/warm experience; at most
one targeted correction and requalification. Otherwise retain CPU and close
the GPU branch. Actual representativeness of 100-km mathematical stress tests
for the production scene remains an open engineering question; the fixed
qualification gate must not be silently relaxed.

## Verification scope

- `node --test tests/WebGPUOpticalPrecision14091.test.js` checks deterministic
  baseline selection, shader construction, independent analytic Vacuum CPU
  comparisons, a representative f32 Kahan arithmetic sanity test, decision
  stop rules, error/cancellation handling, and browser UI contract.
- These tests **do not compile or run WGSL on a real graphics adapter**.
  The actual GPU shader may still fail or perform differently.
- No shooting, surface events, production renderers, GPU backend switching or
  physical model constants are changed.
