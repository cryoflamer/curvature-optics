# #140.9 — WebGPU optics: finite qualification and explicit stopping rules

## Why one more experiment, and why stop here?

The user-browser #140.8 result on Intel Gen-12LP / Opera, **Standard / Flat**,
1,024 independent rays × 256 RK4 steps × 50 m, gave CPU median **66.9 ms**
versus WebGPU upload-to-readback median **4.7 ms** (**14.23×**). All 1,024
rays passed the user-selected tolerances (maximum position difference
**0.04855 m**; maximum angular difference **2.28e-7 rad**). This is one
promising finite sample, not an end-to-end speedup or physical certification.

#140.9 deliberately limits additional exploratory work to **one matrix**
with an exportable, fail-closed decision. No new GPU model or production
behavior is introduced. The existing #140.8 benchmark runs unchanged.

## Matrix — 18 cases, no open-ended parameter hunt

| Cases | Atmospheres | Geometry | Rays | RK4 steps | Step | Path length |
|---|---|---|---:|---:|---:|---:|
| 8 normal | Vacuum, Standard, Exponential occlusion, Inverse spherical | Flat and Globe | 1,024 | 256 | 50 m | 12.8 km |
| 8 long | same | Flat and Globe | 256 | 2,000 | 50 m | 100 km |
| 1 small | Standard | Flat | 128 | 256 | 50 m | 12.8 km |
| 1 large | Standard | Flat | 4,096 | 256 | 50 m | 12.8 km |

For each case, default **five repeats** measure browser wall-clock CPU f64
and GPU f32 from the same f32 initial states. Adjustable shared absolute
numerical tolerances are **0.1 m** and **1e-5 radians** (defaults). Users may
raise repeats to 10 for a confirmation run; this is not a new study design.
Both the case identities and the selected tolerances are exported with results.

**Caveats:** The long run extends *mathematical* paths to 100 km. It does not
terminate at ground crossing, so some trajectories may be physically occluded.
The input rays cover only near-horizon angles. This is a numerical drift
stress test, NOT a test of actual 100-km visibility, multipath, terrain,
shooting or exact grazing. All f32 position differences are measured against
the unchanged CPU f64 reference, not ground truth. GPU setup (adapter and
pipeline) is repeated per case and excluded from the reported median ratios;
upload and readback are included. This reports neither shader-only timing nor
GPU hardware verification. A device or WGSL failure is always reported.

## Run

From repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/tools/webgpu-optics.html` in Opera or another
WebGPU-capable browser. Set tolerances to the actual intended application
requirements; record them rather than loosening after a failing result.
Click **Run 18-case qualification** and after completion **Export matrix JSON**.
The progress line names the active case. **Stop after current case** exports
partial results with an `INCONCLUSIVE` decision; it does not force-interrupt a
running WebGPU dispatch. The report contains all cases, raw per-case timing
samples, numerical errors, and a summary decision.

## Predeclared decision and stopping gate

The exported `decision.verdict` has exactly these outcomes:

1. `INCONCLUSIVE`: missing, aborted, unavailable or errored cases. No promotion.
   Repeat only the missing/unavailable/errored cases when the environment is
   repaired; do not reinterpret these as passes. The tool currently reruns
   the fixed full matrix rather than resuming individually.
2. `NUMERICAL_STOP`: one or more completed cases fail the declared numerical
   tolerance/non-finite checks. **Stop GPU promotion.** If economically
   justified, investigate a specific reproducible failing case before any
   further GPU work. Do **not** silently loosen tolerances or treat finite
   samples as proof. A targeted correction is a separate decision.
3. `PERFORMANCE_STOP`: all numerical cases pass, but either preselected
   **Standard/Flat normal** or **Standard/Flat long** batch has an upload-to-
   readback CPU/GPU wall-clock speedup below **3.0×** (or no valid positive
   ratio). Stop further speculative GPU integration unless real scene
   profiling demonstrates a materially different workload. The 3× threshold
   is a practical *engineering heuristic*, not a scientific constant.
4. `SPIKE_CANDIDATE`: all 18 numerical cases pass and both representative
   workloads achieve at least **3.0×**. **Stop isolated microbenchmarking.**
   Authorize **one** time-bounded, opt-in *integration spike*, not production
   activation: integrate batched shooting/evaluation and boundary/occlusion
   behavior with comparable CPU output and record cold/warm real-scene timing.

`decision.productionAuthorized` is **always false** in #140.9. Numerical
accuracy for all possible trajectories is not established by a finite matrix.
Also, threshold satisfaction is not proof of stable real-world performance.

## Stop rule for the single possible integration spike

Before performing a later production-oriented spike, fix **representative**
scene workloads and a numeric/visibility parity protocol. Keep the CPU path as
reference and preserve the existing CPU default. The spike is worth merging
only if BOTH apply:

- **Correctness:** no new visibility/ground classification regressions or
  unacceptable coordinate/angle deviations in the agreed real-scene suite,
  including near-grazing and multipath-sensitive cases; no unsupported cases
  silently passed as equivalent. This requires more than the #140.9 matrix.
- **Benefit:** at least **2×** cold end-to-end scene-optics speedup for the
  predeclared representative scenarios (including dispatch, upload/readback,
  startup amortization and CPU orchestration), without worsened normal/warm
  user experience. Report typical and tail times, not just best-case GPU runs.

If either condition fails, **stop and keep the existing CPU production path**.
Allow at most **one focused correction + complete requalification** when a
specific defect is identified; then choose merge/retire instead of extending
an unbounded sequence of exploratory patches. This is a project-management
stop policy, not a claim that a defect cannot be fixed after further research.

## Verification limits

`node --test tests/WebGPUOpticalMatrix1409.test.js` verifies the matrix,
control guards, success/failure/missing/performance decision gates, cancellation,
per-case exceptions and browser contract. A mock runner verifies orchestration,
**not** actual WGSL compilation, GPU performance or precision. Only the
exported user-browser matrix can answer those questions. No production files
or defaults are modified.
