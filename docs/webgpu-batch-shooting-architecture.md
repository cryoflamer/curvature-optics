# #140.11 — Independent GPU shooting architecture and batch contract

**State (2026-10-30): architecture/contract only.** This stage does not build a
GPU root-finder, change the production optical solver or enable auto-selection.
The failed #140.10 **GPU warm-start → CPU shooting** experiment stays
`SCENE_PERFORMANCE_STOP / CLOSED / PARKED`. This is a *different, explicitly
proposed* solver architecture, not a retroactive promotion of #140.10.

## Verified implementation map (current repository)

| Layer | Current entry / dependency | Important invariant |
| --- | --- | --- |
| Exact point shooting | `src/optics/OpticalTargetProjection.js`: `solve({target:[x,z],...})` | Synchronous, first **forward-x** branch only; full CPU RK4 and first-ground-event check; result has `status`, `angle`, `residual`, `pathLength`, `ray`, `reason`. No global multipath completeness. |
| Ray stepping and events | `src/optics/OpticalRayTracer.js`: `prepareStepper`, `trace` / `groundEvent` | Ground **crossing vs grazing** and impact strictly before the target matter; `solver_failed` is never proof of blockage. |
| Field / cache | `src/optics/OpticalSharedRayField.js`: `create` → `sample(d,h)`, `exact(d,h)`, `warm()`, `stats()` | Synchronous, on-demand, adaptive prism qualification; exact misses call `projection.solve`; keeps per-field cache and warm-start history. Coordinates here are **surface distance and height**, not target `[x,z]`. |
| Scene / ground | `src/optics/CurvaturePhysicalSceneOptics.js`: `create().transform(composed,model,options)`; `CurvaturePhysicalGroundGuides.js` | Synchronous build; ground h=0 shares `field.exact(d,0)`; guide horizon search is adaptive. Caches a camera-independent *completed* optical composition. |
| Edges / fills | `src/optics/OpticalTowerSilhouette.js`: `projectPrimitives`; `CurvaturePhysicalPolygonFills.js`: `project` | Both recursively request `field.sample(d,h)` while subdividing. Future target queries cannot all be listed from mesh vertices alone. |
| Scene draw | `src/app/CurvatureMainCanvasRenderer.js`: `renderPhysical` | Calls `session.transform` **synchronously**, then paints an already completed physical scene via Canvas or the *optional WebGL2 geometry painter*. WebGL2 geometry is not WebGPU optics. |
| UI / scheduling | `src/ui/modern/ModernApp.js`, `src/app/CurvatureAppRuntime.js` | Scene/Compare redraws execute synchronously inside `requestAnimationFrame`; per-side Compare caches are independent. `ModernGpuCapabilities.probe` is an **information-only** WebGPU diagnostic. |
| GPU research | `src/diagnostics/CurvatureWebGPUOpticsBenchmark.js`, `CurvatureWebGPUSceneSpike14010.js` | Independent WGSL RK4 and bounded candidate-angle experiment. Neither is a complete shooting backend. |

**Architectural conclusion:** The numerical solver is well separated from the
Canvas renderer, but *not* behind a swappable asynchronous batch interface.
Replacing `OpticalTargetProjection.solve` with `async solveBatch` would pass a
Promise into synchronously evaluated field, adaptive silhouette, polygon,
ground-guide and frame code. It **cannot** simply be switched on when WebGPU is
available. A new orchestration boundary is required upstream of these callers.

## Executable *diagnostic* contract, not a production backend

`src/diagnostics/CurvatureOpticalBatchContract1411.js` defines and tests a
small contract plus a CPU baseline. It is not loaded from either app HTML and
has no render-selection side effects. This contract is deliberately a subset
of the existing physical metric solver:

```js
const request = {
  branch: 'first-forward-x',
  geometry: 'flat', // or 'globe'
  radius: 6371000,
  observerHeight: 15,
  atmosphere: 'standard', // or vacuum, exponential-occlusion, inverse-spherical
  // profileOptions: {occlusionRadius: 6371000},
  controls: {step: 200, targetTolerance: 1e-6, eventSubsteps: 8},
  targets: [[1000, 20], [1200, 21]] // 2D tangent [x,z] in metres; x > 0
};

// Diagnostic oracle: Promise-shaped for API parity, but CPU work remains
// synchronous; this does NOT make the scene frame nonblocking.
const cpu = await CurvatureOpticalBatchContract1411.solveCpuBatch(request);
// Future GPU implementation must implement async solveBatch(request),
// returning {backend:'gpu-experimental',branch:'first-forward-x',results:[...]}
// in exactly the input target order.
```

Each result MUST include `target`, `status` (`visible`, `blocked`,
`indeterminate`, `solver_failed`), `angle`, `residual`, `pathLength`, `reason`,
and `ground` evidence. A successful solve includes finite angle/residual/path
length and `ground: {hitGround,travelled,event}`, where `event` is null or a
first-ground crossing/grazing record with impact path length. A
`solver_failed` result includes null angle/residual/path/ground and a nonempty
reason. This **structural** validator does NOT establish that GPU events are
physically correct; that requires independent numerical qualification. A
blocked result is not admissible without an actual prior ground impact.

The validated request specifies a *single forward-x branch*, not *all*
physical solutions. Arbitrary JS refractive profile functions, explicit
curvature overrides and legacy surface arithmetic are intentionally excluded
from this initial transferable contract. Unsupported configurations must fail
closed / use CPU, never silently approximate a different atmosphere or geometry.
Future GPU features must be explicitly qualified before widening this scope.
Batch size is capped at 16,384 targets for this diagnostic contract; that is
an allocation safeguard, **not** an optimal GPU dispatch size claim.

