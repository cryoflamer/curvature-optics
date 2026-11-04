# #140.12.70 — First bounded UI cleanup

**Scope:** retired WebGPU-probe presentation styles in the Modern page. This is a
small, actual removal of unused stylesheet rules, **not** a GPU algorithm
retirement or a migration of the Legacy animation engine.

## Verified source evidence

- `CurvatureModern.html` and `src/ui/modern/ModernApp.js` do not use
  `.modern-gpu-probe-maps` or `#ModernGpuProbeStatus`; neither selector has a
  source, tool or test consumer other than its obsolete definition in
  `src/ui/modern/ModernApp.css`. These belonged to the old visual probe panel.
- The remaining `.modern-gpu-probe-head` **was** used, but only for buttons in
  the CPU-only `ModernCpuResearch` section. It is renamed consistently in
  HTML and CSS to `.modern-cpu-research-actions` while retaining the same flex
  layout, label style, button spacing, borders and button background. The
  unused `select` style was dropped because that section contains no select.
- The browser's GPU **capability** diagnostics (`ModernGpuCheck`) are a
  separate active feature and remain intact. So do the WebGL2 geometry
  renderer, modern profiler, CPU RK4, and `tools/webgpu-optics.html` research
  harness. The Legacy HTML, demonstrations and visual references are untouched.

## Change and evidence limits

Only the Modern HTML class name and its stylesheet rules were changed at
runtime. No JS, physical model, renderer, event handler or WebGPU kernel was
edited. Static source inspection supports the orphan-selector finding; it does
not prove that an external stylesheet or custom injected DOM never used these
names. The browser rendering of the renamed group should still receive a
manual Modern Scene/Compare smoke check, since Node tests do not render CSS.

This **does not** change the 38 source-module candidates catalogued in
`docs/dead-code-candidate-audit.md`: no `src/**/*.js` module has been removed
or approved for removal.

## Reproduction

```sh
node --test tests/ModernRetiredGpuStyleCleanup141270.test.js
node --test tests/ModernWebGPURetirement141253.test.js tests/ModernGpuCapabilities1400.test.js
node tools/audit-legacy-isolation.js --check
node tools/audit-dead-code-candidates.js --check
node tools/check-legacy-preservation.js --check
```

Browser acceptance: open `CurvatureModern.html`, expand **Compare → CPU optics
research diagnostics**, verify button wrapping and run a CPU diagnostic; then
verify the separate **Check GPU** capability panel and WebGL2 geometry option
are still accessible. `CurvatureApp.html` animations should remain unchanged.
