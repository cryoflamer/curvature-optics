# Legacy feature migration plan

Status: **planning / evidence inventory, not a migration or deletion approval**. Prepared after the [Legacy assessment](legacy-ui-assessment.md), as historical Compatсh #140.12.56. This plan does not change runtime behavior or declare Legacy and Modern visually equivalent.

## Scope and decision rule

Keep **Modern physical-optics Scene/Compare** as the supported direction, but do not silently equate it with the older model, demos or original-versus-optical visualization. For each Legacy function choose one of:

- **Migrate** — implement and test a demonstrably needed Modern equivalent, with an explicit data contract.
- **Archive** — keep a reproducible Legacy source/checkpoint and representative evidence without adding UI controls to Modern.
- **Retire** — delete only after references, scientific-oracle status and URL compatibility have been resolved; write down the intentional loss.

The classifications below are *proposed dispositions*, not authorization to remove code or an assertion that a Modern counterpart already works. Prioritize preserving the optical CPU baseline, trace tolerances and reference comparisons over pixel-perfect reproduction of educational animations.

## Nine Legacy demonstrations: source-backed inventory

Source of truth: [`src/animation/CurvatureDemos.js`](../src/animation/CurvatureDemos.js). Every `Demos.New(...)` creates a demonstration; its `Demos.AddState(...)` calls are snapshots, not independent Modern presets. `Demos.AddAnimation(...)` supplies transitions, text and timing. `Reset` in [`CurvatureApp.html`](../CurvatureApp.html) is **not** a tenth demonstration.

| Legacy demo ID | Snapshot steps | Distinctive evidence | Proposed disposition and validation work |
| --- | ---: | --- | --- |
| `Curve` | 12 | Introductory curvature/flat comparison, camera motion and explanatory transitions | **Archive narrated playback**; migrate only an explicitly requested static teaching scene after identifying model differences. |
| `Causeway` | 6 | Pontchartrain Causeway bridge (`ObjType` 6) | **Candidate for selected static fixtures**, not a proven match to Modern's `pontchartrain` tower preset; compare bridge geometry and horizon before porting. |
| `TransLine` | 8 | Pontchartrain transmission towers (`ObjType` 3) | **Priority candidate for a scientific fixture**: preserve tower positioning/atmosphere and tower-21 diagnostics; compare Modern Scene/Compare outputs separately. |
| `Grace` | 9 | Anacapa Island/platform view, including bridge/mountain object types | **Archive pending geometry decision**; do not coerce unsupported Legacy shapes into Modern towers. |
| `Bedford` | 7 | Bedford marker (`ObjType` 0) | **Candidate for targeted static fixture** if marker geometry is physically comparable; retain Legacy visual evidence until proven. |
| `Tensas` | 6 | Little Tensas Bayou (`ObjType` 7) | **Archive** until Modern supports or intentionally replaces this geometry; an object-type substitute is not parity. |
| `Soundly` | 18 | Long Causeway observation sequence (`ObjType` 8), camera/bridge presentations | **Archive storyboard and representative frames**; do not recreate 18 UI steps merely to preserve an animation. |
| `Chicago` | 6 | Skyline (`ObjType` 4) | **Archive** while skyline object modeling is absent; make explicit before retiring Legacy. |
| `Canigou` | 8 | Mountain (`ObjType` 5) and atmospheric observation | **Archive** until mountain representation and refractive assumptions can be validated in Modern. |

**Inventory total: 9 demos / 80 `AddState` snapshots.** This count comes from the code currently in this repository, not from executed browser playback. Check it again whenever `CurvatureDemos.js` changes. For reproducibility, choose at least **first/mid/final** states per candidate demo and include their source-state indices, model parameters, capture size, selected atmosphere and expected observables; don't claim those reference captures exist until they are actually produced.

Modern has only `pontchartrain`, `single`, `rows` and `custom` scene presets (`ModernExperimentState.js`); its serializable `ObjType` is restricted to **0–3**, while the Legacy demo data above also use **4–8**. Even overlapping object-type integers are not proof that the draw geometry and optical projection are identical. Modern presets represent editable **physical-optics** scenes, not the 80 narrated Legacy frames.

## Serialized state and navigation compatibility

These are **separate** data formats with separate meanings:

| Interface | Wire evidence | Risk / proposed policy |
| --- | --- | --- |
| Legacy state URLs | `CurvatureStatePersistence.js`: `GetAppStateUrl()` uses `DataX.ToStream` and `&state=`; `HandleUrlCommands()` uses `DataX.FromStream` | Keep `?state=` routed to Legacy during transition; no untested direct interpretation as a Modern experiment. |
| Legacy text export | `GetAppState()` uses `DataX.ToJson('CurveApp', ..., CurveAppMetaData)` and `JsonToAppState()` expects `CurveApp = ` | Inventory fields and conversions; this is not Modern's allowlisted JSON schema. Avoid loading arbitrary Legacy text with eval/`Function`. |
| Demo URLs | `HandleUrlCommands()` reads `demo`, `pos`, `play`, `tab`, and assigns `#App` | Preserve semantics or provide explicit archived-route behavior. `demo` is not a Modern `preset`. |
| Modern experiments | `ModernExperimentState.js`: versioned allowlist, `?experiment=`, base64url codec, `?ui=modern` | Keep the current independent format and validation; do not make legacy input implicitly override an incoming Modern experiment. |
| Entry points | `ModernRoute.js`: bare `CurvatureApp.html` remains Legacy, `?ui=modern` redirects to Modern and the modern document restores canonical URL | Preserve `query` and `hash` handling in both HTTP and `file://` cases before flipping defaults. |