`compare(request,cpu,gpu)` reports status differences, angular and
residual errors, first-contact type/distance differences and unresolved
results; its initial tolerances are 1e-7 radians, the requested target
residual tolerance (or 1e-6 m), and 1 mm for ground-contact path length.
`sampleMatches` is **not** a complete acceptance gate: near-grazing uncertainty,
all applicable model settings, and independent step-convergence still require
separate checks. Returned status is never silently converted from unknown to
visible. CPU reference results are obtained by calling the unchanged scalar
solver once per target; this does not include shared-field interpolation.

## Proposed independent GPU algorithm (future #140.12)

1. **Pre-batch:** Convert physical scene targets `(surfaceDistance, height)`
   to the same observer-tangent `[x,z]` as CPU using
   `CurvatureSurfaceGeometry.surfacePoint2`. Deduplicate targets with a
   configuration-scoped key, retaining input order and duplicates in output.
2. **Search, not warm-start:** For each target distance / group, dispatch
   many launch-angle rays in parallel and evaluate signed target-plane
   residuals. Locate *all detected* sign-change brackets in the chosen
   forward-x domain; refine brackets in parallel on GPU. Watch for tangent
   roots / stationary residuals which sign-change tests miss. Finite samples
   do **not** prove that every branch was found.
3. **First-ground event:** Track physical height and intermediate state/event
   checks to reject trajectories touching ground *before* reaching the target;
   preserve grazing `indeterminate` and ground-endpoint envelopes. Avoid an
   O(N) CPU retrace of every GPU result: that would repeat #140.10's failure.
4. **Result:** Emit final solved angle, residual, status and event data, not
   only a seed. Qualification may compare all results against the CPU oracle
   offline, but that comparison must NOT be in the measured production path.
5. **Only after correctness:** Build a wavefront/batched field adapter that
   collects unresolved exact queries from adaptive silhouette/fill/guide
   traversal, dispatches them, resumes traversal, and reuses results in the
   same per-configuration cache. Simply precomputing the 64 mesh vertices
   from #140.10 is insufficient for dynamic outlines, fills and ground guides.

An alternative architecture could precompute a sufficiently dense, *verified*
angular ray field and interpolate with conservative error gates; that is a
separate design to evaluate, not permission to assume monotonicity or
multipath completeness. The launch-angle sweep is a *hypothesis*, not an
implemented or validated algorithm.

## Async orchestration and selection (future work, **not in #140.11**)

- Add a new async optical-scene preparation path **outside**
  `requestAnimationFrame`'s current synchronous draw body. Only commit/render a
  completed frame for the latest generation ID; drop stale requests after
  camera/atmosphere/geometry/scene changes. Preserve per-side Compare
  isolation, cache invalidation and camera-independent composition reuse.
- Keep Canvas/WebGL2 geometry painting independent of optical compute backend;
  WebGPU capability probing alone is never permission to switch solvers.
- GPU device creation, pipeline cache, loss/recovery, readback, failures and
  shader compilation must all fail safely to CPU, with an observable active
  solver label. On unsupported profiles/precision or validation failure use
  CPU without falsely labelling a result blocked/visible.
- Any optional automatic GPU selection is a **later** separately authorized
  stage, conditional on qualification and practical break-even; CPU remains
  the authoritative fallback. Do not change the current `geometryBackend`
  (Canvas vs WebGL2 painter) selector to mean optical compute.

## Proposed measurable gates before production consideration

**Numerics (required first):** Use the same Flat/Globe physical 12-tower scenes
and expand to 2/10/85 towers and ground/near-grazing/short-range/100-km
cases. Cover vacuum, standard and each engineered profile separately, with
explicit unsupported-case fallback. Compare status, angle, residual, first
contact *type and distance*, ground-endpoint classification, and convergence
under reduced RK4 step size. Never claim global multipath completeness from a
finite sweep; mark unbracketed/tangent/uncertain cases unresolved or CPU-only.
A structural result schema and agreement on 128 targets do **not** suffice.

**Performance (only after numerical pass):** Compare a full independent GPU
solver with CPU solving the *same targets*, including all GPU initialization,
queue, transfer and readback costs for cold runs; separate warm device/pipeline
and cached-field cases. Then benchmark the *whole* optical scene (guide,
outlines, fills, assembly, painting), which #140.10 did not. Use repeated
real-browser measurements, multiple workloads and median/spread, not one
cold sample or synthetic RK4 speedup. A suggested preliminary requirement is
**at least 2x** on a representative qualified cold optical stage, *and* no
net scene-frame regression; lock the exact thresholds and workloads **before**
starting #140.12. Fewer CPU calls alone are not an acceptance gate.

**Stop / rollback:** WGSL compilation failure, mismatched physical event,
inconsistent status, unacceptable numerical drift or a no-speedup result
means **stop or fall back**; no default GPU switch. #140.10's archived
performance verdict remains unchanged. The next experiment must be requested
explicitly and is not automatically authorized by this design note.

## Persistent repo rules

- No new numbered experimental HTML pages in `tools/`: keep only the shared
  `tools/webgpu-optics.html` entry point and add modes to it when needed.
- Code belongs in focused modules; do not add a `#140.11` browser page merely
  to describe the contract. No new HTML was created in this stage.
- Source and tests can validate API shape and existing invariants, but mock
  GPU tests do not validate WGSL compilation or actual adapter performance.
