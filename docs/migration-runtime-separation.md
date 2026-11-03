# Compatpatch 95 — Runtime ownership separation

## Goal

Reduce the responsibilities of `src/app/CurvatureAppRuntime.js` without changing
camera formulas, model update rules, old rendering, or the diagnostic export format.

The code is still made of **classic synchronous scripts** using browser globals.
This patch deliberately does not introduce an ES module loader or change the
application's public globals.

## Entry-point execution order

The scripts immediately before the settings tabs are now:

1. `src/legacy/CurvatureLegacyDrawing.js` — `DrawModel`, `DrawShape`, helpers.
2. `src/app/CurvatureModel.js` — `CurveAppClass`, metadata, `Update()`,
   `UpdateObjectInput()`, and angle helpers. **Defines** the constructor but
   does not instantiate the app.
3. `src/diagnostics/CurvatureLegacyFrameCaptureController.js` — opt-in frame
   capture, export handlers, and `DrawModelWithOptionalAudit` callback. Event
   handlers are registered synchronously after their DOM controls exist.
4. `src/app/CurvatureAppRuntime.js` — creates the global `CurveApp`, declares
   `UpdateAll`, registers page-load initialization, and creates the graph.

Diagnostics functions can refer to `CurveApp` and `graph` when called later;
those globals are created in step 4. The graph's `DrawFunc` is already declared
in step 3, so the first graph render can use it. The synchronous script order
is important; **do not mark these tags `async` or `defer`** without an
independent initialization redesign.

The scripts for parser-time control panels stay in place after the graph.
The optics, animations, saved-state handlers, and mathematical code were not
changed by this patch.

## Verification

- `node --test tests/CurvatureEntryExtraction.test.js tests/CurvatureRuntimeSeparation.test.js`
  checks source ownership, import order, parsing and a simulated classic-script
  startup (including model creation, drawing callback and registered buttons).
- Run all project tests with `node --test tests/*.test.js`.
- In a browser, reload `CurvatureApp.html`, change Height and a view slider,
  switch Globe/Flat, run and stop a demo, and press **Export geometry diagnostics
  (ZIP)**. Check for a downloaded ZIP and look for any error in the console.

A Node VM startup test does not replace an actual interactive browser check.

## Next step

Define a stable, renderer-independent `SceneFrame` contract, while keeping
legacy rendering available until the independent path is fully wired.
