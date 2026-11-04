# #140.12.72 — Modern helper reachability and private-state cleanup

**Scope:** review the individual Modern UI JavaScript helpers before attempting a
whole-module deletion; remove one demonstrably write-only `ModernApp` closure
field. No physics, rendering algorithm, Legacy route/demo, WebGL2 painter,
WebGPU research kernel, URL, DOM, CSS or HTML entrypoint was changed.

## Evidence and decision

The active `CurvatureModern.html` contains `<script src>` references to **all
16** JavaScript files in `src/ui/modern/`. Fifteen are included once and
`ModernCompareGraph.js` is included **twice**, with independent parser-time
`data-compare-side="A"` / `"B"` arguments. The primary `ModernApp.js`
bootstraps the Scene Canvas first; the two Compare Canvas scripts run after
it. The other fourteen helper modules are loaded before the Scene bootstrap.

These 16 files cannot be considered unused merely because they are in an
auxiliary directory or expose APIs called only from the page. In particular,
removing or deduplicating `ModernCompareGraph.js` would break the independent
A/B Canvas contract. The existing static [isolation inventory](legacy-isolation-audit.md)
and [candidate audit](dead-code-candidate-audit.md) remain the larger sources
of truth. This review does **not** authorize deleting a complete module.

The `ModernApp.js` closure initialized `state.graph` to `null`, then set
`state.graph=graph` immediately after creating its Scene `NewGraphX3D` object.
There were **no reads** of `state.graph` or computed `state['graph']` accesses:
all rendering, camera gestures, redraw scheduling and Scene graph selection
use the local `graph` variable directly. Since the private `state` object is
never exported as an API, this assignment and its initializer were redundant.
Only those two pieces were removed. `graph` creation, the independent A/B
registrations, and all public Modern app bindings are unchanged.

This is a static source audit plus Node regression test, not proof of exhaustive
runtime reachability through browser extensions, dynamically injected scripts,
or external consumers. A future full-module retirement requires a separate
runtime dependency and browser acceptance review.

## Regression gate

`tests/ModernHelperReachability141272.test.js` verifies:

1. All 16 Modern helper `.js` files are present and referenced by active Modern
   script tags, without unexpected duplicate loads.
2. `ModernCompareGraph.js` is executed twice for **A** and **B**, in order,
   after the Scene bootstrap.
3. Other helper scripts appear before `ModernApp.js`.
4. Scene `NewGraphX3D` creation and Compare registration remain connected to
   the local graph, and the write-only `state.graph` field stays absent.

```sh
node --check src/ui/modern/ModernApp.js
node --test tests/ModernHelperReachability141272.test.js tests/ModernUiBootstrap.test.js
node tools/audit-legacy-isolation.js --check
node tools/audit-dead-code-candidates.js --check
node tools/check-legacy-preservation.js --check
```

The historical six-frame Opera visual-reference ZIP remains untouched, as do
CPU RK4/fused-gradient and its `traceOptimization: 'legacy'` fallback. Node
checks do **not** render a real Opera browser viewport, measure performance,
or compile WGSL. Manual Scene/Compare A/B and Legacy storyboard smoke tests
remain necessary before broader module removal.

## Follow-up

Continue investigating unreferenced **private** symbols in individual modules,
while retaining all public helper APIs and archived scientific diagnostics
unless their usage and reproducibility have been explicitly evaluated. Avoid
claiming a whole JavaScript file is dead based on a static name search alone.
