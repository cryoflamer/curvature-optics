# #140.12.3 — Physical 5 mm qualification of independent WebGPU shooting

Status: **experiment only; production CPU solver retained**.

## Why this stage exists

The application's `targetTolerance: 0.005` metres is an **intentional**
shooting criterion, not an accidental shortcut. The #140.11 strict experimental
angle-parity tolerance of `1e-7` rad compares selected CPU and GPU solutions,
but **does not follow** from the desired 5 mm accuracy. Likewise, the
*difference* between two residuals can exceed 5 mm even when **each** solver
meets its own 5 mm residual bound. The #140.12.2 narrow-angle policy is retained
as an opt-in numerical A/B diagnostic, not promoted as a physically required
production precision.

This stage restores the original `residual-stop` GPU shader (`WGSL_REFINE`)
and does **not** modify its physics or integration. It tests *physical target
adequacy* separately from *comparative angular similarity*:

1. The separate CPU reference and the GPU-reported final arrival must each
   have `abs(residual) <= targetTolerance` (0.005 m in the real-scene fixture).
2. A third, **independent f64 CPU ray trace at the GPU-computed angle**, with
   unchanged geometry/atmosphere and no shooting-angle search, must also meet
   the same target-x **height** tolerance. A GPU self-reported residual alone
   cannot verify that its f32 trajectory agrees with the reference model.
   Starting at the GPU-reported path length, an f64 RK4 endpoint correction
   solves for the same target x. An invalid/unfinished replay fails closed.
3. Visibility status must agree. `solver_failed` or `indeterminate` on either
   side is unresolved and cannot pass.
4. First ground-hit existence, event contact (`crossing` / `grazing`), and
   first-event path length must agree within the separately retained 0.001 m
   event tolerance. **5 mm shooting accuracy does not waive visibility or
   first-ground-event checks.** CPU ground-level targets deliberately use a
   stricter internal boundary solve tolerance to avoid false prior crossings;
   the GPU has not yet implemented equivalent classification.
5. The old `contract.compare` 1e-7 rad angle counter and difference-of-residuals
   counter remain in `strictParityDiagnostic`, **never** entering the new
   physical-acceptance decision. All target-level flags and GPU-angle CPU
   replay residuals are exported for diagnosis.
6. Only after numerical / ground / repeat stability pass do we inspect the
   **unchanged 2x GPU cold-stage** speed threshold for *both* scenes. Warm
   times (3 repeats reusing GPU pipelines and buffers) are exploratory.
   There is no full-scene/frame performance claim or production enablement.

### The separate CPU replay is NOT GPU-path certification

The timed GPU execution remains GPU-only (sweep, refinement, ground sampling,
readback). CPU reference shooting and CPU replay are outside its measurements,
are included only in the diagnostic report, and cannot silently substitute
for a production GPU-first algorithm. A stage pass is **not** production
approval, and the bounded 33-angle sweep is not a multipath proof.

## Existing real-browser evidence reinterpreted

User-run #140.12.1 report `curvature-webgpu-optics-140.12.1-diagnostics (1).json`
(Intel Gen-12LP, 2026-10-30; 64 mesh targets each Flat and Globe):

| Metric | Flat | Globe |
| --- | ---: | ---: |
| CPU reference time | 28.7 ms | 51.8 ms |
| GPU cold time | 59.0 ms | 56.6 ms |
| GPU warm median | 23.9 ms | 36.0 ms |
| Warm CPU/GPU ratio | 1.20x | 1.44x |
| Max **individual GPU residual** | 3.900 mm | 3.633 mm |
| GPU results exceeding **5 mm** | **0** | **0** |
| Strict diagnostic angular discrepancies | 54 | 53 |
| CPU/GPU visibility status mismatches | 4 | 3 |
| Ground event discrepancies | 4 | 6 |
| Unresolved targets | 3 | 3 |

On the **uploaded report** (without rerunning a real GPU), independent f64
CPU replays of the recorded GPU angles found one additional target-height
failure on **Flat target #54**: GPU's own residual is +3.407 mm, while its
angle traced in the independent CPU model misses by about **5.172 mm**.
Globe has no >5 mm replay residual among the 64 supplied angles. This is
one reason that merely dropping the angular-parity gate would be unsafe.
Independent CPU replay is not a substitute for ground/contact qualification;
status mismatches remain and are a stage stop.

The warm ratios are not a qualification win: the declared **cold** 2x gate
is not reached (Flat 0.486x, Globe 0.915x), and warm timings exclude real
scene composition, rendering, and async orchestration. Hardware and driver
properties beyond the reported adapter identification are not asserted.

## New browser run

Serve the unchanged repository with `python3 -m http.server 8000` and visit:

`http://localhost:8000/tools/webgpu-optics.html`

Choose `#140.12.3 — physical 5 mm qualification`; Run; export:

`curvature-webgpu-optics-140.12.3-physical-tolerance.json`

The new JSON has, per target, individual CPU/GPU residuals, CPU replay of
GPU angle (including endpoint-correction evidence), explicit physical failure
flags, and the retained strict angular diagnostics. CPU replay verification
is timed and identified separately from GPU time. Missing GPU support or
shader failure yields `INCONCLUSIVE`, never a made-up pass.

## Verification boundaries

Node tests check API/contract logic, vacuum analytic replay, strict failure
cases, recorded target #54 replay, legacy shader preservation, and actual
inline UI handler registration. They do **not** compile WGSL or replace a
real WebGPU browser run. Previous #140.12.1 GPU results remain historical;
we have **not** claimed #140.12.3 real-browser results. No scene renderer,
production backend, CPU shooting solver, ground finder, or WebGPU WGSL shader
is modified in this patch.
