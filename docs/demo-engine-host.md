# Dedicated Legacy Demos engine host — #140.12.79

The Modern **Demos** tab loads `CurvatureDemosHost.html?embed=demos`, not
`CurvatureApp.html`. The new host owns the original `JsGraph1` Canvas, model,
`Demos` catalog, `ModelAnimation` timeline and parser-time hidden control
panels. The standalone Legacy page is still supported and unchanged.

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
iframe URL in developer tools. Finally open standalone `CurvatureApp.html` to
check that its reference animations still work.

## Next step, not included here

Extract a browser-independent Legacy demo runtime with injected Canvas/DOM
ports, remove parser-time `document.writeln` and globals, and then replace the
iframe with a direct Modern component. Do not delete `CurvatureApp.html` until
this is implemented and visually compared against the protected Opera
reference fixtures.
