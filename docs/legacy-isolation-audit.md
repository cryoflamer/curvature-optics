# Legacy / Modern isolation boundary (#140.12.64)

**Current status (#140.12.74):** this is a historical three-entrypoint audit.
The WebGPU research entrypoint and experimental modules were archived.
The current two-entrypoint inventory is `tests/fixtures/legacy-isolation-boundary.json`;
see [research archival](research-archive.md).

**Decision: keep both applications. No deletion, migration of animations, route change, or physical-solver change is approved by this audit.** Legacy is a separately supported, fast interactive/animated educational application; Modern is a separate, more computationally expensive physical-optics and comparison instrument. We should preserve their distinct purposes rather than force pixel or animation parity.

This supersedes the *proposed wholesale Legacy retirement* in original Legacy assessment (now available via [historical records](historical-records.md)) and [legacy-migration-plan.md](legacy-migration-plan.md). Those older inventories and browser evidence remain useful historical records, **not a mandate to remove Legacy**. The 80-state [schema compatibility audit](legacy-modern-compatibility.md) establishes neither a working converter nor a need to make one.

## Reproducible static evidence

Run from the repository root:

```sh
node tools/audit-legacy-isolation.js
node tools/audit-legacy-isolation.js --check
# Only when intentionally updating the reviewed evidence:
node tools/audit-legacy-isolation.js --json > tests/fixtures/legacy-isolation-boundary.json
node --test tests/LegacyIsolationAudit.test.js
```

The audited sources are the active literal `<script src>` tags in [`CurvatureApp.html`](../CurvatureApp.html), [`CurvatureModern.html`](../CurvatureModern.html), and the **single canonical** research shell [`tools/webgpu-optics.html`](research-archive.md); plus relative **literal** `require('...')` references inside `.js` files in `src/`, `tests/`, and `tools/`. HTML comment blocks are excluded; existing inline script blocks are counted and SHA-256 fingerprinted (**one Legacy reference-export installer**, **none in Modern**, **one in the WebGPU research harness**) but **not** dependency-traced. Browser cache-busting query parameters and `&amp;` are normalized for file identity, but script order and duplicate loads are retained. Every active path must resolve to a local repository file, or the audit fails. The [JSON boundary inventory](../tests/fixtures/legacy-isolation-boundary.json) records the per-file direct entrypoints, CommonJS callers by source/test/tool category, and explicitly non-loaded modules; `--check` rejects drift.

Observed after #140.12.63:

| Static load category | Observed count | Meaning |
| --- | ---: | --- |
| Legacy | 96 tags / 96 unique files | Existing animated entrypoint; includes later native browser-reference exporter |
| Modern | 63 tags / 62 unique files | `ModernCompareGraph.js` is intentionally loaded twice for two viewports |
| WebGPU research shell | 14 tags / 14 unique files | Independent experiment, **not** Modern Compare |
| Loaded by both Legacy and Modern | 34 files | Cannot be assigned to one UI based on filename |
| Loaded by Legacy but not Modern | 62 files | *Not* evidence that these are safely movable/deletable |
| Loaded by Modern but not Legacy | 28 files | Keep WebGL2 geometry and CPU optics separate from retired WebGPU Compare experiments |
| Loaded by research shell but neither application | 11 files | Research-only from these three HTML entrypoints, not abandoned |
| Not directly loaded by any of these three HTML entrypoints | 27 `src/*.js` files | Not a dead-code list; may be used by CommonJS/tests, diagnostic globals, historical experiments |

There are **162 `src/**/*.js` files** in this snapshot. The 34/62/28 categories compare the two application pages and are deliberately *not* disjoint from WebGPU research loads; three scripts are loaded by all three. The research-only 11 are disjoint from the two applications. Across all three HTML entrypoints, 135 distinct `src` JS files are directly loaded and 27 are not. Counts are inventory signals, not performance, transitive reachability, or runtime usage measurements.

## Concrete isolation seams

| Keep/protect | Source evidence | Isolation rule |
| --- | --- | --- |
| Legacy application, demos and animation | `CurvatureApp.html`, `src/app/CurvatureAppRuntime.js`, `src/animation/CurvatureAnimations.js`, `src/animation/CurvatureDemos.js`, `src/app/CurvatureStatePersistence.js` | Retain the independent UI, `?demo=...&pos=...&play=...`, saved Legacy state and real-time storyboard playback. Do not port animation into the slow Modern renderer merely to replace Legacy. |
| Modern application and experiment data | `CurvatureModern.html`, `src/ui/modern/ModernApp.js`, `ModernExperimentState.js`, `ModernExperimentLibrary.js`, `ModernCompareGraph.js` | Preserve Scene/Compare, Modern experiments and their own schemas; do not silently interpret old `?state=`/`?demo=` as `?experiment=`. |
| **Shared even though named `legacy`** | `src/legacy/GraphX3DX.js` is directly loaded by both HTML pages | Directory naming is **not** ownership. Do not split or delete without reviewing actual browser globals and consumers. |
| Shared geometry/physics | `src/app/CurvatureModel.js`, `src/geometry/CurvatureSurfaceGeometry.js`, `src/optics/OpticalRayTracer.js`, `src/optics/OpticalSharedRayField.js`, `src/optics/CurvaturePhysicalSceneOptics.js`, shared renderers | Retain source sharing without duplicating solvers. CPU RK4 **fused-gradient** remains the validated default for the qualified standard-atmosphere path; explicit `traceOptimization: 'legacy'` remains its rollback. No physics changes in this audit. |
| Modern WebGL2 geometry | `src/renderers/CurvatureWebGLGeometryRenderer.js`, loaded by Modern | **WebGL2 is not the standalone WebGPU shooting experiment.** Retirement of WebGPU from Compare must not remove WebGL2. |
| Experimental WebGPU optical probes | `tools/webgpu-optics.html` plus research-only diagnostics modules | Keep the one canonical research page and existing tests/archive. Future retirement needs a separate deliberate decision, not an inference from Modern load lists. |
| Scientific/browser references | `tests/fixtures/legacy-browser-references.zip`, `tools/validate-legacy-visual-reference.py`, `tests/fixtures/legacy-headless-numerics.json` | Six real Opera Canvas frames and same-code numeric snapshots remain regression evidence, **not** proof of Modern physical parity. Do not drop reference fixtures or browser export support. |
| Route compatibility | `src/ui/modern/ModernRoute.js`, loaded by both pages | Bare `CurvatureApp.html` redirects to Modern. `?ui=legacy` and original demo/state/tab links stay Legacy; `?ui=modern` also redirects to Modern, keeping query/hash. Modern URLs are now canonical at `CurvatureModern.html`. |

The Legacy animation and Modern high-quality CPU scene are deliberately distinct: re-rendering every animated Legacy transition using RK4 could be too expensive to provide the existing fluid experience. No pre-rendered animation system or hybrid approximation is authorized by this audit.

## What this tool **cannot** prove

- It is **not** an HTML/JavaScript execution trace or a complete dependency graph. Dynamic `<script>` injection, `import()`, computed `require()`, browser global resolution, DOM event handlers and HTML inline logic are not traced (only inline script counts/hashes are recorded). CommonJS `require()` calls may occur only in Node/UMD branches, not when the script runs in a browser.
- The test/tool reference map covers only literal relative CommonJS `require(...)` in JavaScript. Tests that `fs.readFileSync()` a string filename, shell or Python tools, implicit globals, CSS/images/JSON, historical exports and git history require separate review. A blank `commonJs*Callers` array does **not** mean unused.
- A module that is absent from active HTML, or is referenced by only one entrypoint, is **not a deletion candidate** until a separate static/dynamic invocation audit and browser acceptance prove that it has no retained purpose.
- This inventory does not compare image quality, fidelity, CPU performance, source semantics, physics correctness, compatibility of old saved states, or whether individual Legacy controls still work in the browser. The 80 states and six captured PNGs are evidence only within their declared limits.

## Next bounded changes

1. **#140.12.65 — Legacy preservation contract (completed).** The [reviewed Legacy contract](legacy-preservation-contract.md) adds a read-only source/HTML fixture gate and Node VM behavior tests for all nine demos, animation controls, `?state=` / `?demo=` routes and archived visuals. The separate Opera/Chromium browser acceptance checklist remains **manual and not yet executed**; no relocation or deletion is authorized by these tests.
2. **#140.12.66 — Dead-code candidate audit (completed).** The [source-backed candidate report](research-archive.md) inventories 38 modules across commented Legacy build sources, Node-linked diagnostics and the live WebGPU research harness. All are review candidates; **zero deletions approved**. It also documents the historical `src/make.bat`/`Slider.js` casing and output-path mismatch.
3. **#140.12.67+ — Controlled cleanup.** Only after explicit approval and replacement tests, remove or relocate demonstrably redundant experimental code in small independent commits, with both Legacy and Modern browser/regression checks. Preserve the `optics-baseline-2026-11` tag and archived reference evidence.

**Gate status: isolation documented; preservation contract automated with a remaining manual browser gate; no deletion approved.** Legacy is to be **maintained as an intentional separate mode**, not slowly erased through a supposed Modern parity migration.

## Historical source/bundle provenance

The [#140.12.67 provenance review](legacy-bundle-provenance.md) confirms token-stream correspondence between ten disabled original Legacy sources and three compact bundles, including `src/legacy/GraphX3DX.js` loaded by **both** apps. It does not authorize deleting originals, using the obsolete Windows build, or replacing a live bundle.
