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

## #140.12.4 addendum — illustrative screen-space impact, not a millimetre veto

The user's **5 mm** shooting tolerance is a practical numerical choice, **not a
claim** that a 5.17 mm replay or a 1 mm ground-contact path discrepancy is
necessarily visible. The #140.12.3 strict physical/ground decision remains
available unchanged as a historical comparison; it is **not** silently
re-labelled as an image-quality judgement.

The same existing `CurvatureWebGPUPhysicalTolerance14123.js` now optionally
accepts `run(fixture, deps, {visual: { ... }})`. This uses the **same GPU
`residual-stop` shader**, separate CPU shooting and warm/cold GPU timings, and
adds diagnostic work **after** the GPU stopwatch:

- Illustrative vertical perspective mapping from launch angle, with explicit
  vertical FOV, camera pitch, viewport height and a chosen pixel budget.
  Offscreen angles are reported as unknown, not automatically acceptable.
- Independent CPU `f64` `trace(..., stopAtGround:true)` at the GPU launch angle
  and length, with the original CPU ground-event detector. Contact locations
  are reported alongside GPU first-ground events; this replay is **not** a
  full visibility certification or a re-shooting search.
- Separate counts for angular-proxy shifts below/above the pixel budget,
  CPU/GPU visibility disagreement, ground evidence disagreement, endpoint
  boundary candidates and cases requiring actual frame review. A candidate
  needs a near-surface target, a small angular proxy and contact within an
  explicit near-target *path* window. A disagreement more than this window
  before the target is **not** an endpoint candidate.
- The previous strict `physical` block is preserved in the output as a
  historical diagnostic, along with `previousPhysicalDecision`. The new
  decision is `VISUAL_PROXY_ONLY` (or `INCONCLUSIVE` / repeat-instability stop);
  `visualEquivalenceProven` and `productionAuthorized` always remain false.

**The illustrative pixels are not real renderer pixels.** They assume an
independent 2D perspective vertical camera and use only launch-angle shifts:
there is no live Bislin camera/WinTrans calibration, mesh silhouette projection,
3D occlusion, per-pixel image comparison, or Scene/Compare integration. An
angular shift under 0.5 illustrative pixels does **not** prove two images
identical, especially when the visible/blocked status changes. The configurable
near-ground 1 cm and near-endpoint 0.1 m windows are exploratory *grouping*
parameters, not changes to the optical model or new correctness limits.

Replaying the previously uploaded #140.12.1 per-target data locally with a
1080 px, 45° FOV, zero-pitch camera proxy yielded **128/128** shifts below
0.5 illustrative px, with maximum shifts **0.06663/0.06664 px** in Flat/Globe.
Three near-endpoint, ground-level discrepancies in **each** scene were tagged
as boundary candidates; Flat #51 was not, because the reported ground event
was around **2.45 m** before its target. These are calculations on an earlier
GPU report, **not** fresh #140.12.4 browser or actual-frame measurements.

Run the **ninth option** `#140.12.4 — screen-space impact proxy` in the
**existing** `tools/webgpu-optics.html` and export
`curvature-webgpu-optics-140.12.4-visual-proxy.json`. The user can change the
illustrative camera and grouping windows to test sensitivity. No new
version-numbered HTML, JS module, test file, or standalone document was created
for this stage; this addendum extends the existing documentation.
