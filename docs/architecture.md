# Architecture — current runtime

This page describes the **active post-#140.12.74 tree**, not the chronological migration plan. For practical controls, see [user guide](user-guide.md); for ray equations, see [physics](physics.md).

## One primary Modern entry and a preserved Legacy diagnostics entry

```text
CurvatureApp.html?ui=legacy (diagnostics)    CurvatureModern.html (primary)
  Legacy animation/control UI                 Scene / Compare A-B / Demos UI
  CurvatureDemos, ModelAnimation              ModernApp, Scene/Compare state
               |                                         |
        CurvatureModel.js                     CurvatureModel.js
               |                                         |
    Legacy drawing and diagnostics         Physical scene assembly
               |                                         |
          shared scene / geometry / optical / rendering modules
```

- `CurvatureApp.html?ui=legacy` loads the original demo and playback stack, backed by the authored catalog in `src/animation/CurvatureDemos.js`, the instance factory in `src/animation/LegacyDemoManager.js`, `src/app/CurvatureModel.js` and browser controls. Its nine demonstrations contain **80 key states / 71 defined transitions**, as pinned by [the preservation contract](legacy-preservation-contract.md). Its fast animation should **not** be silently replaced with an RK4 per-frame animation.
- **Modern Demos** loads a dedicated, slim `CurvatureDemosHost.html` (not the old `CurvatureApp.html`) in a same-origin isolated frame, using the narrow catalog/state/command bridge (`ModernDemos.js` and `LegacyDemoEmbed.js`). The dedicated host now exposes a same-origin `subscribe`/`command` runtime port, which Modern uses directly; the older `postMessage` bridge remains a compatibility fallback. This removes the dependency on the standalone Legacy HTML shell; its controller has injected manager/output ports and the isolated host uses a DOM insertion port instead of `document.writeln`, but the renderer still has Legacy globals, so the iframe remains an isolation boundary for now. See [host migration notes](demo-engine-host.md). The nine demo families remain authored exclusively in `CurvatureDemos.js`; changing demos stops playback, with no conversion to RK4 or Modern experiment state.
- The Legacy runtime now constructs its model and Canvas through `src/app/LegacyAppContext.js`. Its model-state port can deserialize into an explicitly supplied `CurveAppClass` instance, and its redraw port owns the mounted `GraphX3D` instance. The historical `CurveApp` and `graph` globals remain compatibility aliases: other renderer, panel and animation modules still access them, so **this does not make direct in-document mounting or iframe retirement safe yet**. The context factory is tested with two isolated model/Canvas pairs.
- The authored `DrawModel(g)` entrypoint now also accepts an explicitly supplied model as its **third** argument (`DrawModel(g, diagnosticOptions, model)`). Horizon/object partitions and geographic point helpers receive that same model, and the normal Canvas presenter passes its owning `legacyAppContext.model` through the frame-audit bridge. Old one- and two-argument calls, including controlled diagnostic captures, still use the Legacy global for compatibility. This isolates the geometry **model reference**, not the remaining drawing DOM, audit globals or `ControlPanels`; direct Modern mounting is not yet safe.
- Legacy Canvas routing now lives in `src/app/LegacyCanvasPresenter.js`. Each presenter receives the model, renderer, mode, diagnostic capture and fallback through explicit ports; two presenters can use independent graphs and status displays in one JS realm. `DrawMainCanvasFrame()` remains the historical callback for `GraphX3D`. This is a **draw-routing boundary**, not complete isolation of legacy drawing globals or a justification for removing the Demos iframe.
- `CurvatureModern.html` loads its own UI (`src/ui/modern/ModernApp.js`), state validators, scene composition and renderers. **Scene** has one viewport; **Compare** renders two physical configurations using separate A/B graphs with shared camera/object inputs. Compare A and B can use different surface and atmosphere settings.
- `src/ui/modern/ModernRoute.js` routes bare `CurvatureApp.html` and old `?ui=modern` bookmarks to the **canonical `CurvatureModern.html` document** without rewriting browser history back to Legacy. Explicit `?ui=legacy` and historical `?state=`, `?demo=`, `?pos=`, `?play=`, `?tab=`, `?embed=` links still boot the unchanged Legacy runtime for reference and compatibility. Legacy `?state=` and Modern `?experiment=` are **different formats** and are not interchangeable.

Both entry points load some of the same code. In particular, `src/legacy/GraphX3DX.js` is used in **both**. Directory names are insufficient evidence for deletion or ownership.

## Source ownership and flow

| Layer | Notable files | Responsibility |
| --- | --- | --- |
| Browser UI | `src/ui/modern/ModernApp.js`, `ModernSceneState.js`, `ModernCompareState.js`, `ModernExperimentState.js`, `ModernExperimentLibrary.js` | Validated user inputs, A/B configuration, versioned URLs, local experiment storage |
| Application/model | `src/app/CurvatureModel.js`, `LegacyAppContext.js`, `CurvaturePhysicalCamera.js`, `CurvatureMainCanvasRenderer.js` | Shared model inputs, physical camera and rendering orchestration |
| Physical geometry | `src/geometry/CurvatureSurfaceGeometry.js`, `CurvaturePhysicalWorldGeometry.js`; `src/scene/` | Flat/spherical surfaces, object placement, scene/frame contracts |
| Optical solver | `src/optics/OpticalRayTracer.js`, `OpticalTargetProjection.js`, `OpticalSharedRayField.js`, `OpticalRayHorizon.js` | 2D refracted ray integration, target projection, first-ground-contact classification, reuse of optical fields |
| Scene optics | `src/optics/CurvaturePhysicalSceneOptics.js`, `CurvaturePhysicalPolygonFills.js`, `OpticalTowerSilhouette.js` | Visibility and physical scene projection |
| Presentation | `src/renderers/CurvatureFrameRenderer.js`, `CurvatureWebGLGeometryRenderer.js` and Canvas renderers | Rasterize/project prepared scene geometry; optional WebGL2 path |
| Legacy storyboard | `src/animation/CurvatureDemos.js`, `LegacyDemoManager.js`, `src/animation/ModelAnimationX.js`, `src/legacy/` | Authored demonstrations, separately instantiable playback manager and Legacy drawing |
| Verification | `tests/`, `tests/fixtures/`, `tools/check-refactor-closure.js` | Behavioral, numerical and reference-image checks |

