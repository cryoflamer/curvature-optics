# #140.12.68 — Regression test repairs (test-only)

This patch repairs three failures from the clean #140.12.67 baseline without modifying applications, shader code, renderers, or the scientific baseline.

## Failures and repairs

1. `tests/WebGLGeometry1402.test.js` asserted the obsolete literal `ModernApp.js?v=140.12.30`; `CurvatureModern.html` actually loads `v=140.12.53` with additional cache-busting parameters. The revised test extracts *active script sources*, strips query strings, and asserts exactly one WebGL renderer, one shared frame renderer and one Modern app entrypoint, in that order. This tests the dependency contract without pinning unrelated cache-busting revisions.
2. `tests/ModernGpuPrecisionFoundation141228.test.js` and `tests/ModernGpuPrecisionGeometry141229.test.js` both invoked `mockedGpu()` although it had no definition. The shared `tests/helpers/mockPrecisionGpu.js` now implements a deterministic WebGPU-like device with three distinct shader/pipeline modes, typed-array uploads, command ordering, readback copies, dispatch counts, and resource destruction. The two tests use **different** synthetic readback callbacks matching their 4- and 16-word layouts. These callbacks consume packed input data, and do not replace the production WGSL.
3. `tests/ModernGpuPrecisionFoundation141228.test.js` also verifies invalid synthetic readbacks fail explicitly, resources are closed, and unsupported layouts are rejected.

The mock does **not** compile WGSL, execute the GPU, certify floating-point accuracy, or test the actual browser. Existing static shader-contract assertions continue independently. The mock is appropriate only to assert JavaScript orchestration, error handling, output layout, and cleanup. Real WebGPU shader compilation and accuracy remain outside this patch.

## Run

```sh
node --test tests/WebGLGeometry1402.test.js tests/ModernGpuPrecisionFoundation141228.test.js tests/ModernGpuPrecisionGeometry141229.test.js
```

This patch changes tests, their helper, and documentation only. The Legacy preservation contract, Modern CPU RK4 baseline, WebGL2 renderer, and standalone WebGPU experiment files remain untouched.

## Known unrelated full-suite failures

A broad 230-file Node test run was attempted but was not completed as a passing suite. Independently on the **unchanged #140.12.67 baseline**, four assertions failed across `tests/ModernGeometryDifferenceAttribution141237.test.js` and `tests/ModernGpuAutomaticAuditExport1412311.test.js` (old script-version / retired Modern GPU-export assumptions). They are not fixed in this test-only patch, and should receive separate triage before future deletion gates.

The project-specific targeted Legacy/Modern/CPU optics/WebGL2/research tests and isolation fixtures should be run in addition to the direct repair tests. Node-only GPU mocks are never evidence of shader compilation.

**Follow-up #140.12.69:** The four previously reproduced failures were repaired by updating stale UI assumptions and directly testing retained JSON export helpers; see [the follow-up test repair](regression-test-repairs-140.12.69.md). These patches do not constitute a complete passing browser or GPU suite.
