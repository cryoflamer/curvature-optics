# #140.12.53 — WebGPU optical retirement from Modern Compare

## Scope

This commit removes the WebGPU *optical experiment interface and activation path* from `CurvatureModern.html` / `ModernApp.js`. The production CPU optics engine, Modern Scene, independent Compare A/B, WebGL2 geometry and browser GPU capability checks remain. The dedicated `tools/webgpu-optics.html` research harness, its solver modules, source fixtures and numeric/module tests are **retained** for historical reproduction. Full research file removal is deferred, not silently claimed.

The former mixed GPU research panel also contained CPU-only experiments. Those CPU research actions now live under a collapsed **CPU optics research diagnostics (optional)** section in Compare; their source and ZIP outputs are still present. The `CurvatureGpuDsPainterGate141240` *name* survives as a deterministic object-target selection helper in CPU benchmarks, while `CurvatureGpuPixelSpaceAudit141233` / `CurvatureGpuFullFrameParity141234` supply camera/canvas snapshot helpers to the CPU camera-first audit. These are intentionally kept as transitional dependencies and should be split into clearly named CPU utilities in a later cleanup. Their continued load is **not** activation of WebGPU shooting.

Previously saved `display.gpuProbe=true` experiment JSON/URLs continue to pass existing schema validation, but restore as ordinary CPU Compare A/B rather than reinstating the retired GPU mode. Stored physical model A/B settings and viewport configuration are preserved. New snapshots write `gpuProbe:false` for schema compatibility.

## Test policy

34 obsolete **UI-wiring-only assertions**, which required GPU buttons/shaders inside Modern Compare, were removed from 29 existing test files. The underlying GPU arithmetic, visibility, CPU reference, diagnostics, and model tests in those files remain. New tests in `tests/ModernWebGPURetirement141253.test.js` assert the retirement boundary and CPU/WebGL preservation.

The old source and historical tests can be recovered exactly from the validated `optics-baseline-2026-11` tag or the `#140.12.52` commit. This is deliberate removal of assertions for features being deleted, not a claim that old browser UI tests still pass unchanged.

## Retained scientific evidence and follow-ups

- [WebGPU experimental results](gpu.md) and [experiment index](README.md).
- Browser-only GPU shader validation is *not* asserted by this commit; it does not modify WGSL kernels.
- Future follow-up: extract deterministic CPU helper APIs currently located in mixed-named GPU modules, prune unused standalone experiment pages/modules only after a separate reproduction decision, and confirm Modern/Legacy URL migration independently.

## Runtime checks

Run `python3 -m http.server 8000`, inspect `CurvatureModern.html` Scene and Compare, expand CPU research, check WebGL2 selection and old GPU URL/JSON import. No actual GPU session should be started by Modern. Static source and Node tests were run; an automated Chromium smoke was **attempted but blocked by the environment** (`ERR_BLOCKED_BY_ADMINISTRATOR` for both local HTTP and `file://` navigation). Real interactive browser verification, including old imported experiment JSON, therefore remains an explicit manual gate; do not infer it was passed.