Not every module is solely owned by the listed layer. Verify **actual callers and HTML script order** before moving or deleting it. The [isolation audit](legacy-isolation-audit.md) records that discipline; some older counts in it predate the research archival and should not be interpreted as current counts.

## Rendering and performance boundaries

1. The physical optical solution is computed on the **CPU** (the production standard-atmosphere path uses a fused-gradient RK4 optimization); this is independent of the final rasterizer.
2. **Canvas 2D** is the default/reference drawing backend in Modern. The selectable **WebGL2** geometry renderer rasterizes already projected geometry and may differ in line styling/antialiasing; selecting it does not move shooting to a GPU.
3. **Check GPU** queries browser capabilities only. It is not the archived WebGPU optics solver. The optional render profiler is part of Modern diagnostics and is distinct from the removed ten-action CPU research panel.
4. Legacy's animation is optimized for its own presentation/model; preserving it does not mean reproducing its frames with Modern's expensive physical optics.
5. **Atmospheric extinction (optional visual effect):** `CurvatureAtmosphericVisibility.js` modifies Physical object strokes and foundations **after** the cached CPU optical rays have been solved, before the shared Canvas 2D/WebGL2 painter. A visibility range is the approximate 5%-contrast distance: `T = exp(-3 × distance / range)`, with white airlight to match the white Canvas background. Distance is the authored object's observer-relative **geometric range**, a near-horizontal approximation to the optical path, **not** the integrated ray length. Extinction is separate from `n(h)`, horizon/footing classification and clipping. Original optical compositions and ground guides remain unchanged, so changing visibility does not require shooting new rays. Scene and Compare A/B have independent, persistable settings; older URLs load with extinction off. This is not a calibrated atmospheric-scattering or depth-per-pixel simulation.
6. **Horizon palette parity:** Legacy paints behind-horizon towers with `#666` strokes and `#dcc493` foundations, masks them with a white horizon disk, then paints foreground towers with black strokes and `#a38d60` foundations. The independent geometric compositor reproduces this two-pass styling (in Scene/Compare where that compositor is selected); the Physical path colors visible tower contours according to the **optically classified footing** using that same palette, while its ray-traced silhouettes and sampled polygon fills continue to clip the actually blocked portions. The Physical classification uses the same atmosphere-dependent field as the outlines/fills, never the Legacy disk cutoff; ambiguous or failed footing probes remain at their original styling instead of being labelled blocked. Because a whole tower is tinted from one sampled footing, this is a presentation cue, **not** a pixel-level visibility test or a claim about mesh occlusion. Refracted visibility and ground clipping belong to the physical ray solver. The Legacy Demos iframe continues to use its original renderer.

## State persistence and compatibility

- Modern configuration is an allowlisted, versioned payload managed by `ModernExperimentState.js`. **Copy experiment URL** writes a Modern `?ui=modern&experiment=...` link. The **Experiment library** stores named configurations in browser local storage (`curvature-modern-library-v1`) and supports JSON export/import. This library remains active and is **not** an archive of research benchmarks.
- Legacy uses its existing `?demo=...`, one-based `?pos=...`, `?play=...` and `?state=` semantics. For actual precedence and delayed application, see [Legacy preservation](legacy-preservation-contract.md).
- There is **no promised one-to-one conversion** of Legacy demos or saved states to Modern. See [compatibility findings](legacy-modern-compatibility.md) for the mapping barriers.

## Protected and historical boundaries

**Keep in active tree:** Legacy demos and export, Modern Scene/Compare, production CPU RK4, WebGL2 geometry rendering, required shared modules, physical regression tests, six original Legacy browser reference PNGs and their checksum lock.

**Archived in Git:** standalone `tools/webgpu-optics.html`, the Modern CPU research panel, dedicated CPU/WebGPU research modules and their research-only tests (removed in #140.12.74). The source can be inspected through the [research archive](research-archive.md), provided the pre-removal tag exists in the target clone. Do **not** mistake the retained `OpticalConformalPredictor.js` dependency or GPU capability panel for a revived user-facing experiment.

A future refactor should begin with a specific defect or maintenance goal and pass the [development verification](development.md), rather than another speculative sweep for unused code.

## Focused architectural references

The general architecture above is the current entry point. Keep the following
specialized evidence accessible where maintenance or regression analysis needs
it: [Legacy bundle provenance](legacy-bundle-provenance.md),
[Legacy / Modern compatibility limitations](legacy-modern-compatibility.md),
[camera interaction baseline](modern-camera-interaction-baseline.md), and
[WebGL2 renderer scope](modern-gpu-geometry.md). Earlier step-by-step migration
and cleanup notes are recoverable through [historical records](historical-records.md).
