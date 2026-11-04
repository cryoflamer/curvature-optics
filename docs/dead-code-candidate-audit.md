# Dead-code candidate review (#140.12.66)

**Status: inventory only — no deletion or relocation approved.** Both `CurvatureApp.html` (the fast, animated **Legacy** app) and `CurvatureModern.html` (the physical-optics **Modern** app) remain supported. The separately retained `tools/webgpu-optics.html` is the **single canonical WebGPU research page**, not a versioned substitute for Modern Compare. The validated CPU RK4/fused-gradient baseline, explicit legacy tracing fallback, independent WebGL2 geometry rendering, and all archived reference fixtures are outside this cleanup.

## Repeat the evidence check

```sh
node tools/audit-legacy-isolation.js --check
node tools/audit-dead-code-candidates.js
node tools/audit-dead-code-candidates.js --check
node --test tests/DeadCodeCandidateAudit.test.js
# Review a proposed evidence update; never overwrite it just to silence a failure:
node tools/audit-dead-code-candidates.js --json > /tmp/dead-code-candidates-proposed.json
```

The reviewed output is [`tests/fixtures/dead-code-candidates.json`](../tests/fixtures/dead-code-candidates.json): **38 review candidates**, with exact path, active/disabled HTML references, source/test/tool literal CommonJS callers, historical bundle input evidence and an explicit `deletionApproved: false`. The auditor derives candidates from the prior [isolation inventory](legacy-isolation-audit.md), then independently inspects HTML-commented script tags and `src/make.bat`; it fails if the underlying boundary audit finds a missing static path. `--check` compares exact, deterministic JSON and **does not write files**.

| Evidence group | Files | Current use / interpretation | Decision |
| --- | ---: | --- | --- |
| Alternative unminified Legacy sources | **10** | Listed in a *commented-out* `<script>` section in `CurvatureApp.html` and referenced by `src/make.bat`, not loaded directly by active HTML | **Review** historical source/bundle workflow; do not remove |
| Not loaded by any of the three entrypoints, but linked by tests/source | **17** | Primarily GPU diagnostic algorithms, plus migration/separation audits, with literal CommonJS consumers | **Review** test/runtime/global consumers; do not remove |
| WebGPU research-only active HTML scripts | **11** | Loaded by `tools/webgpu-optics.html`, **not** by the Legacy or Modern application page | **Retain** until a separate research-retirement decision |
| **Total candidates / approved deletions** | **38 / 0** | These categories are disjoint; source inventory contains 162 `.js` modules | **No deletion** |

These counts apply only to `src/**/*.js` in the audited source snapshot, not every HTML/CSS/tool/fixture file or a full transitive runtime graph. The other **124** source modules are directly loaded by Legacy and/or Modern (or simultaneously by research); many have substantial CPU, scene or UI roles and are intentionally **not** deletion candidates. The 11 research-only scripts are also active code, even though they are reviewed here for eventual retirement.

## Candidate group A — old Legacy unminified inputs (10)

`src/x.js`, `src/jsg.js`, `src/jsgx3d.js`, `src/tabs.js`, `src/xtc.js`, `src/DataX.js`, `src/Slider.js`, `src/NumFormatter.js`, `src/ControlPanel.js`, `src/ModelAnimation.js`.

