# Compatibility patch 94: HTML entrypoint extraction

## Scope

The parser-inserted JavaScript and CSS previously embedded in `CurvatureApp.html`
were extracted without changing mathematical algorithms, drawing parameters,
or diagnostic output formats. The HTML now contains markup and **synchronous**
external classic-script references. No bundler, imports, modules, `async`, or
`defer` are required for opening the page directly.

### Responsibility map

| Location | Responsibility |
| --- | --- |
| `CurvatureApp.html` | Browser entrypoint, app markup, ordered includes |
| `src/ui/CurvaturePage.css` | Page-specific styles formerly in `<style>` |
| `src/legacy/CurvatureLegacyDrawing.js` | `DrawModel`, shape drawing, object placement, horizon and surface helpers |
| `src/app/CurvatureAppRuntime.js` | `CurveApp` model, controls, graph bootstrap, diagnostic export handlers |
| `src/ui/Optics*.js` | Optics toolbar/diagnostic controls and event wiring |
| `src/ui/panels/*.js` | On-the-spot control panel registration and rendering |
| `src/animation/CurvatureAnimations.js` | Animation definitions |
| `src/animation/CurvatureDemos.js` | Demo state manager and built-in demos |
| `src/app/CurvatureAtmosphere.js` | Legacy atmospheric/refraction calculations |
| `src/ui/LengthCalculator.js` | Units calculator model and updates |
| `src/app/CurvatureStatePersistence.js` | Import/export, save/restore and link handlers |

## Deliberate compatibility decisions

1. `CurvatureLegacyDrawing.js` is loaded **before** `CurvatureAppRuntime.js` so
   `DrawModel()` and shape functions already exist when the graph is created.
2. Panel scripts remain next to their original DOM containers. The legacy
   `ControlPanels.*.Render()` calls depend on **parser-time execution**, so
   moving the scripts to the end of the page, using `defer`, or loading them as
   ECMAScript modules could change the UI layout or initialization semantics.
3. The optics event-handler scripts likewise remain next to the associated
   controls. They continue sharing the existing global application state.
4. `javascript:` links for the Save/Restore actions are replaced with regular
   links using `data-state-action`; `CurvatureStatePersistence.js` attaches the
   handlers and prevents hash navigation. The public function names remain.
5. The original ISO-8859-1 text encoding is preserved for the extracted sources
   so the page and external classic scripts retain their original encoding.
6. Node static-inspection tests load the **actual** runtime/drawing files via
   `tests/helpers/readCurvatureSources.js`, rather than relying on removed inline
   copies. Browser-asset and load-order checks read the real HTML entrypoint.

## Verification

Run `node --test tests/*.test.js`. The additional
`tests/CurvatureEntryExtraction.test.js` checks the HTML entrypoint for inline
code, file paths, dependency order, parser-time panel placement, JS syntax and
Save/Restore event wiring.

No pixel-level rendering equivalence is claimed by this source-only move.
After applying the patch, manually open `CurvatureApp.html` and test the
renderer, sliders, demo tabs, Save/Restore controls, optics and geometry ZIP
export. Migration of `DrawModel` itself to the new renderer is a **separate**
architectural change, not part of this patch.
