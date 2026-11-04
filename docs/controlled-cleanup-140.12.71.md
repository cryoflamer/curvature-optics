# #140.12.71 — Unused Modern diagnostic JavaScript cleanup

**Scope:** a small deletion of dormant Modern diagnostic JavaScript and write-only
closure state. No Legacy animation, CPU optics algorithm, physical renderer,
WebGL2 geometry path, WebGPU shader, research-page module, scene format or URL
route was changed.

## Evidence and decision

`src/ui/modern/ModernApp.js` contained a `numericAuditComplete(report)`
function left over from the retired Modern WebGPU success-export handlers. It had
**no runtime call sites**: its only other mention was in a test introduced by
#140.12.69, which exercised the otherwise-unused function in isolation. Its
`nameByVersion` lookup mapped obsolete WebGPU audit versions **140.12.21–35**
to historical filenames; the currently running CPU error handlers call
`numericAuditFailed()` with versions **140.12.38, .39, .42, .43 and .44**.
The old filename lookup was unreachable from those retained handlers.

The same Modern closure assigned `state.probeFrameLast` and
`state.probeExportLast` from successful CPU diagnostics (and on error), but
**never read either property**. The `state` object is private to the ModernApp
closure and neither property is exposed by `CurvatureModernApp`. Removing these
write-only assignments does not change the generated CPU reports, ZIPs,
visible status messages or pixel data. This static analysis does not rule out
external code that deliberately depends on private implementation details via
source modification.

The previous error status suggested using **Export JSON to retry** on a failed
automatic download; that UI action exports performance-profile data, not the
numerical audit. The surviving failure path now reports a download/permission
problem without claiming that a manual retry button exists.

## What remains operational

- `numericAuditFailed()` still gathers the failed CPU audit's version, stage,
  stack, error message and optional details, and exports its JSON via
  `downloadNumericAuditError()`. Its version-agnostic filename remains
  `curvature-compare-<version>-diagnostic-error.json`, identical to the former
  fallback for each active CPU diagnostic version.
- ZIP/PNG/JSON exports from all retained CPU research buttons still execute
  directly at their original call sites; they do **not** use
  `numericAuditComplete()` or the removed private cached state.
- Browser GPU **capability check** (`ModernGpuCheck`), experimental WebGL2
  geometry rendering, Modern Compare, profile reporting, and the independent
  `tools/webgpu-optics.html` research entrypoint are unchanged.
- Legacy (`CurvatureApp.html`, nine animations/demos, reference PNGs and
  original URL behavior) is untouched. Baseline CPU RK4/fused-gradient code
  and saved `optics-baseline-2026-11` history remain intact.

The historical filenames and associated findings remain preserved in archived
research evidence and documentation, not in the live Modern UI.

## Regression checks

```sh
node --check src/ui/modern/ModernApp.js
node --test tests/ModernDeadHandlerCleanup141271.test.js tests/ModernGpuAutomaticAuditExport1412311.test.js
node --test tests/ModernRetiredGpuStyleCleanup141270.test.js tests/ModernWebGPURetirement141253.test.js tests/ModernGpuCapabilities1400.test.js
node tools/audit-legacy-isolation.js --check
node tools/audit-dead-code-candidates.js --check
node tools/check-legacy-preservation.js --check
```

The new tests exercise the actual retained exporter using simulated Blob,
URL and anchor objects, including blocked and unsupported downloads. They
ensure obsolete handlers/state do not reappear and that active CPU/GPU
capability/WebGL2 entrypoints remain wired. They do not instantiate a real
browser, run WebGL2, compile WGSL or prove numerical parity. A manual Modern
Scene/Compare CPU diagnostics and Check GPU smoke test remains recommended.

This change does **not** approve deletion of any of the 38 candidates in the
original source-module inventory: no complete `src/**/*.js` module is removed.

## Follow-up #140.12.72

The [Modern helper reachability review](controlled-cleanup-140.12.72.md)
confirmed that all 16 Modern UI helper modules are directly loaded by the
active page; none was removed. Only the write-only private `state.graph`
assignment/initializer was deleted, with an explicit Scene/Compare graph
preservation regression guard.
