# #140.12.51 — Baseline and retirement inventory

Status: **inventory only**. No runtime, HTML, solver, test, or build changes are part of this step.

## Reproducible starting point

- Source: the supplied **full** `chatgpt-pack` of `curvature-optics`, branch `dev`, at commit `3785ad1` (`Fused gradient was enabled by default for standard RK4 shooting`). The source pack contains a shallow Git history; an absent older commit is **not** evidence that it never existed.
- Baseline tag: `optics-baseline-2026-11`, verified to exist in this pack. This document describes the supplied snapshot, not an assertion about other branches or untracked local data.
- The #140.12.50 production change concerns **CPU standard-atmosphere** RK4 in the prepared/shared-field path: the default is `fused-gradient`; `traceOptimization: 'legacy'` is the explicit original-path rollback. `fused-preflight` and `scalar-rk4` remain experiments. Explicit/custom atmospheric profiles are not silently promoted. See [promotion record](FUSED_GRADIENT_PRODUCTION_PROMOTION_140_12_50.md).
- Do not treat #140.12.49's historical description of the *pre-promotion* default as current behavior. See [gate record](FUSED_GRADIENT_PRODUCTION_GATE_140_12_49.md).

## Snapshot inventory and entry points

Counts below are direct file counts from the supplied working tree. They are **not** counts of live or removable modules.

| Area | Observed state | Consequence |
| --- | --- | --- |
| `src/` | 169 files; 161 `.js` files | Shared code spans `app`, `geometry`, `optics`, `renderers`, `scene`, `ui`, `legacy`, `diagnostics`, `animation`. File location alone does not classify ownership. |
| `tests/` | 223 files; 219 top-level `*.test.js` files | Tests are valuable specifications and may also depend on research APIs. Inventory test references before deletion. |
| `docs/` | 97 Markdown files *before this document* | Historical material already exists; index and annotate rather than replace it. |
| `tools/` | 35 files: 27 `.js`, 5 `.md`, 1 `.html` plus a Python check and a reference JSON file | Includes checks, benchmarks, the single WebGPU experimental HTML shell, a Python browser check, and `tools/reference/`. |
| `CurvatureModern.html` | 82 active script `src` references; all resolve in the pack | Modern Scene + Compare entry point; links to Legacy diagnostics. Loads 30 diagnostics scripts, including experimental GPU code. |
| `CurvatureApp.html` | 95 active script `src` references; all resolve in the pack | Legacy entry point and diagnostic/control surface; also consumes shared physics/rendering modules. |
| `tools/webgpu-optics.html` | 14 active script `src` references; all resolve relative to `tools/` | **Canonical single-page WebGPU research harness.** Do not create version-numbered replacement HTML files for experiments. |

Script counts exclude HTML comments, include duplicate loads if any, and say nothing about whether a module is invoked at runtime. They are a useful **static load boundary**, not a dependency graph.

### User-visible startup and routing

Run `python3 -m http.server 8000` at the repository root, then open `http://localhost:8000/CurvatureModern.html` (or the canonical public `CurvatureApp.html?ui=modern`). `src/ui/modern/ModernRoute.js` redirects modern-mode requests from the old HTML and uses `history.replaceState` to display the canonical URL on the separate modern document. Direct legacy diagnostics are at `CurvatureApp.html?ui=legacy`. See the existing [layout record](PROJECT_LAYOUT_93.md) and [modern UI plan](modern-ui-plan.md).

**Retirement blocker:** removing `CurvatureApp.html` requires a considered migration of these URLs and links, not just deleting its markup. `CurvatureModern.html` contains explicit links to Legacy diagnostics. The Legacy page also owns controls and tests that require separate disposition.

## Functional boundaries (provisional ownership map)

