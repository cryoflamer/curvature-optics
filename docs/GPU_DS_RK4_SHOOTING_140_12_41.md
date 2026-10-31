# #140.12.41 — GPU Double-Single RK4: first-forward-x shooting and ground-event gate

**Diagnostic only.** No scene painter, production shooting cache, optical field, WebGPU production renderer or render fallback is modified. Run from `CurvatureModern.html` in Compare A with Globe, standard atmosphere and a positive eye height. Button: **Audit CPU f64 vs GPU DS RK4 + ground events · 48 objects · ZIP**.

## Motivation

#140.12.40 measured accurate angles for only 17/48 real-scene points and 31 unresolved cases. That GPU kernel used *Bouguer radial quadrature*, while the reference `OpticalTargetProjection.solve` uses forward-x tangent-frame RK4, angular bracket/regula falsi shooting and `OpticalRayTracer.trace`'s sampled first-ground-event detector. The methods and branch domains differed. #140.12.41 introduces a separate **software DS WGSL** solver using the CPU algorithm's geometric state and recurrence. It intentionally does **not** modify the Bouguer shader.

## GPU algorithm, coverage and numerical limits

- Input: 48 original, deterministic metric scene points selected by #140.12.40. The seed is the direct `atan2(z - eyeHeight, x)` physical direction, *not* the CPU shooting answer. Cartesian coordinates, direct seed, radius, observer height, refractivity and scale height are split into two `f32` limbs before upload.
- RK4: same 4-component `[x,z,vx,vz]` ray state, stable spherical altitude/normal, standard exponential profile `n(h) = 1 + 0.000293 exp(-h/7350)`, first-forward-x travel, four derivative stages and direction normalization. DS `sin`, `cos` and `exp` are computed with bounded polynomial expansions rather than discarded low limbs. DS `TwoSum`/`TwoProd` are imported from #140.12.28 through #140.12.31's classic specialization; optimizer reassociation can still compromise portable DS accuracy.
- Shooting: same direct seed, alternating sign bracket expansion from `0.02 rad` up to `1.2 rad` and bracket-preserving regula falsi with a guarded midpoint after repeated edge crowding. Maximum 48 refinement iterations, target residual tolerance `1e-6 m`, `1e-10 m` at surface endpoints, 500 m RK4 steps. Each ray uses fixed-x endpoint correction and path-distance endpoint verification.
- Visibility: direct same-angle trace of the solved ray, scanning **eight RK4 substeps** per 500 m interval, refining first signed-altitude crossing and checking slope minima for grazing. It implements the CPU endpoint contact uncertainty envelope. This is the same **bounded sampled event approach**, not a global proof of no hidden ray contacts, and GPU float decisions need direct numerical validation.
- Domain: Globe with `R >= 100 km`, standard default atmosphere, eye height `(0,200] m`, target `x <= 60 km`, fixed 500 m / 8-substep controls, up to 256 points per dispatch. Only the existing 48 authored real-scene edge points are exercised by this button. No ducts, arbitrary `n(h)`, Flat model, full multipath search or all adaptive polygon targets.
- GPU output: `visible`, `blocked`, `indeterminate`, `solver_failed`; DS hi/lo for angle, residual, path and ground-event path; GPU RK4/evaluation counters. On failure results remain unresolved: **no CPU fallback and no fake GPU frame**.

## ZIP outputs

`curvature-compare-140.12.41-gpu-ds-rk4-shooting.zip` includes:

- `results.json`: all 48 matched targets, full CPU / GPU statuses, angles, residuals, first-ground events, RK4/evaluation counts, timing, and explicit limitations. Any mismatch is retained in place.
- `cpu-reference.png`: genuine pre-experiment Compare A Canvas screenshot.
- `cpu-f64-ray-positions-SAMPLES.png`, `gpu-ds-rk4-ray-positions-NOT-A-FRAME.png`: 48 point projections on a white canvas — **not reconstructed objects**.
- `status-and-position-disagreements-SAMPLES-ONLY.png`: red mismatched status; purple unresolved; orange >0.5 px; green other sampled points.
- `performance-48-target-batch.png`: host-side session setup, compile (part of setup), dispatch/readback, CPU scalar baseline; numerical values are in JSON. **Do not sum setup and compilation bars**.
- `README.txt`: interpretation and limitations.

Shader compilation failure or runtime exception exports `curvature-compare-140.12.41-gpu-ds-rk4-shooting-error.zip` with the failing phase and diagnostic message (and the CPU screenshot when available).

## Acceptance gate

No promotion to production is allowed based on this patch. `sample_parity_candidate` only means the selected 48 points have matching statuses, no indeterminate/failed results, <=0.5 px displacement and matching ground-event kinds, **not full-frame/polygon parity**. Performance is 48-target batch GPU dispatch **including readback**, separately from shader compilation/adapter startup and CPU f64 work; larger batch sizes are not inferred. A real device must compile and execute the generated WGSL before numerical results can be accepted. If that cannot be done, document the limitation explicitly.

## Follow-up

Run the user-browser audit and inspect `results.json`; fix any WGSL compilation errors, DS numerical disagreements or incomplete GPU roots. Only after an acceptable sample gate, evaluate the larger adaptive target query stream and apply the existing CPU polygon/painter algorithm unchanged with batch async orchestration, cancellation and safe fallback rules.
