# Legacy UI retirement assessment

Status: **assessment, not approval to delete**. This document audits the tree after the WebGPU removal from Modern Compare and documentation filename normalization (historical compatpatches #140.12.53–#140.12.54). No UI, solver, routing or production behavior is changed by this assessment (#140.12.55); an obsolete filename assertion in `tests/ProjectLayout.test.js` is updated to recognize the semantic documentation names introduced in #140.12.54.

## Scope and evidence

- Entry points: [`../CurvatureApp.html`](../CurvatureApp.html) (Legacy by default) and [`../CurvatureModern.html`](../CurvatureModern.html) (Modern); route contract: [`../src/ui/modern/ModernRoute.js`](../src/ui/modern/ModernRoute.js).
- Static HTML inventory in this snapshot: Legacy has **95** active `<script src>` tags (95 distinct); Modern has **63** tags (**62** distinct scripts; `ModernCompareGraph.js` is deliberately included once for each Compare viewport). Counting distinct **full script URL strings**, 28 are shared, 67 are Legacy-only and 34 are Modern-only. Query-string cache busting is included in the string; these are *HTML load sets*, not transitive module ownership or proof of runtime execution.
- Legacy includes a script at the bottom of the page to start `CurvatureAppRuntime.js`; Modern initializes through `src/ui/modern/ModernApp.js`. Both load `CurvatureModel.js`, geometry, physics, and several renderer utilities. A shared `src/legacy/GraphX3DX.js` is loaded by **both** pages, despite its directory name.
- This is a source- and test-level comparison. A real interactive browser feature-parity audit has **not** been completed. Do not infer equivalence from control names or from passing Node tests.

## User-facing feature disposition

| Surface | Legacy evidence | Modern evidence | Retirement disposition |
| --- | --- | --- | --- |
| Default URLs and navigation | `CurvatureApp.html` and `?ui=legacy` open Legacy; `?ui=modern` redirects in `ModernRoute.js` | Separate `CurvatureModern.html`; `history.replaceState` restores the canonical `CurvatureApp.html?ui=modern` address when allowed | **Blocker.** Keep an intentional landing/redirect strategy and test old bookmarks, query parameters, hashes and file/HTTP hosting before removal. |
| Built-in demonstrations and playback | `CurveDemosTabs` buttons: Curve, Causeway, TrnsmLine, Grace, Chicago, Canigou, Bedford, Tensas, Soundly, Reset; animation and transport in `src/animation/CurvatureAnimations.js`, `CurvatureDemos.js` | `ModernPreset` offers Pontchartrain, single tower, two tower rows, custom; Scene/Compare tabs | **Not feature-parity.** Classify each demo: migrate as preset/data, archive as Legacy-only, or explicitly retire; do not silently drop it. |
| Views, objects and calculated readouts | `CurveSettingsTabs` with Views, Objects 1/2, Refraction, Units, Save/Restore; `ComputedValuesPanel.js` | Camera, Surface, Atmosphere, Objects, Display; two object groups and viewports | **Partial overlap only.** Inventory individual fields, object types and computed readouts before claiming parity. |
| Original vs optical comparison | `MainCanvasRenderer` Legacy/Independent/Physical; `OpticsSceneComparison` Original/Optical/Both and tower overlay comparison modes | Physical-optics Scene, A/B Compare model selection; WebGL2 geometry backend is separate | **Scientific oracle risk.** Preserve original/controlled Legacy rendering and comparison evidence until replaced by equivalent regression oracles. Modern A/B is not automatically the same comparison. |
| Tower, inverse-atmosphere and geometry probes | `InverseAtmosphereLineQuality` offers exact shooting, preview, map, bundle, polynomial and analytic P4; frame capture, geometry ZIP, canvas replay, sanity and tower-21 audits | Separate CPU research diagnostics; no demonstrated equivalence for every Legacy probe | **Retain or explicitly archive.** Classify unique probes and outputs, with a reproducible replacement for essential comparisons. |
| Atmosphere controls | Legacy selectors include vacuum, standard, exponential occlusion and inverse spherical; some ray tracing/custom controls are marked planned | Modern vacuum, standard, engineered exponential; inverse spherical is `hidden disabled` in HTML | **Different exposure.** Do not equate an available Legacy option with a selectable Modern option; check actual behavior per profile before deciding on migration. |
| Save/restore and sharing | `SaveRestorePanel` and `CurvatureStatePersistence.js` expose Get App State, Get App Url, Set App State, Compact, Clear | Experiment URLs and library with Save/Load/Import/Export JSON (`ModernExperimentState.js`, `ModernExperimentLibrary.js`) | **Format compatibility unproven.** Modern JSON is not automatically a decoder for historical Legacy state/URLs. Gather representative old saved states and define a conversion or explicit archival policy. |
| Unit conversion and computed values | `LengthCalculator.js`, `LengthCalculatorPanel.js`, `ComputedValuesPanel.js` | No corresponding panel identified in the Modern HTML | **Unique utility unless verified elsewhere.** Decide explicitly whether to migrate or retire each. |
| Legacy diagnostic links from Modern | Not applicable | Both header and footer link to `CurvatureApp.html?ui=legacy` | **Blocker.** Replace links with a real destination only when capabilities have been migrated/archived. |

The matrix describes **observed HTML, script wiring and test contracts**; it does not assert that every Legacy UI control functions correctly today. “Not present in Modern HTML” is not the same as “impossible to reproduce with Modern modules.”

## Dependency and regression gates

1. **Routing and serialized state.** Tests [`../tests/ModernUiBootstrap.test.js`](../tests/ModernUiBootstrap.test.js) and [`../tests/ModernExperimentState.test.js`](../tests/ModernExperimentState.test.js) assert the canonical route and experiment links. Keep `?ui=modern` functional and plan explicit behavior for bare `CurvatureApp.html` and `?ui=legacy` before replacing the file. Removing `CurvatureApp.html` without revising `ModernRoute.js` would break the existing public contract.
2. **Legacy parser-time and boot order.** [`../tests/CurvatureEntryExtraction.test.js`](../tests/CurvatureEntryExtraction.test.js) and [`../tests/CurvatureRuntimeSeparation.test.js`](../tests/CurvatureRuntimeSeparation.test.js) verify legacy HTML wiring, ordered scripts and the `CurvatureAppRuntime.js` bootstrap. `tests/helpers/readCurvatureSources.js` also reads Legacy source. Treat these as **live regression contracts**, not automatically obsolete tests.
3. **Optical/geometry integration.** Other tests directly inspect `CurvatureApp.html` (e.g. [`../tests/CurvaturePhysicalSceneOptics108.test.js`](../tests/CurvaturePhysicalSceneOptics108.test.js), [`../tests/PhysicalCanvasInteraction117.test.js`](../tests/PhysicalCanvasInteraction117.test.js), [`../tests/PerformanceProfile118.test.js`](../tests/PerformanceProfile118.test.js)). Before removal, re-home meaningful physics/renderer assertions into tests that do not need the retired HTML; do not simply delete failures.
4. **Browser acceptance.** [`../tools/check-browser.py`](../tools/check-browser.py) opens `CurvatureApp.html`, clicks the Transmission Line demo, exercises tower-21 atmosphere controls and saves screenshots/report. Repointing it to Modern would change what it verifies: keep a Legacy oracle fixture or implement a *separate* Modern smoke test first.
5. **Shared files.** Preserve `src/legacy/GraphX3DX.js`, `src/app/CurvatureModel.js`, shared geometry/optics/renderers and `src/diagnostics/GeometryDiagnosticsZip.js` until consumers have been traced; pathname `src/legacy/` is **not** a safe deletion criterion. For controls and modules used exclusively by Legacy, confirm all HTML, test and tool references before deletion.
6. **GPU scope.** WebGPU optical retirement from Modern Compare does **not** authorize removing Modern's WebGL2 geometry backend while the retired `tools/webgpu-optics.html` is preserved at the [research archive tag](research-archive.md).

## Proposed phased retirement, each with a separate reviewable commit

1. **Feature map and acceptance fixtures:** capture an explicit coverage table for all nine Legacy demo tabs; collect example Legacy state strings/URLs, frame audits and exported diagnostic ZIPs; distinguish scientific oracles from convenience UI. Record samples in versioned, descriptive fixture paths or inventory externally held artifacts without inventing files.
2. **Modern replacements or deliberate retirement decisions:** add only capabilities that are genuinely required. Specify exact input/output and pixel-tolerance gates for each supported model; preserve CPU fused-gradient default and `legacy` solver rollback. Do not conflate original Legacy rendering with Modern physical-optics A/B.
3. **Compatibility bridge:** decide how existing bare/`?ui=legacy` URLs behave, whether historical saved-state strings can be imported, and which Modern Legacy links are removed/replaced. Add routing and deserialization regression tests **before** flipping defaults.
4. **Legacy-only code pruning:** after dependency tracing, remove dead controls, bootstrap and UI-only files in narrow patches. Explicitly preserve shared model, core geometry, renderer and reference-oracle functionality. Update browser smoke tests in the same patch that changes their supported contract.
5. **Final removal:** delete `CurvatureApp.html` only after routing, bookmarks, demos, saved states, diagnostic oracles, numerical parity and browser acceptance are satisfied or consciously deprecated and documented.

**Decision:** Legacy is **not yet safe to remove**. The next useful implementation unit is an evidence-backed demo/state/diagnostic **feature-parity matrix**, not a bulk deletion. This document is the pre-removal checkpoint and does not claim a completed migration.

## Feature-level follow-up

The [Legacy migration plan](legacy-migration-plan.md) inventories all nine demonstration scripts (80 state snapshots), distinguishes archived storyboards from candidate physical fixtures, details the incompatible state/URL formats, and defines acceptance gates. Its classifications are proposals, not evidence of feature parity or authorization to delete Legacy.

## Schema-level compatibility follow-up

The [read-only Legacy / Modern state boundary audit](legacy-modern-compatibility.md) classifies all nine demos / 80 literal states using the Modern validator, and preserves a reproducible [per-state report](../tests/fixtures/legacy-modern-boundary.json). The presence of six original-Canvas Opera PNGs does not establish Modern renderer parity. No import, navigation, Legacy-delete or optical behavior changed.

## Status update — #140.12.64

The wholesale-retirement plan above is historical and **not an active removal decision**. Legacy will remain a distinct fast animated interface alongside Modern's CPU physical-optics/Compare application. The [isolation audit](legacy-isolation-audit.md) records the actual static script and CommonJS boundaries; its categories are **not** dead-code classifications. Keep both entrypoints, both route contracts, old demo playback/state, and shared model/renderer code. No UI or solver changes were introduced by this audit.