1. **Physical/optical core (retain).** `src/optics/OpticalRayTracer.js`, `OpticalTargetProjection.js`, `OpticalSharedRayField.js`, `OpticalRayHorizon.js`; `src/geometry/` and shared contracts in `src/scene/`. Distinguish raw diagnostic traces from the configured prepared/physical path. The current standard-atmosphere `fused-gradient` default and explicit `legacy` rollback are a protected behavior contract.
2. **Production composition and CPU scene presentation (retain).** `src/optics/CurvaturePhysicalSceneOptics.js`, `CurvaturePhysicalPolygonFills.js`, `OpticalTowerSilhouette.js`; `src/app/CurvatureMainCanvasRenderer.js` and rendering/scene modules. `src/renderers/CurvatureWebGLGeometryRenderer.js` is **WebGL2 geometry**, not the WebGPU optical solver; assess its separately selectable backend before any removal.
3. **Modern Scene/Compare and saved experiments (retain and simplify later).** `src/ui/modern/ModernApp.js`, `ModernSceneState.js`, `ModernCompareState.js`, `ModernCompareGraph.js`, `ModernExperimentState.js`, `ModernExperimentLibrary.js` and `ModernCompareModel.js`. The latter contains substantial GPU-first analysis helpers alongside Compare responsibilities; do not assume the entire file is disposable. `ModernGpuCapabilities.js` is a capability check, not optical solving.
4. **WebGPU/WGSL optical research (archive before retiring).** `tools/webgpu-optics.html`, `src/diagnostics/CurvatureWebGPU*.js`, `src/diagnostics/CurvatureGpu*.js`, the GPU branches of `src/ui/modern/ModernApp.js` and `ModernCompareModel.js`, and their HTML controls. Research modules are directly script-loaded by Modern Compare and the tool page; not an independently removable directory.
5. **Legacy UI and compatibility (investigate).** `CurvatureApp.html`, `src/legacy/`, legacy portions of `src/ui/`, `src/animation/`, and legacy runtime (`src/app/CurvatureAppRuntime.js`). `src/legacy/GraphX3DX.js` is also loaded by **Modern**, so bulk deletion of `src/legacy/` would break the modern page.
6. **Reference implementations, diagnostics, and tests (classify, not discard).** `tools/reference/original-solver.js` and `adapter.js`, `src/diagnostics/` (including CPU f64, conformal, geometry and comparison audits), `tests/`, and historical `tools/benchmark-*.js`. Some are regression oracles; other paths may become documentation-only after producing reproducible evidence.

### Separate the three meanings of “GPU”

| Technology | Current evidence | Preliminary action |
| --- | --- | --- |
| **WebGPU/WGSL optical shooting** | `tools/webgpu-optics.html`, `CurvatureWebGPUBatchShooting1412.js`, GPU diagnostics, Compare probe buttons | Candidate for archiving and later removal from live UI, **after** experiment records, call sites, and tests are classified. |
| **WebGL2 geometry rendering** | `CurvatureWebGLGeometryRenderer.js`; `ModernApp.js` has a `geometryBackend` Canvas/WebGL2 selection | **Do not remove as part of WebGPU retirement.** Requires an independent performance/feature decision. |
| **GPU capability inspection** | `ModernGpuCapabilities.js`, `ModernGpuCheck` | Optional UI diagnostic; can be evaluated separately from both renderers. |

## Experiment evidence to preserve in #140.12.52

An archive should distinguish **hypothesis → method → environment/scene → measurements → known limitations → decision**. A code file or a Git tag is not itself a reproducible result; external PNG/JSON/ZIP files must be located and explicitly indexed if they are not part of the repository.

| Track | Existing entry points | Evidence/decision to record |
| --- | --- | --- |
| WebGPU: batch, precision, geometry, raster parity, double-single/RK4 | `docs/WEBGPU_*.md`, `docs/GPU_*.md`, `docs/GPU_DS_*.md`, `docs/GPU_GEOMETRY_DIFFERENCE_ATTRIBUTION_140_12_37.md`, `tools/webgpu-optics.html`, Compare diagnostics | Which scene, grid, precision, GPU/browser, CPU reference, first-ground-contact behavior, mismatched pixels and costs; avoid the unsupported blanket assertion “GPU is always slower.” |
| Conformal / Bouguer / hybrid CPU shooting | `docs/CPU_F64_CONFORMAL_GLOBE_140_12_43.md`, `docs/CPU_F64_ADAPTIVE_CONFORMAL_140_12_44.md`, `docs/CPU_HYBRID_SHOOTING_140_12_47.md`, `src/optics/OpticalConformalPredictor.js`, CPU diagnostic modules | Mathematical assumptions, branch restrictions, proof/qualification boundaries, why a proposed fast path was not necessarily promoted. |
| Standard RK4 optimization | `docs/CPU_TRACE_OPTIMIZATION_140_12_48.md`, `docs/FUSED_GRADIENT_PRODUCTION_GATE_140_12_49.md`, `docs/FUSED_GRADIENT_PRODUCTION_PROMOTION_140_12_50.md`, `tools/benchmark-trace-140-12-48.js`, `tools/benchmark-fused-multiscene-140-12-49.js` | Four-scene browser gate, strict RGBA parity **on those scenes**, baseline and optimized timings, exact scope of production promotion, original-path rollback. |
| Historical migration / reference | `docs/MIGRATION_*.md`, `tools/reference/`, Legacy capture/verification tools | Which old behavior is a scientific comparison oracle versus obsolete UI, and how to reproduce differences. |