**Evidence:** The original unminified `<script>` block in `CurvatureApp.html` is commented out. The active page instead loads `src/legacy/GraphX3DX.js`, `src/ui/ControlPanelX.js` and `src/ui/ModelAnimationX.js` (among other scripts). `src/make.bat` references all ten old input names, but it is a historical DOS `jsmin` recipe, **not a verified build**. It refers to `slider.js` while the repository file is `Slider.js` (case mismatch on Linux), and outputs `../GraphX3DX.js`, `../ControlPanelX.js`, `../ModelAnimationX.js`, not the currently loaded paths. Follow-up [provenance review #140.12.67](legacy-bundle-provenance.md) verified that the three active bundles match the ten historical inputs at the JavaScript token-stream level (with syntax checks). A byte-identical `jsmin.exe` rebuild and browser equivalence have **not** been demonstrated. These files are confirmed readable sources/provenance, not deletion candidates.

**Before action:** Keep the [bundle provenance audit](legacy-bundle-provenance.md) green; explicitly review the disabled debug switch, build recipe, browser behavior, original license notices and incomplete historical Git origin. If retiring the recipe, preserve its provenance and separately test that Legacy animations and their saved URLs still work in Opera. Do not un-comment ten scripts in production to 'test' them as a replacement without a scoped review.

## Candidate group B — 17 non-HTML diagnostics with literal consumers

This group contains:

- **GPU/ray diagnostic chain:** `CurvatureBouguerInvariant141227`, `CurvatureGpuBouguerPrecision141230`, `CurvatureGpuBouguerQuadrature141231`, `CurvatureGpuDsRk4Audit141241`, `CurvatureGpuDsRk4Shooting141241`, `CurvatureGpuGroundContact141226`, `CurvatureGpuHighPrecisionShooting141232`, `CurvatureGpuNumericalFloor141224`, `CurvatureGpuPrecisionAudit141222`, `CurvatureGpuPrecisionFoundation141228`, `CurvatureGpuPrecisionGeometry141229`, `CurvatureGpuPrecisionLimit141225`, `CurvatureGpuRootConvergence141223`, `CurvatureGpuAlgorithmAttribution141235` (all in `src/diagnostics/` with `.js` suffix).
- **Other diagnostics/tests:** `CurvatureGeometryDifferenceAttribution141237.js`, `CurvatureMigrationInventory.js`, `CurvatureSeparationAudit.js` (also `src/diagnostics/`).

**Evidence:** They are absent from active script lists for both apps **and** the single WebGPU research page, but each has an actual literal `require()` from a test or another source module; e.g., `CurvatureGpuPrecisionFoundation141228.js` has five source callers and four test callers. A missing browser script tag is **not** sufficient to show unused code: Node diagnostics, reproduction protocols and test-only algorithms can be deliberately retained even when not exposed in a UI.

**Before action:** Establish whether source callers run in retained research paths; locate `fs.readFileSync()`, dynamic imports, browser globals, diagnostics exports, and documentation; verify whether test fixtures are historical evidence or genuinely executable regression gates. Only after explicit decisions about preserving or archiving those functions, split any truly independent test-only components in a separate patch. Avoid replacing evidence with a broad deletion of GPU-named files.

## Candidate group C — 11 live research-only WebGPU modules

The independent research shell directly loads `CurvatureOpticalBatchContract1411`, `CurvatureWebGPUBatchDiagnostics14121`, `CurvatureWebGPUBatchShooting1412`, `CurvatureWebGPUEventGuard141214`, `CurvatureWebGPUOpticsBenchmark`, `CurvatureWebGPUOpticsMatrix1409`, `CurvatureWebGPUOpticsPrecision14091`, `CurvatureWebGPUPhysicalTolerance14123`, `CurvatureWebGPUPredictor141213`, `CurvatureWebGPURootRefinement14122` and `CurvatureWebGPUSceneSpike14010` (all `src/diagnostics/*.js`). Their associated numeric tests and research metadata remain retained. **These are active on the research page, not dead code.** See [WebGPU retirement from Modern Compare](experiments/webgpu-retirement.md) and [the curated experiment record](experiments/gpu.md). Retiring the whole research harness would require an explicit product decision and an archival/reproduction gate, not a filename filter.

## False positives to protect

- **WebGL2 is not WebGPU.** `src/renderers/CurvatureWebGLGeometryRenderer.js` is used by Modern's separate experimental *geometry painter* and must remain unaffected.
- The CPU-only research UI in Modern still calls `src/diagnostics/CurvatureGpuDsPainterGate141240.js`; the GPU-themed name does **not** make it removable. `CurvatureGpuPixelSpaceAudit141233.js` and `CurvatureGpuFullFrameParity141234.js` are also loaded in Modern for CPU diagnostic/camera-capture functionality. The test and fixture pin these dependencies.
- `src/legacy/GraphX3DX.js` is actually loaded by **both** Legacy and Modern. The shared `src/app/CurvatureModel.js` and `src/optics/OpticalRayTracer.js` are protected. Do not apply folder-wide `src/legacy/` or `src/diagnostics/` cleanup.
- `tests/fixtures/legacy-browser-references.zip` (six genuine Opera Canvas images), `tests/fixtures/legacy-headless-numerics.json`, old routes/demos and the `optics-baseline-2026-11` tag remain preserved.

## Baseline test debt encountered during this audit (resolved in #140.12.68)

Two independently verified failures already exist **unchanged** in the clean #140.12.65 baseline: `tests/WebGLGeometry1402.test.js` expects the old `ModernApp.js?v=140.12.30` URL while `CurvatureModern.html` now loads version `140.12.53`; `tests/ModernGpuPrecisionGeometry141229.test.js` invokes an undefined `mockedGpu()` in one test. These were **not** caused by the read-only audit. In #140.12.68, the version-pinned WebGL2 assertion was replaced with unique script/load-order checks, and synthetic GPU execution fixtures were restored for both precision arithmetic and geometry tests. These tests remain **Node mocks, not browser WebGL2 or actual WGSL/GPU execution**. See [regression test repairs](regression-test-repairs-140.12.68.md). The otherwise selected 92 Node tests (including the new candidate audit) passed.

## Limitations and acceptance gates

The inventory reads only *literal* static `<script src>` entries (plus commented-out HTML references), *literal* CommonJS `require()` targets and the historical `src/make.bat` input names. It cannot prove the absence of browser-global usage, JS strings used as dynamic paths, inline-script dependencies, `import()`, HTML/CSS assets, Python/shell consumers, external bookmarks or scripts, user modifications, publication workflows or old source reconstruction requirements. A test reference is evidence of *a consumer*, not evidence that the code is run in the browser. A historical build input is evidence of provenance, not a validated compiler. No shader execution, WGSL compilation or real browser validation was performed for this audit.

1. Keep this audit and the [Legacy preservation contract](legacy-preservation-contract.md) green. Before any module relocation/deletion, run Legacy's nine storyboards, controls, real bookmarks, and reference ZIP export in **Opera** (manual acceptance has not been completed), plus Modern Scene/Compare CPU and WebGL2 fallback checks.
2. Review the **10** old Legacy source/bundle inputs first for maintainability and historical provenance (a likely documentation/archival decision rather than a quick deletion).
3. If simplifying diagnostics, isolate individual **17** non-HTML modules only after checking their test/source consumers and ensuring retained research protocols still work. Prefer very small, independent patches.
4. The **11** live WebGPU research modules require an explicit decision on the canonical research page and scientific evidence. Do not accidentally retire research or pretend its shader kernels were tested.
5. For any future approved removal, identify exactly which browser modes/tests/fixtures are affected, commit one small change, validate on a clean apply and preserve CPU fused-gradient + rollback, Legacy animation and WebGL2 painter. No automatic 'remove all unused files' operation is permitted.

**Outcome:** a reviewable static inventory and a prioritized *investigation* plan. **No deletion**, no renamed HTML files, no changed physics/runtime/animation/renderer or GPU semantics.

## First bounded cleanup (#140.12.70)

The [first cleanup](controlled-cleanup-140.12.70.md) deletes only unused **CSS**
selectors from Modern's retired visual WebGPU probe, and renames the still-live
CPU research action wrapper in HTML/CSS. No source-module candidate from this
38-file audit was deleted or approved for deletion. The live WebGPU research
page, WebGL2 geometry renderer and CPU RK4 baseline are untouched.

## Subsequent Modern JavaScript cleanup (#140.12.71)

The [bounded dead-handler cleanup](controlled-cleanup-140.12.71.md) removed a
single unreachable Modern GPU success-export helper, a deprecated filename
lookup and writes to two private, unread state properties. No module from the
38-file candidate inventory was deleted; standalone WebGPU research, Legacy
animation and CPU physical rendering remain retained.
