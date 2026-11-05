# Dedicated Legacy Demos engine host — #140.12.79

The Modern **Demos** tab loads `CurvatureDemosHost.html?embed=demos`, not
`CurvatureApp.html`. The new host owns the original `JsGraph1` Canvas, model,
`Demos` catalog, `ModelAnimation` timeline and parser-time hidden control
panels. The standalone Legacy diagnostic runtime is still supported by explicitly opening `CurvatureApp.html?ui=legacy` or a historical demo/state URL; bare `CurvatureApp.html` redirects to Modern.

The host uses the **same script sequence as Legacy**, excluding the optional
Legacy reference-export UI, the Modern redirector and the old embed entrypoint
(which is included separately at the top of the host). Do not change this order
without running `tests/ModernDemoEngineHost141279.test.js`. All nine families
and authored animation states still come from `src/animation/CurvatureDemos.js`,
not from this document or Modern UI. The narrow postMessage bridge between
`LegacyDemoEmbed.js` and `ModernDemos.js` handles catalog, state and commands.

## Current boundary, and why an iframe remains

This change **decouples Demos from the old HTML shell**, but does **not** claim
to remove the nested browser realm. The Legacy code still uses global names
(`CurveApp`, `Demos`, `graph`, `ControlPanels`, `Tabs`), synchronous
`document.writeln` during graph/panel construction, and browser load hooks.
Loading those modules directly into the Modern document would collide with
Modern's runtime and risk changing both modes. The same-origin iframe remains
a deliberate intermediate safety boundary until those globals and parser-time
DOM dependencies can be encapsulated in a real reusable runtime.

## Testing and acceptance

Run:

```bash
node --test tests/ModernDemoEngineHost141279.test.js \
  tests/ModernLegacyDemos141277.test.js \
  tests/ModernLegacyDemos141278.test.js
node tools/check-refactor-closure.js
```

These tests validate dependency
order, supported DOM anchors, messaging and unchanged Scene/Compare isolation,
but **cannot validate rendered pixels in a browser**.

From a local HTTP server, open `CurvatureModern.html`, choose **Demos**, and
try all nine families. Verify Play/Pause, Next/Previous, Restart, switching
families while playing and returning from Scene/Compare. Confirm that
`CurvatureDemosHost.html?embed=demos` (not `CurvatureApp.html`) is the loaded
iframe URL in developer tools. Finally open `CurvatureApp.html?ui=legacy` to
check that its reference animations still work.

## #140.12.80: controller and DOM creation ports

The embedded playback adapter now exposes `CurvatureLegacyDemosController.create`
with injected `getDemos`, `publish`, `catalog`, and optional `redraw` callbacks.
The controller contains demo switching, stepping, playback and state reporting;
**only the adapter** handles `postMessage`, origin checks, and `load` events.
It can be instantiated without a `window.parent`, `document`, or messaging.
`dispose()` stops playback and restores the original `UpdateDemoPanels` hook.

The dedicated host additionally loads `LegacyDemoDomMount.js`. When present,
the original `document.writeln` calls in GraphX3DX and ControlPanelX are
intercepted **only in that host** and inserted as DOM markup next to the
executing script. The two historically frozen Legacy bundles are byte-for-byte
untouched. An explicit mount target is also supported for DOM-ready mounting
later. The standalone Legacy page **does not load this port** and retains the original parser-time path. Check with:

```sh
node --test tests/LegacyDemosMountBoundary141280.test.js
```

This stage still uses a same-origin iframe. Its renderer, model and many panel
scripts are not namespaced yet, so it would be unsafe to load all 94 scripts
into the Modern global realm. The DOM port and injected controller address
**two prerequisites**, not complete isolation. Opera visual parity is not
certified by Node tests; compare playback and switch behavior manually.

## Instance-scoped Demos manager

`src/animation/LegacyDemoManager.js` now owns the original playback manager
methods behind `CurvatureLegacyDemoManager.create(ports)`. Each instance owns
its own demo registry, selection, playback state and animation callbacks. The
factory receives functions for model access, creating animations, applying
serialized states, repainting, registering button handlers and updating UI.
There are **no direct references to global `Demos`, `CurveApp`, `Tabs` or
`document` inside the instance methods**. The original nine demo definitions
remain in `CurvatureDemos.js` and are registered against its default instance.

Both `CurvatureApp.html` and `CurvatureDemosHost.html` load the factory before
the authored catalog. No Legacy storyboard strings or animation definitions
were rewritten. `tests/LegacyDemoManagerInstances.test.js` exercises two
managers with the same demo name in a single JS realm and checks that state,
UI callbacks and playback do not cross between them. The Legacy-preservation
test still evaluates the original authored demo catalog and its 80 states.

**Remaining obstacle:** only the manager is instance-scoped, not the whole
Legacy application. The original registration code, `CurveApp` model,
`graph`, `Tabs`, `ControlPanels` and parser-time runtime bootstrapping still
use globals. The iframe is still required in the working Modern Demos UI.
Do not interpret factory tests as browser pixel parity or permission to
remove the iframe.

## Next step, not included here

Make the remaining model/graph/panel dependencies instance-scoped, then
construct an isolated canvas/runtime without polluting Modern's global realm.
Remove the iframe **only after** actual Opera playback and visual parity
checks of all nine families. Do not delete `CurvatureApp.html` before this
is verified against protected reference fixtures.

## Legacy drawing model reference

The existing `LegacyCanvasPresenter` now passes its owning
`legacyAppContext.model` through `DrawModelWithOptionalAudit` to the original
`DrawModel`. A **third, optional** `DrawModel(g, diagnosticOptions, model)`
argument selects a model explicitly. The scene's horizon partitions and
`PointOnEarth` / `PointOnPlane` helpers propagate that model instead of
unconditionally reading global `CurveApp`. Older calls without a model are
unchanged, including controlled capture tools that temporarily replace the
compatibility alias. The nine authored scenarios and physical calculations are
unchanged.

`node --test tests/LegacyDrawingModelPorts.test.js` verifies two independent
models in the same JavaScript realm, the original implicit-model path, and
actual horizon/coordinate helper calls. This is a **model-reference boundary**:
`DrawShape` still reads browser DOM and audit globals, and `ControlPanels`
and the authoring/bootstrap scripts still rely on classic browser globals.
Therefore the Demos host iframe remains required; no browser pixel-parity
claim is made by these Node tests.