## Retrospective archive completed in #140.12.52

See [the experiment archive index](experiments/README.md) and track-specific [GPU](experiments/gpu.md), [conformal / Bouguer / hybrid CPU](experiments/conformal.md), and [CPU RK4 optimization](experiments/rk4.md) records. They differentiate logged user-browser evidence from proposed protocols and unbundled exports. This documentation-only archive is a prerequisite for evaluating #140.12.53; **no retirement has occurred**.

## Verification contract before any retirement

- **Baseline behavior:** run `node --test tests/OpticalFusedProductionPromotion141250.test.js`, then the related `OpticalFusedProductionGate141249.test.js` and `OpticalTraceOptimization141248.test.js` (check exact filenames before running) and representative Modern Scene/Compare tests. Preserve exact trace and rendering classifications, not merely “page loads.”
- **Node suite:** `node tools/check-optics.js` enumerates all top-level `tests/*.test.js` and checks three optical modules' syntax. Individual test timeout is 120 seconds. A clean exit is stronger evidence than a partial sample; record any failures rather than hiding them.
- **Browser smoke:** `python3 tools/check-browser.py --out optics-check` requires Playwright + Chromium and tests a Legacy-driven optical scenario. Its screenshots are *not* pixel-perfect golden references.
- **Scientific regression:** for a potential rendering or solver edit, independently validate Globe and Flat; near contact, lower-tower occlusion and far horizon; standard, vacuum and custom/engineered atmosphere; Scene and Compare; exact or explicitly justified pixel differences. #140.12.49's four-scene result is **not universal equivalence**.
- **GPU changes:** browser WebGPU adapter availability and **actual WGSL compilation** are separate from Node syntax checks. A future patch must report whether WGSL was compiled on a real device.
- **Archive rules:** keep a single canonical `tools/webgpu-optics.html` while WebGPU is present; keep source/measurements until copied to an experiment record; do not remove test oracles before replacement is identified.

## Proposed sequence and gates

| Step | Change | Must be true before proceeding |
| --- | --- | --- |
| **#140.12.51 — this commit** | Inventory only, no functional changes | Baseline/tag, entry points, obvious shared dependencies and unknowns are documented. |
| **#140.12.52 — experiment archive** | Index existing GPU/conformal/RK4 records, point to exact source and available results; note missing exports honestly | Enough evidence exists to understand the experiments without the live UI. |
| **#140.12.53 — WebGPU optical retirement** | Remove research-specific scripts, Compare probe UI, code branches and associated tests *only where no shared contract remains* | Static references, dynamic call sites, saved-experiment format, exports, browser smoke and CPU tests reviewed; WebGL2 explicitly out of scope. |
| **#140.12.54 — legacy UI retirement assessment / implementation** | Feature-by-feature parity audit first, removal only if proved safe | No uniquely required control or regression oracle is lost; redirects/links remain intentional. This may require multiple commits. |
| **Later — architecture and docs** | Clarify physics, numerical tracing, scene geometry, painter, public data/API boundaries and reproducible tests; then refactor internals | Behavior and reproducibility protected by regression gates. |

### Open questions, not assumptions

- Which experimental ZIP/PNG/JSON reports are saved **outside** this Git pack? There are no benchmark export artifacts in the named evidence above by implication; verify files before claiming completeness.
- Which `ModernApp.js` / `ModernCompareModel.js` GPU-specific functions are used by saved experiment JSON schemas or non-GPU diagnostics? Requires a symbol- and caller-level analysis for #140.12.53.
- Which unique Legacy features matter to users and to tests? Requires feature comparison and browser checks before #140.12.54.
- Which historical reference implementation is necessary as an *oracle* rather than merely as preserved source history? Avoid removing `tools/reference/` by pathname.

**Decision for this step:** no deletion or architecture moves have been approved. Preserve the tagged CPU baseline and use the above gates to make subsequent, independently reviewable Compatсhes.
