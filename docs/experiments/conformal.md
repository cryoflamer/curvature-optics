# Conformal, Bouguer and hybrid CPU shooting — research archive

**Status at #140.12.52:** these are diagnostic or opt-in predictors; the strict CPU RK4 target solve and its original first-ground-contact and fallback logic retain authority. This page records the distinction between mathematical identities and *approximations* used to accelerate shooting. No new browser benchmark was run in this patch.

## Mathematical hierarchy: exact transformation ≠ exact fast solver

For a **spherically symmetric** refractive index `n_s(h)` on a spherical Earth of radius `R`, the meridional optical metric can be represented via the exact coordinate change

- `r = R + h`, `x = R φ`, `u = R ln(r/R)`,
- transformed stratified index `m(u) = (r/R) n_s(h)`; Earth ground is `u = 0`.

This *geometric transformation* is exact under its assumptions (radial symmetry, geometric optics, meridional plane); it is **not** a proof that a proposed fast predictor, two-step integration or approximate inverse-exponential profile has exactly solved the resulting ray boundary-value problem. Observer, target and ground surfaces must all be transformed consistently.

For the built-in standard exponential atmosphere `n_s(h) = 1 + N exp(-h/H)`, the local effective-radius approximation matches the transformed index and its derivative at the surface. Its inverse-exponential model `m_inv(u) = (1+N) exp(u/R_eff)` with `1/R_eff = 1/R - N/[H(1+N)]` gives an analytic *angle estimate*; this **approximates** the exact `m(u)` away from the match point. The classical `4R/3` Earth-radius rule is a separately compared heuristic, not the same model. See [#140.12.43 derivation](../CPU_F64_CONFORMAL_GLOBE_140_12_43.md) for the angle formula and cancellation-resistant evaluation.

The Bouguer invariant is a useful independent conserved-quantity check in radially stratified optical models, but numerical quadrature, root selection and opaque ground-event classification still require independent qualification. In particular, GPU f32/double-single Bouguer *sample* accuracy cannot by itself certify the CPU painter or a complete first-hit solution. See [GPU precision audit](../GPU_BOUGUER_PRECISION_140_12_30.md) and [GPU DS gate](../GPU_DS_CPU_PAINTER_GATE_140_12_40.md).

## Tested questions, designs and observable status

| Primary report | Experiment | Scope and what is **not** established |
| --- | --- | --- |
| [#140.12.43](../CPU_F64_CONFORMAL_GLOBE_140_12_43.md) | Effective-radius analytic prediction and coarse exact-conformal-medium **two-step RK4 + two Newton updates** as candidate launch angles; always certify with existing Globe f64 shooting | Protocol describes **48 authored endpoints**, **8 stress** and **40 envelope** cases, five warmed performance rounds, fallback and status evidence. This archive does **not** possess the raw browser ZIP or final numerical medians. A conformal prediction is not an exact or globally unique target solution. |
| [#140.12.44](../CPU_F64_ADAPTIVE_CONFORMAL_140_12_44.md) | Adaptive conformal candidate ladders (2/4/8/16 substeps, Richardson) and strict RK4 certification | A numerically improved candidate may be expensive and/or rarely accepted. Four prediction modes have full-pipeline timing methods, not just predictor microtime. External CSV/ZIP measurements must be recovered before quantitative claims. |
| [#140.12.47](../CPU_HYBRID_SHOOTING_140_12_47.md) | *Lazy* conformal fallback after cheaper prior-height, geometric and guarded predictions fail; compare baseline/hybrid/always-conformal on real frames | Only eligible for **standard Globe with positive observer height** when explicitly selected. A documented **local Node sweep** found **2 late conformal attempts per 100 targets; 0 accepted** in the cited sample. Eight hot-frame browser A/B and strict RGBA checks are defined, but their export is **not** included in this pack. No general speedup shown. |
| [#140.12.38](../CAMERA_FIRST_CPU_ORACLE_140_12_38.md), [#140.12.39](../CAMERA_FIRST_OBJECT_INTERSECTIONS_140_12_39.md) | Alternative forward (camera-first) CPU ray integration and opaque object-first-hit diagnostics | Different *visibility architecture* from target-shooting/inverse presentation. Still based on sampled RK4 paths and authored geometry; cannot solve surface/outline opacity semantics or prove missed tangencies globally. Not a production renderer. |

## Verification and rollback boundary

- Predictors may propose angles, but **never grant a visible/blocked status**. Preserve the original CPU RK4 endpoint residual check, angular bracket fallback, finite ray tracing and first opaque ground crossing/grazing decision.
- An exact mathematical coordinate mapping does **not** give global branch/multipath completeness. Test near-grazing cases, blocked endpoints, variable observer height, long range and alternative/custom profiles separately.
- Distinguish “predictor took fewer operations” from **full target-shooting** and **full physical Canvas frame** speed. Conformal candidate generation and failed candidates consume time; count them in comparisons.
- The physical CPU production baseline uses the built-in standard **fused-gradient** default at #140.12.50; `shootingOptimization: 'conformal-hybrid'` is not automatically enabled. See [production promotion scope](../FUSED_GRADIENT_PRODUCTION_PROMOTION_140_12_50.md). Avoid silently treating a historical, pre-promotion baseline as the present default.

## Reproduce and archive

Use Modern Compare and standard Globe A for #140.12.43/.44/.47, following their linked reports and preserving current source revision, camera/model, target coordinates, all timings, residual/status/collision mismatches, and raw ZIP/JSON/PNG. The #140.12.43 report enumerates the exact expected CSV/ZIP members. The #140.12.47 report specifies eight order-rotating hot frames per mode; strict pixel difference is in `results.json`, **not** inferred from a visually blank thresholded PNG diff. These exports are **external**, not bundled here.

**Disposition:** retain the strict reference RK4 and its tests; preserve the scientific derivation, predictor methods and reported unsuccessful/uncertain outcomes before any removal of diagnostic controls. Whether CPU hybrid or conformal diagnostics remain callable is a separate post-archive decision, not an implication of this index.
