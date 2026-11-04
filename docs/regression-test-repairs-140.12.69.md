# #140.12.69 — Retired Modern GPU test assumptions (test-only)

This patch resolves **four previously reproduced failures** in the unchanged #140.12.67/#140.12.68 baseline. It does not alter the applications, experimental WebGPU kernels, browser routes, CPU RK4 baseline, animations, or any renderer.

## 1. Geometry-attribution experiment is no longer a Modern UI entrypoint

`tests/ModernGeometryDifferenceAttribution141237.test.js` had demanded the #140.12.37 script tag and in-app `probeGeometryAudit` callback. Those were removed from the active Modern interface when the WebGPU experiment path was retired in #140.12.53. The updated test **explicitly asserts their absence**, while retaining the existing numerical/source-linked attribution tests and checking that the optional `CurvaturePhysicalSceneOptics` and `CurvatureMainCanvasRenderer` collector hooks still exist. The separate `ModernGeometryCaptureCache1412372` test exercises real CPU painter capture.

This distinguishes *retired UI wiring* from *preserved standalone diagnostics*; it does not claim the old UI workflow remains available.

## 2. Historical numeric-export behavior without ghost GPU callbacks

`tests/ModernGpuAutomaticAuditExport1412311.test.js` previously expected ten `runGpu...()` handlers to still live inside `ModernApp.js`. Those handlers are no longer in Modern, though their historical research modules and tests are retained. Instead, the revised test extracts **the actual retained** `downloadNumericAudit`, `numericAuditComplete`, and `numericAuditFailed` helper implementations from the application source and executes them with a small deterministic Blob/URL/anchor host. It checks:

- Actual serialized JSON, historical version-dependent filename, a version-agnostic fallback name and object URL revocation;
- Error JSON with `ok:false`, stage, message, stack and details (never fabricated success);
- Blocked anchor clicks or missing browser Blob support yield a failure status rather than success;
- The current CPU diagnostic button wiring is explicit, and the old GPU handlers/buttons are absent from Modern.

The `numericAuditComplete` function is **retained but not currently called by a running Modern audit**; these tests exercise its helper contract, **not** a restored GPU workflow. Similarly, there is no dedicated user-facing manual-retry button for this historical JSON exporter; the old test's claim of such a control was incorrect. The separate `ModernPerfExport` button exports the profiler snapshot, not the old numerical audit. These tests do not run a browser, a real GPU, or compile WGSL.

## Reproduce

```sh
node --test tests/ModernGeometryDifferenceAttribution141237.test.js tests/ModernGpuAutomaticAuditExport1412311.test.js
node --test tests/ModernGeometryCaptureCache1412372.test.js tests/ModernGpuPrecisionFoundation141228.test.js tests/ModernGpuPrecisionGeometry141229.test.js tests/WebGLGeometry1402.test.js
node tools/audit-legacy-isolation.js --check
node tools/audit-dead-code-candidates.js --check
node tools/audit-legacy-bundle-provenance.js --check
node tools/check-legacy-preservation.js --check
```

A previously attempted whole-suite execution in #140.12.68 did not complete successfully and must not be described as passing. This patch fixes only the four specifically reproduced failures. Full browser/manual Opera animation, Modern Scene/Compare and shader-compilation smoke tests remain separate acceptance gates for code deletion.

**Deletion approved:** none. **New HTML files:** none. **Source/runtime modifications:** none.

## Follow-up #140.12.71

The purpose of this test-only repair was to replace invented GPU callbacks with
real implementation checks. A subsequent
[bounded JavaScript cleanup](controlled-cleanup-140.12.71.md) established that
`numericAuditComplete()` had no runtime callers and removed it, along with the
obsolete filename map and write-only state. The export test now exercises only
the retained CPU **failure** handler; the success-export assertions above
describe #140.12.69's historical test state, not the current Modern runtime.