**Compatibility choice proposed:** first implement a *pure, explicitly invoked and validated* Legacy-to-Modern **conversion report** (supported fields, unsupported fields, lossy geometry/refractive features); do not silently import or rewrite old URLs. A migration bridge is not approved until representative real Legacy state strings and stream URLs are present as committed non-sensitive fixtures or recorded external evidence, with known expected outcomes.

Required checks before any routing cutover: bare URL; `?ui=legacy`; `?ui=modern&experiment=...`; `?state=...`; `?demo=TransLine&pos=...`; `?tab=...`; unknown query and hash; malformed data; duplicate params; both local server and file URLs where supported. Existing `tests/ModernUiBootstrap.test.js` and `tests/ModernExperimentState.test.js` provide only part of this matrix.

## Diagnostics, scientific oracles and utilities

| Area | Evidence | Proposed treatment |
| --- | --- | --- |
| Transmission tower angles, tower-21 calibration, P4 horizon and independent vacuum/atmosphere probes | Legacy `OpticsTowerDiagnostic` controls in `CurvatureApp.html`, related `src/ui/Optics*` handlers, `InverseAtmosphereLineQuality` modes | **Retain as scientific oracle or replace with equivalent headless tests** comparing numerical angles, contact/occlusion and relevant pixels. Don't assume Modern Compare has the same outputs. |
| Original/geometric vs optical rendering and frame/geometry export | `OpticsSceneComparison`, `CurvatureMainCanvasRenderer`, `src/legacy/` audit/replay, `src/diagnostics/GeometryDiagnosticsZip.js` | **Keep reference behavior** until independent fixtures cover its distinguishing outputs; preserve shared dependencies regardless of `legacy` directory name. |
| Legacy Save/Restore and `tab` selectors | `CurvatureStatePersistence.js`, `CurveSettingsTabs`, `SaveRestorePanel` | **Compatibility bridge or explicit deprecation**, not automatic conversion to Modern library. |
| Length calculator and computed-value panel | `LengthCalculator.js`, `LengthCalculatorPanel.js`, `ComputedValuesPanel.js` | **Separate product decision**: migrate only if still useful, otherwise archive documented formulas and intentionally retire the UI. |
| Playback transport, narration and demo links | `CurvatureDemos.js`, `CurvatureAnimations.js` | **Archive** as educational behavior; don't bulk-copy transport buttons into Modern. |
| Shared renderer/model dependencies and WebGL2 | `src/app/`, `src/optics/`, `src/renderers/CurvatureWebGLGeometryRenderer.js`, shared `GraphX3DX.js` | **Retain**. Legacy page deletion does not justify removal of shared physics, WebGL2 or control/reference algorithms. |

## Ordered implementation slices and acceptance gates

1. **Reproducible Legacy evidence** — [source-state fixtures for TransLine and Bedford](legacy-reference-scenarios.md) have now been added; rendered/numerical captures remain missing. Continue to add small, semantic-name fixtures containing representative real state strings/URLs plus an audited capture manifest. Prefer one scientifically meaningful transmission-tower view and one distinct Legacy geometry case. For images/ZIP outputs unavailable in the archive, record *missing*, not fabricated baselines. No removal here.
2. **Headless Legacy adapter tests** — [implemented for six same-code numeric snapshots](legacy-headless-reference.md): original `CurveApp.Update()` and `BaroModel` run in Node; geometry/camera/atmosphere field regression checks work without the browser. This does **not** make the original model an *independent* oracle: preserve its source, then obtain independent numerical and browser output evidence before retirement.
3. **Decide feature-by-feature** — for `TransLine`/candidate static examples, explicitly specify what Modern must reproduce, which object types/shapes are supported, and the accepted physical and pixel tolerances. Archive the other storyboards unless a concrete need changes the decision. No mass introduction of Modern presets.
4. **Compatibility boundary** — implement a clearly surfaced conversion report / archived-view fallback and test URLs, imports and bookmarks. Only then consider moving the default to Modern; ensure links in Modern no longer target a missing Legacy page.
5. **Progressive retirement** — remove Legacy-only controls and modules in narrow commits after an ownership/caller audit, replacing meaningful Legacy checks (`tools/check-browser.py` included) with accepted Modern/fixture smoke tests. Preserve CPU RK4 fused-gradient default, explicit legacy rollback, WebGL2 and scientific reference coverage.

### Definition of done before deleting `CurvatureApp.html`

- Every row above has a recorded **migrate / archive / retire** decision with acceptance evidence (not merely a proposal).
- Reproducible reference samples for retained scientific outputs are in the repository or explicitly linked to archived outputs; numeric and pixel checks are run and reported with environment, viewport, model and tolerances.
- All supported old URLs/states either work, clearly route to an archive, or are intentionally deprecated with tests; no silent corrupted conversions.
- Browser smoke covers both the old route decision and the Modern replacement; `tests/` and tooling no longer depend on a deleted file.
- Shared modules, WebGL2, CPU optical solver and rollback path remain covered. No runtime code is removed before these gates.

**Current decision:** Legacy stays. Source-state fixtures and limited headless numerical regressions for `TransLine` and `Bedford` now exist; **independent physical/optical and rendered browser evidence remain missing**. The next gate is a properly recorded browser reference capture and comparison contract, not Legacy deletion or a large Modern UI port.
