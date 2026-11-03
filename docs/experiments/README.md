# Curvature optics — experiment archive (indexed at #140.12.52)

This directory preserves **why** an approach was evaluated and **what was actually observed**, independently of whether its UI and implementation stay in the application. It indexes the **existing** reports instead of silently replacing them; the scientific and implementation details remain in the linked primary documents.

**Snapshot:** source pack at `3785ad1` (#140.12.50), tagged `optics-baseline-2026-11`, plus documentation-only #140.12.51 and #140.12.52. This archive is a *retrospective index*, not a newly executed benchmark, reproduction of external browser measurements, or a new authorization to change the production algorithm. Some documents describe their then-current default; prefer the later promotion decision when statements conflict.

## Tracks and present decisions

| Track | Study | Evidence available here | Disposition at this baseline |
| --- | --- | --- | --- |
| [WebGPU optics](gpu.md) | Isolated f32/compensated RK4; GPU-assisted and independent target shooting; precision, geometry, visibility and painter attribution | In-repository study protocols, reported user-browser values, deterministic fixture and test machinery; **not** all exported user ZIP/JSON/PNG | **Research only / no WebGPU optical production promotion.** Distinguish fast isolated batches from a slower or mismatching real-scene pipeline. |
| [Conformal / Bouguer / hybrid CPU](conformal.md) | Exact coordinate transformation vs approximate effective radius, coarse and adaptive predictors, full-frame hybrid fallback | Derivations, scripts/UI specifications and reported local Node sweep; most user-browser ZIP measurements not checked into pack | Diagnostic predictors only; original strict RK4/event checks retain authority. No general hybrid speedup established here. |
| [CPU RK4 optimization](rk4.md) | Fused standard exponential gradient, preflight, scalar RK4, four-scene browser promotion gate | Bench scripts, test suites and a recorded four-scene browser verdict; raw browser ZIP is external | **Fused gradient is production default for eligible built-in standard profiles**, with `legacy` rollback. Preflight and scalar remain experiments. |

Related, but **distinct from optical WebGPU**: [WebGL2 geometry painter](../MODERN_GPU_GEOMETRY_140_2.md). Its renderer must **not** be deleted as collateral during WebGPU optics retirement; see [baseline inventory](../BASELINE_INVENTORY_140_12_51.md).

## Evidence and reproducibility policy

For every claim, distinguish:

1. **Recorded user-browser observation**: a numerical result documented in an earlier report; this archive cites that report but does not pretend its raw export is contained here.
2. **Defined protocol / implementation**: the UI action, code, configuration and acceptance gate exist; this alone does **not** mean the experiment was run successfully on real GPU hardware or its WGSL compiled.
3. **Node-based/unit evidence**: structural/regression tests or offline numerical sweeps; neither a WebGPU execution nor a real Canvas/browser speedup.
4. **Missing external evidence**: unknown or unbundled exported PNG/JSON/ZIP files, browser/hardware versions, trial repetitions or performance samples. Do not infer their contents from a proposed export schema.

Never collapse a **ray-batch** time into **target-shooting**, **scene-optics**, **full-frame Canvas**, or **FPS** speedup. A sample-only projection is **not** a rendered frame; a passing finite numerical gate is not a mathematical proof of global parity. Do not equate a 5 mm *physical target residual* with a 5 mm first-ground-contact or a one-pixel rendering gate.

**Reproducing research from this checkout** (if the relevant UI remains installed): serve the repository root with `python3 -m http.server 8000`; open `CurvatureModern.html` for Compare, or the **single canonical** `tools/webgpu-optics.html` for WebGPU harness modes. Run the exact mode and environment described in the linked primary document; record the source commit/tag, scene parameters, browser, GPU adapter, CPU, tolerances, selected mode, timing boundary, raw samples, warnings, and exported artifact names. Real WebGPU results additionally require an actual adapter and successful WGSL compilation on that device. Do not add new versioned experiment HTML pages.

## External experiment export manifest — currently unbundled

The following names are *identified in committed documentation* as output or input artifacts; **their presence in an earlier user's browser is not equivalent to availability in this source pack**. Keep copies outside Git if oversized, and record a checksum / provenance before later deletions. This list is representative, not a claim that all historical exports have been recovered.

| External browser artifact | Primary description | What to recover if available |
| --- | --- | --- |
| `curvature-webgpu-optics-140.9-matrix.json` | [#140.9.1](../WEBGPU_OPTICAL_PRECISION_DIAGNOSTIC_140_9_1.md) | All 18 case records, seeds/tolerances, per-case timing distributions and device metadata |
| `curvature-webgpu-optics-140.10-scene-spike.json` | [#140.10.3](../WEBGPU_REAL_SCENE_SHOOTING_SPIKE_140_10.md) | Both 64-target scenes, accepted warm starts, cold setup, RK4 counters, result status |
| `curvature-webgpu-optics-140.12-independent-shooting.json` | [#140.12.1](../WEBGPU_SHOOTING_DIAGNOSTICS_140_12_1.md) | Status/angle/ground-event parity, cold timings and device details |
| `curvature-compare-140.12.41-gpu-ds-rk4-shooting.zip` | [#140.12.41](../GPU_DS_RK4_SHOOTING_140_12_41.md) | Per-target JSON, reference screenshot, sample-only maps and actual shader errors |
| `curvature-compare-140.12.43-cpu-f64-conformal-globe.zip` | [#140.12.43](../CPU_F64_CONFORMAL_GLOBE_140_12_43.md) | Authored, stress, envelope CSV, candidate acceptance and complete CPU costs |
| #140.12.44 adaptive-conformal ZIP | [#140.12.44](../CPU_F64_ADAPTIVE_CONFORMAL_140_12_44.md) | Four predictor ladders, 48 authored targets, 8 stress and 40 envelope cases |
| #140.12.47 hybrid-shooting ZIP | [#140.12.47](../CPU_HYBRID_SHOOTING_140_12_47.md) | Eight hot-frame samples per mode, images, strict pixel-difference counts |
| #140.12.48 trace-optimization ZIP | [#140.12.48](../CPU_TRACE_OPTIMIZATION_140_12_48.md) | Baseline/fused/preflight/scalar timings, frame PNGs and strict parity |
| #140.12.49 four-scene gate ZIP | [#140.12.49](../FUSED_GRADIENT_PRODUCTION_GATE_140_12_49.md) | Four-scene numeric samples, strict RGBA frame diffs, scene settings and checksums |

Some archive output names above intentionally use **descriptions**, not guessed filenames. No missing export has been recreated or reverse-engineered from prose. The committed `tools/reference/webgpu-real-scene-targets-14010.json` is a reproducible **input fixture**, not a measured output.

## Rules for subsequent retirement patches

- Preserve these documents and the primary linked reports; keep external exports indexed or recover them before removing their generator if reproducibility is required.
- **#140.12.53:** inventory both static script tags and dynamic GPU call sites, export schemas, saved Compare experiments and shared CPU helpers; remove optical WebGPU only after the acceptance tests in [#140.12.51](../BASELINE_INVENTORY_140_12_51.md). Do **not** remove WebGL2 as part of this step.
- **#140.12.54:** treat Legacy UI and historical CPU references as separate features/oracles, not as automatically obsolete dependencies.
- If code is removed later, cite the tag and/or historical commit and mark reproduction as **historical checkout required** instead of pretending the deleted diagnostic still runs at HEAD.

## Retirement milestones

- [#140.12.53 — WebGPU optical retirement from Modern Compare](webgpu-retirement-140-12-53.md). Standalone research harness and GPU numerical tests are retained.
