> **History thumbnail correction (2026-11-08):** The physical painter
> calls `clearRect`, leaving pixels transparent. The main Modern viewport
> appears white via CSS, but History previously copied only the transparent
> pixels, exposing its navy card background. The composer now adds the same
> white backdrop before physical and guide layers in Scene and both Compare
> viewports. Gallery cards and enlarged previews also use white behind old
> alpha thumbnails; already encoded opaque-blue thumbnails require recapture.
> This changes only image presentation, not optics, experiment JSON or IndexedDB.

> **Current Modern UI consistency (2026-11-08):** Scene/Compare now use
> compact contextual help instead of repeated paragraphs around the Compare
> model editor and redraw controls. The selected Compare model's actual
> surface/radius and atmosphere are shown in a live read-only summary; the
> Camera Navigation header reports current speeds. Tooltips stay within the
> mobile viewport, and tiny screens stack cramped editing fields. Existing
> input IDs, experiment schema, application/workspace preferences, physics,
> ray tracing and rendering paths are not modified. See README.

> **Current Objects UI cleanup (2026-11-08):** The Modern Scene/Compare
> Objects editor retains both shared physical groups and all original object
> fields/handlers. Frequently edited geometry stays visible, with offset/size
> variation controls inside nested foldouts and a count/type summary for each
> group. All foldouts persist independently for Scene and Compare via existing
> browser-local workspace preferences; no physical model, optics or experiment
> format changes were made. Tooltip help replaces the persistent group note.
> Automated tests cover object edits, presets and preference normalization.

> **Current Surface / Atmosphere UI cleanup (2026-11-08):** Scene and
> Compare group surface curvature/radius, atmospheric profile inputs,
> model equations, visibility/haze and turbulence into browser-persistent
> native details sections. Physics model selection and active validity
> caveats stay outside the collapsible groups. Selected A/B model summaries,
> active effects and existing parameter IDs are preserved. Layout preferences
> remain independent of all physical experiment JSON and optical paths.
> Full code/tests and patch validation apply to the current branch.

> **Current UI cleanup (#140.12.112, 2026-11-08):** Modern Scene/Compare
> Display retains immediate access to optical quality, Fast Preview LOD,
> geometry backend and reference lines. Explanatory paragraphs moved to the
> existing accessible `?` hints. Advanced settings and nested Diagnostics
> (GPU probe / Render profiler) use native collapsible panels whose state
> persists as browser-local Application Preferences, independent of experiment
> JSON. Recording remains indicated in collapsed Diagnostics; actionable
> optical/backend errors stay outside collapsed sections. All existing
> control IDs, rendering and profiling actions are preserved. See README.

> **Current update — inverse atmosphere performance checkpoint (#140.12.100,
> 2026-11-07):** The #140.12.99 prepared-gradient optimization is accepted as
> the working baseline. User-observed Opera B optics times for 200 towers:
> 647 ms at 100% and 2462 ms at 50%; 100% was 9050 ms before optimization.
> Remaining performance investigations are deferred (low priority) in
> `docs/inverse-temperature-modern.md`. This checkpoint changes documentation
> only, not the physics engine, UI, or experiment format. Historical entries
> below are retained unchanged.

> **Current branch update #140.12.74 (2026-11-04):** Standalone WebGPU optics
> experiments and the Modern CPU optics research panel have been retired from
> the main tree. The full pre-removal state is meant to be preserved using the
> annotated `optics-research-archive-2026-11` tag on #140.12.73. Production
> CPU RK4 fused-gradient, WebGL2, Legacy, Scene/Compare and user-saved experiment
> configurations remain. All older notes below describe historical versions;
> see `docs/research-archive.md` for the current boundary and tag instructions.

## Patch 140.12.47 — Lazy hybrid shooting / attributed hot frame A/B (2026-11-01)

- Explicit-only `shootingOptimization: 'conformal-hybrid'`: the cheap standard Globe RK4 shooting predictor runs first; only a failed predictor invokes a lazy conformal candidate, which is *again integrated and certified* by unchanged RK4. Original angular bracket and strict ground-contact classification remain final authorities. Standard production default, nonstandard profiles, Flat, vacuum, and painter are unchanged.
- Optional per-stage RK4-call, evaluation and timing instrumentation; separate on-demand conformal prediction time and acceptance/fallback counters. No default instrumentation overhead without explicit `profileShootingStages`.
- Modern Compare **Audit lazy hybrid shooting · baseline / hybrid / conformal · 8 hot frames · ZIP** renders three actual independently recomputed physical Canvas frames per round, rotates order, exports JSON with all stage timing/count medians and real PNGs with pixel-difference maps. Strict last-frame pixel parity and structural counts reported independently; this is not a physical multipath proof or production promotion.
- Local 100-target sweeps showed the cheap standard predictor almost always succeeded (98/100), with zero late conformal acceptances on two difficult ground cases; a faster full frame is NOT assumed. See `docs/cpu-hybrid-shooting.md`. Browser export needs user verification if local Chromium navigation is blocked. No WGSL changes or new tools HTML page.

## Patch 140.12.45 — Guarded CPU conformal production shooting + frame parity (2026-11-01)

- Explicit-only `shootingOptimization: 'conformal-experimental'` enables adaptive Richardson conformal **angle candidates** for standard Globe / positive observer height. Disabled by default in ordinary Scene and Compare. Custom, Flat, vacuum and engineered atmospheres are not enabled. Candidate implementation is shared with the #140.12.44 benchmark via `src/optics/OpticalConformalPredictor.js`.
- `OpticalSharedRayField.exact()` can supply the candidate via the existing `shootingWarmStartAngle` input to the **unchanged** `OpticalTargetProjection.solve()`. Strict forward-x RK4 endpoint residual, first ground contact, status and fallback remain authoritative. Candidate creation failures fall back to prior shooting. Statistics expose attempts, accepted warm starts, fallback count, gradient calls, chosen steps and candidate overhead.
- Modern Compare provides an OFF-by-default experimental Compare B checkbox. The setting participates in the physical-scene cache key and cache is cleared when toggled. Do not combine it with a GPU-seeded B frame. The separate `Audit full Canvas frames` action renders the **same actual Compare A Globe model** independently into the A/B Canvas painter with separate cold optical sessions, baseline and opt-in. Exports real `baseline-real-frame.png`, `conformal-real-frame.png`, `pixel-difference.png`, `results.json`, `README.txt` in one automatic ZIP; JSON reports actual pixel channel changes, contour/fill/unresolved counts, predictor acceptance and timings. Times are *single cold frames*, not medians.
- The test is scoped to one current camera and authored scene. Matching pixels does not prove global multipath, hidden-object correctness, or all atmospheric situations. The Canvas painter's known overlapping-mesh Z-order limitation is unchanged; this patch does not introduce a Z buffer.
- No numbered HTML tools pages, WebGPU shader changes or changes to normal default production shooting. Browser end-to-end ZIP capture must be verified on a permissive browser environment if local Chromium navigation is blocked.

## Patch 140.12.41.1 — WGSL reserved identifier hotfix (2026-10-31)

- Fixed actual user-reported WebGPU shader compilation error from #140.12.41: WGSL reserves `final`, which had been used as a `Shot` struct field and twice in member access. Renamed this field consistently to `endState` in `src/diagnostics/CurvatureGpuDsRk4Shooting141241.js`. No numerical or rendering algorithm changes.
- Added a shader-source regression test to catch the exact reserved-word failure that JavaScript syntax tests missed. Real WebGPU shader validation/compilation remains required on the user's adapter; the test checks text, not the WGSL grammar.
- The existing #140.12.41 button and success/error ZIP output names are intentionally unchanged; this is a minimal follow-up fix.

## Patch 140.12.41 — Independent GPU double-single RK4 shooting and ground-event audit (2026-10-31)

- Added `CurvatureGpuDsRk4Shooting141241.js`: **separate** WGSL classic-double-single port of tangent-frame `[x,z,vx,vz]` RK4 and first-forward-x target shooting, with angular bracket/regula falsi and fixed-x endpoint correction. Uses a sampled DS first-ground crossing/grazing detector and endpoint ground uncertainty. The old Bouguer #140.12.32 solver is untouched. Input direct-angle seeds are **not CPU solved angles**.
- Added `CurvatureGpuDsRk4Audit141241.js` and an opt-in Modern Compare button to run the 48 original physical points from #140.12.40 with independent CPU f64 reference. ZIP contains JSON, a real CPU Canvas screenshot, clearly labeled **sample-only** GPU/CPU point maps, status-error map, timing visualization, README; failure produces an error ZIP.
- All output failures and indeterminate contacts are fail-closed. A 48-point sample match does not authorize replacing the production CPU painter: no full-frame DS reconstruction, no adaptive query scheduling, no cross-platform DS precision guarantee and no general multipath certification.
- Exact scope and verification limitations: `docs/gpu-ds-rk4-shooting.md`. Canonical `tools/webgpu-optics.html`, production CPU/GPU paths and painting remain unchanged. A real WebGPU runtime check is required for generated WGSL, in addition to Node/structural tests.

## Patch 140.12.40 — GPU DS real-scene painter-equivalence feasibility gate (2026-10-31)

- Added Modern Compare **Audit CPU f64 vs GPU DS · real-scene shooting gate · PNG + JSON ZIP** action. It samples 48 deterministic physically authored tower/foundation edge targets from the active Globe scene and compares existing DS radial Bouguer shooting (256/512 quadrature nodes) with CPU f64 RK4 shooting on the **same** targets, reporting angle and pixel-space displacement, candidate visibility disagreements, GPU compile/dispatch+readback vs CPU solver timing, source-lineage metadata, and an actual CPU Canvas reference screenshot alongside correctly labeled ray-only PNGs.
- **Not a CPU-equivalent GPU DS renderer:** the existing #140.12.32 DS solver uses Bouguer quadrature rather than the reference RK4/bracket/contact algorithm; GPU visibility is uncertified and cannot be injected into the adaptive painter. A real `gpu-ds.png` full frame / image difference / 64–4096-target performance ladder is explicitly marked unsupported rather than fabricated. See `docs/gpu-ds-cpu-painter-gate.md`.
- Existing production CPU/GPU renderer, optics, painter, WGSL and canonical `tools/webgpu-optics.html` remain unchanged. No new standalone HTML page was added.

## Patch 140.12.37 — Source-linked optical geometry differences (2026-10-31)
- Extended the existing single Compare diagnostic button / ZIP export, preserving all 44 #140.12.36 PNGs and numerical JSON. Added eight CPU/GPU geometry-edge PNGs and four physical rejected-query trace JSONs (one per camera). The new ZIP is `curvature-compare-140.12.37-geometry-attribution.zip`.
- Opt-in pre-painter captures of projected physical fill triangles / outline segments, mapped to authored `(objectLayer, opticalSourceIndex)`. Per-source counts and angular-vertex signatures (~2e-6 rad resolution) are a **diagnostic proxy**, not proof of missing triangle sets or causal pixel contribution. Per-source screen edge bounding boxes link candidates to the 4x3 difference-tile grid (correlation only).
- Opt-in rejected-leaf hooks report physical sample coordinates and status/reasons for outlines/fills, with explicit `fieldQueried` distinction. Exported sample details limited to 500 rejected leaves per render; per-source counts unbounded. No f32/DS/shooting/rasterizer policy changed. Browser WebGPU still requires a user run. See `docs/gpu-geometry-difference-attribution.md`.


## Patch 140.12.36 — Visual ZIP attribution (2026-10-31)
- The #140.12.35 algorithm attribution action now downloads a single `curvature-compare-140.12.36-visual-attribution.zip` containing the full numerical JSON and 44 PNG snapshots (four camera views × CPU, three GPU variants, three overlays, three CPU/GPU difference maps, and one baseline/direct difference map). Frames are taken from the same RGBA snapshots used by the pixel metrics; no rerendering or GPU changes. Difference colors are occupancy proxies, not physical sky/terrain labels.
- A small browser-side PNG exporter and the existing ZIP writer are reused. No new versioned HTML tools page was created. Browser WebGPU end-to-end ZIP export remains unverified here.
## Patch 140.12.35 — Algorithmic error attribution (research, 2026-10-31)

- Added opt-in Compare action **Audit algorithm attribution · baseline / strict / direct GPU**, automatically exporting `curvature-compare-140.12.35-algorithm-attribution.json`. One 4096-ray scene-derived f32 predictor grid is reused across three real Canvas B variants for four fixed camera views. `baseline` retains nearest-weight visibility selection, `strict` reports mixed/invalid/out-of-domain responses as indeterminate (angle unchanged), and `strictDirect` replaces up to 192 exact original B renderer query coordinates with independent direct GPU f32 predictor results. No CPU-guided GPU sampling and no production changes.
- Independently compare each variant with repeated cold CPU A reference images. Only *after* all GPU variants, solve the same selected renderer target coordinates with CPU f64 to report separate grid-vs-CPU and direct-GPU-vs-CPU status confusion, robust mismatches, camera-pixel angular offsets on status-agreed rays, renderer contour counts and **fillUnresolved**. Results are not additive causal contributions because changed statuses change adaptive geometry queries; an unknown/blocked status is not silently promoted to visible.
- The existing 48-ray DS GPU shooting is **not** integrated into these frames. Tests include a 2×2 synthetic discontinuity and an actual physical scene transform using strict GPU field. No new WGSL; browser WebGPU execution of the new experiment remains to be verified. See `docs/gpu-algorithm-attribution.md`.

## Patch 140.12.33 — Actual-camera pixel-space GPU DS shooting samples (2026-10-31)

- Added Compare action **Audit pixel-space DS shooting · real Compare camera**, with automatic `curvature-compare-140.12.33-pixel-space-audit.json` export. It runs the unchanged independent 48-target GPU DS shooting (256/512 nodes), independent post-GPU CPU f64 RK4 shooting and Bouguer f64 2048-node root, then measures physical camera launch-ray differences in actual Compare A Canvas backing-store pixels. Camera/graph/viewport changes during execution invalidate the report; pixel projection is independently checked against the existing physical painter with nonzero pan, tilt and roll.
- The primary metrics are projected GPU-vs-CPU RK4 displacement in pixels (max, average, RMS, p95, >0.5 px, >1 px), discrete sampled pixel-cell/row occupancy differences, field-of-view coverage and clear/blocked/uncertain classifications. The CPU Bouguer root is an additional separate error diagnostic. Ground contacts within 1 cm remain uncertain, not certified.
- **Strict scope:** the underlying GPU program provides 48 isolated meridian rays, not a GPU-painted frame. No actual full-frame image pixel diff, 2D silhouette or renderer accuracy is established. JSON explicitly sets `actualRenderedImageCompared:false` and `fullFramePixelParityEstablished:false`; the report cannot authorize production promotion. See `docs/gpu-pixel-space-audit.md`. No changed physics, DS WGSL, production shooting or painting, or versioned HTML tools.

## Patch 140.12.30 — GPU Bouguer target-polar precision recheck (2026-10-31)

- Added Compare action **Audit Bouguer precision · f32 d/R vs double-single**, exporting `curvature-compare-140.12.30-bouguer-precision.json`. One independently shot batch of 48 original Globe/standard targets is reused across four GPU variants. The original #140.12.27 256-node Bouguer shader is the unchanged f32 control; three new shaders replace only the target-angle evaluation with direct f32 `d/R` or classic/integer-residual double-single `d/R`. DS low target-angle limbs participate in the final surface margin. No GPU integrand, refraction, RK4, shooting, visibility, or production paint path was changed.
- The independent CPU f64 2048-node invariant reference, 256-node convergence diagnostic and same-angle CPU f64 RK4 replay run **only after** all GPU submissions, preserving the #140.12.27 event/source analysis and allowing target-angle-versus-ground-angle error decomposition. Reports per-mode 48-row comparisons, contact sign mismatches, absolute margin differences, ground-angle invariance, and separate near-surface cases. Numerical results and actual WGSL compilation require a browser/WebGPU run; the new DS modes are not f64, error-bounded, or visibility-certified.
- Added numerical, shader contract, mock WebGPU, lifecycle, CPU-vs-GPU ordering, and UI/export tests. See `docs/gpu-bouguer-precision.md`.

## Patch 140.12.29 — Independent WebGPU Globe/Flat precision geometry and input-split audit (2026-10-31)

- Added Compare action **Audit GPU precision geometry · Globe / Flat / hi+lo inputs**; it exports `curvature-compare-140.12.29-gpu-precision-geometry.json` without changing production shooting, ground contact, atmosphere or painting. Three real WebGPU compute pipelines reuse the exact #140.12.28 f32, classic double-single and integer-residual double-single arithmetic helper implementations and report per-mode errors and warmed dispatch/readback timings on 48 fixed distance/altitude targets.
- The Globe probe uses actual `CurvatureSurfaceGeometry.surfacePoint2(d,h)` Cartesian coordinates and compares the #140.12.27 normalized f32 `atan2` baseline against high-precision direct `d/R` and an independently calculated Cartesian `atan(x/(R+y))` with a bounded small-positive-angle polynomial. CPU f64 references are evaluated independently for the exact arc angle and the Cartesian coordinate calculation; the report separates any source-geometry difference.
- Distinguishes constructing `R+h` from separately packed hi/lo radius and local height from packing `R+h` as a large absolute coordinate **before** transmission; repeats the comparison for Flat global-to-local distance with 15,000,000.125 m origin. This isolates original-input two-limb quantization (including the observed 0.1 m / ~1.86 nm case) from GPU cancellation. Both GPU modes remain non-certified and bounded, NOT binary64.
- New tests cover source packing, separate genuine geometry paths, shader contract, CPU reference, mock GPU readback, resource release and UI/JSON integration. **Actual WebGPU WGSL compilation and numeric results still require the user's browser export.** See `docs/gpu-precision-geometry.md`.

## Patch 140.12.26 — Fixed GPU-angle ground contact vs independent f64 (2026-10-31)

- Added **Audit GPU ground crossing · same-angle f64 replay** in Compare, exporting `curvature-compare-140.12.26-gpu-ground-contact.json`. The GPU predictor first solves the established fixed 48-point geometry ladder at 5-mm tolerance. Only its own 48 angles are used for subsequent fixed-angle GPU replay; missing angles fail closed rather than importing CPU-derived guesses.
- The opt-in, separate WebGPU shader uses the same compensated RK4 and stable local altitude as the independent shooting shader, replays each GPU angle without shooting, and records first sampled signed-altitude crossing, first within-tolerance proximity, first negative sample, minimum sampled altitude, endpoint altitude/residual and signed bracket evidence. Three controlled runs isolate event-substep density and integration step: 500 m / 8, 500 m / 16, and 50 m / 8. No shader or result-contract changes to the regular GPU shooting path.
- **After all GPU batches**, the CPU f64 first-forward-x shooting oracle is computed separately, and `OpticalRayTracer.trace` independently replays every actual GPU angle to the same *GPU replay path length* for each of the three step/substep settings. The JSON retains the six surface/1-micrometre targets at 60, 350 and 1250 m in a dedicated `nearSurfaceCases` section, plus all 144 mode/target rows and contact/endpoint comparisons. CPU trace length agrees with GPU length by design; CPU trace is not an x-terminated endpoint solver, and the report records its x error.
- Sampled f32 crossing/proximity are not equivalent to CPU grazing/minimum detection. A near-terminal contact, contact mismatch or an apparently clear f32 sample **never certifies visibility** or automatically changes `visible`, `blocked` or `indeterminate`. No CPU fallback, repaint, frame logic, or production authorization. Actual WGSL compilation/execution remains to be measured in a WebGPU browser.

## Patch 140.12.25 — Precision-limited f32 shooting candidates / trace ring integrity (2026-10-30)

- Opt-in Compare action **Audit GPU precision-limited shooting · candidate vs CPU** exports `curvature-compare-140.12.25-gpu-precision-limit.json`. The same fixed 48-target ladder compares 5-mm predictor, strict predictor, strict residual-stop sweep, strict angle-bracket sweep and experimental **precision-aware sweep**. GPU batches run first, independent CPU f64 reference afterward; no frame painting, CPU shooting fallback or production switch.
- The new isolated `precision-aware` WGSL refinement retains the lowest-absolute-residual `f32` angle among the initial bracket endpoints and validated midpoint evaluations. It stops at a nonrepresentable midpoint or an approximately 2-ULP interval with no improvement, and independently integrates the candidate with first-ground-event sampling. Targets still outside the 0.1-mm residual tolerance get **raw diagnostic status 4** (`precision_limited`) only if the representability floor was reached. The standard validated batch contract **decodes status 4 as `solver_failed` with null angle**. A separate telemetry object preserves the uncertified candidate angle, residual, ground contact, and endpoint distance for audit. Never treat status 4 or near-endpoint contact as proof of visibility.
- Corrected the *trace-only* strict bracket shader: ring slots are now overwritten with sentinels at the beginning of each iteration, including early break paths. Previously `usedIterations` could count a break before recording a sample, causing an older wrapped trace entry to be decoded as a newer step. This explains apparent giant bracket widening at iteration 21 in the #140.12.24 report; no production bracket math was changed. The new report measures width-monotonicity violations from only valid trace entries.
- All new functionality is diagnostic and opt-in. WebGPU WGSL runtime validation still requires a real browser. Retain CPU and existing GPU renderer defaults until measured parity, contour fidelity, first-contact classification and end-to-end performance are established.

## Patch 140.12.24 — GPU f32 numerical floor / last-iteration audit (2026-10-30)

- Added opt-in **Audit GPU f32 numerical floor · last 12 iterations** to Compare and exports `curvature-compare-140.12.24-gpu-numerical-floor.json`. It uses the existing 48-target physical ladder, retains standard 5-mm predictor and three strict 0.1-mm modes, and runs the independent CPU f64 comparison **only after** all GPU batches. No default renderer, GPU status, angles or CPU fallback are changed.
- Only the opt-in diagnostic refinement shaders write a bounded 12-iteration ring per target (angle, target-vertical residual, bracket width and an alternate **surface-relative local-altitude residual**), with explicit storage/readback allocated only when `traceRefinement: true`. This captures the last attempted refinement steps without retaining all 28 iterations or altering the previous GPU shader variants.
- Summaries distinguish missing brackets, exhausted refinement, repeated f32 angles, unchanged residuals across changing angles, and bracket widths measured in local f32 ULPs. A possible numerical precision floor is **only a hypothesis label**, not proof of convergence or reason to upgrade an indeterminate/failed ray. The alternate residual uses local altitude and may itself be affected by terminal horizontal error; it is not an f64 oracle or proof of higher precision.
- Benchmark timing for trace-enabled batches includes the extra GPU-to-CPU readback and is not directly comparable to the non-trace performance measurements. Actual WGSL compilation and optical measurements must be made on real browser WebGPU hardware.

## Patch 140.12.22 — GPU f32 near-surface precision ladder (2026-10-30)

- Added an **opt-in, diagnostic-only** Compare button `Audit GPU f32 precision · surface / upper towers`; no graphics, production changes, pixel substitution or CPU shooting fallback. JSON: `curvature-compare-140.12.22-gpu-f32-precision.json`.
- Uses 48 geometry-derived targets at six near distances (60–5400 m) and eight altitudes (0, 1 µm, 1 cm, 10 cm, 1, 5, 20, 50 m). GPU predictor compares standard atmosphere 500 m/5 mm tolerance (control), 500 m/0.1 mm tolerance, 50 m/5 mm tolerance, and vacuum 500 m/5 mm. CPU f64 references for standard/vacuum run **after all GPU batches**.
- Reports status disagreements, ground-contact evidence and contact proximity to endpoint (diagnostic 25 cm threshold only, **not** an override), angular errors including separate high-tower heights, and local f32 coordinate round-trip height error. No renderer repaint or code-path promotion.
- Motivation: #140.12.21 diagnostic found 54 near-surface uncertain first-ground contacts, none resolved by 500→50 m RK4. Existing WGSL uses rationalized local altitude rather than subtracting the 6371 km radius, so the audit separates a loose 5 mm target residual from integration step and atmosphere instead of guessing a radius cancellation problem. A target marked indeterminate is never automatically made visible.

## Patch 140.11 — Independent GPU shooting architecture and diagnostic batch contract (2026-10-30)

- Inspected current source call chain: `OpticalTargetProjection.solve` ->
  `OpticalSharedRayField.sample/exact` -> recursive tower silhouette, polygon
  fills and ground guides -> synchronous `CurvaturePhysicalSceneOptics.transform`
  -> `CurvatureMainCanvasRenderer.renderPhysical` -> Scene/Compare redraw.
  **A simple GPU `solveBatch` drop-in is NOT possible today:** the scene and
  field are synchronous and generate new target queries adaptively.
- Added diagnostic-only `src/diagnostics/CurvatureOpticalBatchContract1411.js`
  with a fail-closed first-forward-x batch schema, actual CPU scalar-solver
  reference adapter (`solveCpuBatch`, Promise-shaped), structural first-ground-
  event evidence validation and result comparison. It is **not** a GPU solver,
  nonblocking CPU worker, production path, or new UI. Focused contract tests
  guard target order, Flat/Globe oracle parity, invalid inputs and current
  synchronous integration boundary.
- Defined a separately proposed GPU **parallel angle search + GPU root/event
  classification**, rather than GPU warm starts re-solved on CPU; subsequent
  wavefront/batch scene integration would need new async orchestration,
  generation cancellation and per-configuration caching. See
  `docs/webgpu-batch-shooting-architecture.md` for interfaces, source
  points, precise limitations and prospective numerical/performance gates.
- #140.10 `SCENE_PERFORMANCE_STOP` stays **CLOSED / PARKED**; #140.11 is
  an authorized design exploration, not a production promotion or automatic
  launch of #140.12. CPU optics, Canvas/WebGL2 geometry selection and Modern
  Scene/Compare defaults remain unchanged.
- **Persistent UI rule:** no new `tools/` HTML per GPU experiment. Use the
  existing `tools/webgpu-optics.html` with experiment selection. JS tests
  cannot substitute for browser WGSL compilation and actual GPU validation.

## Patch 140.9.1 — Final bounded f32 precision diagnosis (2026-10-30)

The user-supplied #140.9 Opera/Intel Gen-12LP export measured 18/18 scenarios,
with 10 passing and all 8 long (100-km) cases exceeding the 0.1-m position
tolerance; Vacuum long had a 2.647-m discrepancy with essentially no angular
drift. An opt-in `accumulation: 'compensated'` GPU shader now evaluates RK4
increments before compensated f32 position accumulation while retaining the
original shader as the unmodified default. A Vacuum f64 analytic straight-line
reference separates CPU RK4 error from GPU drift. A browser-only 18-pair
(36-run) diagnostic and hard stop gates are at `tools/webgpu-optics.html`
and `docs/webgpu-optical-precision-followup.md`.
**No real WebGPU result for this correction is available yet.** If the fixed
numerical/performance gates are met, stop isolated RK4 experiments and allow
at most one real-scene integration spike. If not, stop this f32 GPU branch.
Production optics and renderer defaults remain unchanged.

## Patch 140.9 — Finite WebGPU optical qualification and stop gate (2026-10-30)

Added a standalone, opt-in 18-case browser matrix at
`tools/webgpu-optics.html` built on the unchanged #140.8 RK4 benchmark.
All four atmospheres × Flat/Globe are tested at 12.8 km and 100 km
mathematical path lengths; Standard/Flat small and large batches provide two
additional scaling probes. Exports per-case CPU/GPU timings, f32-vs-f64
numerical gates, unavailable/errors and an explicit `INCONCLUSIVE`,
`NUMERICAL_STOP`, `PERFORMANCE_STOP` or `SPIKE_CANDIDATE` recommendation.
Even a passing result permits only **one bounded real-scene integration spike**,
not a GPU production switch. Explicit end-to-end correctness/performance and
one-correction stop rules are documented at
`docs/webgpu-optical-qualification-matrix.md`.
No production solver/rendering defaults have changed; real browser hardware
matrix results are still required.

## Patch 140.8 — Isolated WebGPU optical RK4 batch benchmark (2026-10-30)

- Added a standalone browser-only GPU/CPU fixed-step ray integration experiment at
  `tools/webgpu-optics.html`, with implementation at
  `src/diagnostics/CurvatureWebGPUOpticsBenchmark.js`.
- Tests WebGPU `f32` RK4 on independent rays against the **production CPU f64
  stepper** with matching f32-quantized initial vectors; supports Flat/Globe,
  vacuum, standard and two engineered refractive profiles. Exports measured
  sample timing and fail-closed position/angle deviation gates to JSON.
- GPU timing includes input uploads, compute and full readback; device and
  pipeline initialization are timed separately. It is **not** a full shooting
  solver or a production integration. Hardware acceleration not asserted.
- Added seven focused Node tests (including a mock GPU host path); real WGSL
  compilation and GPU parity require an actual browser GPU adapter.
- Production shooting, geometry, profile and UI defaults are unchanged.
  See `docs/webgpu-optical-rk4-benchmark.md`.

## Patch 140.7 — Forward-x shooting bracket boundary repair (2026-10-30)

Fixed the production bracket-first shooter's near-vertical first probe: an
oversized initial angular step is reduced only when it would leave the
solver's forward-x domain, and later steps are capped inside that domain.
Previously valid probes, RK4 integration, collision classification, and
Scene/Compare predictor defaults are unchanged. The 16 historical near-eye
failures are now resolved, independently cross-checked where the Flat
monotone Snell invariant applies. Repeating the complete #140.5 matrix gave
**1064/1064** ray cases, **3600/3600** warm-start sequence checks, and
**72/72** full scene pairs, including formerly divergent nonmetric guides.
These are finite-sample CPU qualifications, **not** proof of global ray-branch
completeness or approval for default predictor promotion. See
`docs/engineered-shooting-bracket-repair.md`. The two HTML entry points
now version the changed optical script to avoid stale browser caches.

## Patch 140.6 — Short-range shooting bracket and branch diagnostics (2026-10-30)

Diagnosed all 16 near-observer `solver_failed` baseline cases from #140.5 as
oversized first bracket probes crossing the forward-x angle bound. An offline
short-range diagnostic reuses the unchanged bracket-first solver with a bounded
`initialSpan`, checks RK4-step convergence and predictor agreement, and compares
Flat trajectories against an independent Snell invariant (closed-form for the
exponential atmosphere; quadrature for inverse-spherical). All 16 cases were
locally recovered and 56/56 near-eye cases passed these local checks, but
no Globe analytic branch oracle or global multipath certification is claimed.
**No production solver defaults or rendering are changed.**
See `docs/engineered-short-range-branch.md`.

## Patch 140.5 — Expanded engineered-shooting numerical qualification (2026-10-30)

Added offline near-horizon/near-eye target grids, reduced-step numerical
cross-checks, active warm-start sequences and 2/10/85-tower paired scene
comparisons for both modern metric and older nonmetric guides. A wider matrix
revealed an unqualified short-range reference-solver failure (candidate solves)
and mismatched old nonmetric radial guide interpolation at half comparison
radius, while modern physical metric scenes matched. Results are reported
**fail-closed**: the engineered optimization remains offline-only and cannot
be automatically promoted; no production changes or GPU compute were made.
See `docs/engineered-optical-qualification.md`.

## Patch 140.4 — Opt-in engineered shooting qualification (2026-10-29)

Diagnosed why #140.3 reports zero predictor/warm-start attempts for engineered
atmospheres: these shortcuts are intentionally limited to the standard model.
An offline-only opt-in `shootingOptimization: 'engineered-experimental'` now
allows the existing integrated/verified CPU predictor and same-distance warm
starts to be tested for the built-in exponential and inverse-spherical models;
ordinary physical scene rendering remains bracket-first, unchanged. Added
paired full-scene benchmark with topology/visibility/coordinate comparisons,
near-grazing numerical regression tests, and an explicit no-default-promotion
decision gate. This is **not** GPU compute or production certification. See
`docs/engineered-optical-shooting.md`.

## Patch 140.3 — Cold/Warm optical profiling (2026-10-29)

Added explicit cold and warm optical benchmark redraws to the Modern Display
profiler. Cold invalidates **only** the affected optical projection cache
(Scene or independent Compare A/B session) immediately before transformation;
warm requests preserve caches. The profile separates *actual* fresh builds and
warm hits, excludes misses, and exports existing field/ground/outline/fill
stage times, target solves, shooting evaluations and RK4 steps. Normal redraws,
model state, tracing numerics and visual backends remain unchanged. See
`docs/modern-optical-profiling.md` for the test protocol and caveats.

## Patch 140.1.2 — Render profiler API compatibility and cache refresh (2026-10-29)

The browser error `renderProfiler.setEnabled is not a function` is consistent with a
stale `ModernRenderProfiler.js` resource: unlike `ModernApp.js`, it lacked a
versioned URL. Both entry points now carry `?v=140.1.2`. The UI checks the
required profiler API before binding controls and shows a reload instruction
instead of throwing if an incompatible script is still loaded. No physics,
Canvas or GPU backend behavior was changed.

## Patch 140.1.1 — Profiler recording controls (2026-10-29)

Separate Start recording and Stop recording controls were provided in Display.
The recording status is displayed explicitly, and the Stop control is enabled only while recording.
The modern script query version was incremented to prevent stale cached event handlers.
No optics, scene rendering backend, or GPU processing behavior was changed.

## Patch 140.1 — Scene, Canvas and WebGL render profiling (2026-10-29)

The existing bounded CPU physical-stage and Scene/Compare redraw profiler is
now exposed in Display with Start/Stop recording, a median/p95 summary, Clear,
and JSON export. Opt-in Atmospheric Shimmer instrumentation records JavaScript
texture-upload/command-submission wall time, and, *only* when supported, nonblocking
`EXT_disjoint_timer_query` WebGL GPU draw execution. Stale-generation/disjoint
queries are excluded; absent GPU timings are reported as unknown. The scene
backend remains Canvas 2D and optics/painter output is unchanged. See
`docs/modern-render-performance.md` for browser protocol and caveats.

## Patch 138.3 — UI controls for atmospheric turbulence (2026-10-29)

Added visual-only Atmospheric Turbulence switches, Intensity/Eddy scale/Drift
sliders and Pause/Resume to Scene and selected Compare A/B atmosphere panels.
Scene/A/B have independent shader parameters and freeze states; only toggling
On/Off causes a cached physical repaint to separate/restore canvas captions.
Parameter edits and pause/resume do not retrace rays or upload scene textures.
A per-view elapsed-time clock prevents a pause/resume phase jump. Shimmer is
OFF by default and not serialized with physical experiment state. See
`docs/modern-atmospheric-ui.md` for browser checks and limitations.

## Patch 138.1 — optional atmospheric presentation boundary (2026-10-29)

Added disabled-by-default Scene/A/B presentation slots, capturing physical
Canvas pixels before eye-level/horizon annotations; diagnostic overlays remain
separate and sharp when the optional identity compositor is enabled. Camera
CSS preview temporarily exposes the source Canvas; ray tracing and the OFF
path remain unchanged. No shader, physical turbulence model or UI controls yet.
See `docs/modern-atmospheric-presentation.md`.

## Patch 137.4 — Perspective-correct cached raster preview (2026-10-29)

During Scene or Compare camera dragging, an observer-fixed projective homography
now maps the existing Canvas pixels to the shared target Pan/Nick, including
Roll and Scene's aim offset. The shared controller applies CSS `matrix3d`
without re-rendering physical geometry or optics on pointermove; Compare A/B
share the same target angle but use their own viewport dimensions. Large
rotations behind the camera safely fall back to translation. Authoritative
redraw on pointerup, pending-frame guard, compact PNG hand cursors, experiment
serialization and separate A/B optical caches are unchanged. See
`docs/modern-camera-perspective-preview.md` for equations, limitations
and browser checks.

## Patch 137.3 — Single-validated frame handoff (2026-10-29)

The Modern physical Scene and Compare render paths now use an atomic
`renderComposition()` call: one isolated, strictly validated frame snapshot is
passed directly to the shared painter. The public `render(frame)` still fully
revalidates untrusted/modified frames. No physical ray, guide, camera drag or
ordering logic was changed. Paired *synthetic Node* median handoff savings
were ~29–35% for 3653–10000 lines, **not an Opera FPS claim**. See
`docs/modern-camera-redraw-optimization.md` for stage semantics,
benchmarks and browser acceptance.

## Patch 137.2.4 — Compact hand cursors (2026-10-29)

- Open/closed cursor PNG canvases were reduced to 24×24 pixels with the visible hand bounded to approximately 18×20 pixels.
- CSS and JS hotspots were adjusted to (10, 5) and (12, 9); both resource URLs were cache-busted to 137.2.4.
- The shared camera drag, raster preview and optical renderer were not changed.

## Patch 137.2.3 — Smaller camera drag cursors (2026-10-29)

- Both custom hand PNGs were reduced from 48×48 to 32×32 pixels with alpha preserved.
- CSS and JavaScript hotspots were scaled to (11, 5) and (15, 13) respectively.
- Cursor stylesheet/script cache versions were advanced to 137.2.3.
- Camera gesture, preview and physics behavior remain unchanged.

# Curvature optics migration — project state

Updated at compatpatch **128** (2026-10-28), after the first explicit event/visibility contract. Refresh after approximately every 5–10 patches **and** after major architectural decisions. This file is a compact handoff, not a substitute for focused patch documentation.

## Patch 137.2.1 — Camera drag cursor and autoscroll protection (2026-10-29)

- Camera cursors are now applied explicitly to all three canvases as well as
  through the existing CSS classes: `grab` while idle and `grabbing` during
  a gesture, with cursor-host cleanup and previous style restoration.
- The Modern stylesheet URL has a version suffix to avoid stale CSS.
- Middle-click autoscroll is prevented over the camera canvases. The circular
  four-way-arrow cursor observed in Opera may have been Chromium autoscroll;
  this is a strong hypothesis, **not** confirmed by a browser UI test. An
  already active autoscroll mode must be dismissed manually with Esc.
- Gesture preview, physics, persistence, and camera math are unchanged.
- See `docs/modern-camera-drag-autoscroll.md`.

## Patch 137.2 — Cheap Scene/Compare camera drag preview (2026-10-29)

Shared camera drag now moves already-rasterized Canvas pixels via RAF-coalesced
CSS `translate3d` during pointermove; no geometry reconstruction, physical
tracing, or full Canvas redraw occurs until release. Both Compare viewports
move together with normalized displacement, independent of the initiating
viewport. Cursor states are `grab` on hover and `grabbing` during a gesture.
The preview is retained until the authoritative final redraw completes, then
restored in `finally`; cancellation and mode changes restore it immediately.
This is an approximate screen-space preview, not exact perspective remapping.
See `docs/modern-camera-drag-preview.md` for limitations and browser checks.

## Patch 137.1 — Shared final-frame camera drag (2026-10-29)

Primary-pointer drag on the Canvas now controls shared Pan and Nick in Scene and
Compare. The gesture uses the physical diagonal FOV and initiating viewport's
CSS dimensions. Compare A/B always commit one camera and redraw both models.
Only a light Pan/Nick HUD updates while the pointer moves; an authoritative
full redraw occurs **once on release**, not every pointermove. No live image
preview yet (planned for 137.2). Camera aim, optics, compare physics, and save
format are unchanged. See `docs/modern-camera-drag.md` for mapping,
cancellation semantics, limits and test procedure.

## Patch 137 — Modern camera interaction groundwork (2026-10-29)

A shared, pointer-independent camera-gesture controller now exists for Scene and
Compare A/B, and the Modern UI collects bounded renderer-stage and redraw-batch
profiling separately for Scene, A and B. **No drag handlers or fast-preview
rendering are enabled in 137**; existing physical rays and saved experiment
formats are unchanged. Inspect measurements with
`CurvatureModernApp.getRenderProfile()`; see
`docs/modern-camera-interaction-baseline.md` for the contract, timing
limitations, browser measurement procedure and 137.1–137.4 plan.

## Patch 128 — physical continuous-surface verification (2026-10-28)

**Latest verified baseline:** 512 Node tests including 13 new end-to-end tests;
headless Chromium checked Earth, large, near-flat and exact flat with 85+2
towers (0 JS errors, 0 unresolved outlines/fills). Physical object placement
uses one azimuth and metre-based world frame at all curvatures, even when
`showModel = 2` at the slider endpoint; historical Legacy FlatEarth orientation
is unchanged. Physical metric guides now have curvature-independent sampling,
fixed 100 km presentation extent, and only certify a finite optical ground
horizon from a narrow visible/blocked bracket. Solver failures must not be
presented as physically blocked. Original non-metric SHA-256 golden references
remain intact. Local 5-repeat Node benchmark: near-flat `R=10^16 m` changed
from ~154 to ~71 ms median optics and from ~218k to ~40k RK4 calls, but this
is not a frame-rate guarantee. Details and limitations:
`docs/continuous-physical-verification.md`.

## Objective

An independently computed physical comparison of Globe and Flat observations: world geometry + atmospheric refractive index `n(h)` + ray equations + first-hit visibility produce the image, **without hardcoding a horizon law or using the legacy horizon occlusion mask**.

## Current baseline

- **109 atmospheric reliability**: fixed expensive RK4 target shooting (bracketed regula falsi + safeguarded Newton endpoint), qualified long smooth-profile steps against fine-step oracles, removed the default 3.5-second truncation (explicit diagnostic budget still supported), and introduced separate boundary/solver/budget counters and contextual Physical-mode controls. A full 85+2 Standard scene test retains both banks with 3560 visible pieces, 130 narrow boundary leaves and **no** solver/sample-budget failures. True polygon fills, refracted guides, asynchronous work and global error guarantees are not yet provided. See `docs/migration-atmospheric-scene-reliability.md`.

- **108 architecture correction**: the main Physical path no longer uses a separate Canvas painter; its backend `CurvaturePhysicalSceneOptics` transforms the same independent `CurvatureGeometryEngine` scene contract into ray-arrival line primitives and hands it to the existing `CurvatureFrameRenderer` painter, with the existing camera, style and decorations. `composeOpticalMain` preserves both object groups and reference surface/horizon guides **without inserting the legacy horizon occlusion mask**; physical Globe reference guides use `rEarth`, not `legacy-k`. Analytic vacuum fast path prevents old 3.5-second numerical starvation of 85+2 towers. Atmospheric modes still may have unresolved fringes and budgets. Geometric horizon guides are NOT refracted surfaces; object fills and mutual occlusion remain pending. See `docs/migration-shared-physical-scene.md`.

- Latest migration milestone: **107**, opt-in **Physical tower outlines (preview)** Canvas engine (`docs/migration-physical-canvas.md`). Uses physical angular tower lines from 106, actual camera perspective, separate profile/R controls, cold-result cache across camera redraws, and deliberate budget-limited omissions. **No Legacy mask is used on this path.** The physical Canvas still has **no ground/surface drawing, filled polygons, or mutual tower occlusion**. Real 85-tower sample reached the 3.5-second preview budget with unresolved edges: it is not yet a complete real-time renderer. `CurvatureTargetProjection.solve` remains the one-branch physical target oracle; `solver_failed` is never proof of blockage.
- Recent sequence: 95 runtime extraction, 96 render-frame/renderer contract, 97 main Canvas preview, 97.1 two active object groups, 97.2 horizon tessellation and stroke styles, 98 independent vacuum/geometry regression, 99 core audit, 100 RK4 tests and ground-impact accuracy, 101 bounded ground events and 2D vacuum target visibility, 102 engineered atmospheric profiles and analytic tangent/trajectory validation, 103 atmospheric target-angle shooting and ground-only visibility, 104 lazy/eager shared projection cells with conservative exact fallbacks.
- Legacy DrawModel remains selectable/default; Independent painter preview handles Globe and Flat separately, both supported object groups, with some overlays/annotations absent. `Both` uses Legacy fallback.
- Independent geometric composition uses an ordered horizon disk/mask for presentation; this is **not** physical ray-derived occlusion.
- Numerical `CurvatureRayTracer` already exists (2D fixed-step RK4, vacuum/standard/custom `n(h)`), now tested for analytic vacuum impacts, numerical refinement, invariants and reciprocity; a signed one-step `advanceState()` API and bounded first-ground-event search are available for diagnostics. `vacuumTargetVisibility()` gives restricted 2D ground-only `visible`/`blocked`/`indeterminate` semantics. It is **not** the physical primary-Canvas renderer. Optical P4 diagnostics/overlays and effective-radius `legacy-k` are separate mechanisms.
- Patch 99 retained the 270-test baseline. Patch 100 added 12 numerical tests; patch 101 added 11 ground-event/visibility tests; patch 102 added 8 independent analytic profile tests (301 total); patch 103 adds 14 independent shooting/visibility tests (315 expected).

## Source of truth / workflow

Only use the user-supplied `chatgpt-pack-*` archive (choose the explicitly named pack, otherwise newest timestamp). Unpack it into a temporary Git workspace and apply outstanding compatpatches **in sequence** before making further changes. Never mix packs or reconstruct missing files by guessing. Make one focused commit and distribute as Git `format-patch` (prefer ZIP containing `.patch`); use the repository Git author and English passive-voice commit subject. Test on a clean reapplication. Include in chat: commit subject, validation, browser-check instructions if needed, and next patch preview.

## Invariants / guardrails

- Do not conflate `Canvas engine`, `Optical comparison` and optical physics/profile selection.
- Vacuum means straight optical rays, regardless of surface geometry.
- Solver `no solution` is not proof of physical occlusion; distinguish numerical failure from blocked geometry.
- `legacy-k` effective radius is a proxy, **not** a numerical `n(h)` ray solution.
- Keep camera/units explicit: metres, radians, tangent-plane reference.
- Geometry tests and physical ray-intersection oracles take priority over pixel equality.

## Open limitations

2D/3D coupling, global completeness of ground-event isolation for rapidly varying profiles, lack of adaptive error control, global/multipath completeness of atmospheric target shooting (103 covers one forward-x branch), physical mesh intersections, and ray-driven main Canvas visibility for surfaces/fills (physical tower outlines only in 107). Details and proposed interface contracts: `docs/migration-optics-audit.md`.

## Architectural decision after patch 101

The intended optics scope is standard exponential atmospheric refractivity and an analytically engineered positive-gradient profile for Flat horizon occlusion, not mirages or arbitrary multipath rendering. The inverse-spherical profile from Maslovsky (2026), Eq. (73), reproduces the exact spherical *grazing visibility boundary* at equal endpoint heights for configurable R. The simpler exponential-occlusion profile has an exact non-paraxial ray family and is useful as an independent RK4 oracle. Neither is claimed to reproduce all Globe image geometry. The user proposes to accelerate the rendering of all towers by caching a shared optical field covering their common bounding rectangular prism, **not** running an integrator per tower edge.

## Next steps

100–103: complete (fixed-step numerical core, bounded ground events, atmospheric analytical validation, and single-branch target-angle/visibility API). 104: complete (bounded shared-grid projection cache). 105: completed proxy workload with 2/10/85 target points, grid-density comparisons and explicit warm-up vs redraw timings; not a full tower/Canvas FPS benchmark. 106: completed tower **outline** clipping by physical *ground* first-hit visibility; polygon fills and inter-object occlusion remain separate work. 107: completed experimental physical tower Canvas path plus camera projection and real-scene **bounded** workload checks; 85 towers remain incomplete under budget. 108: shared scene/painter optics architecture completed; **109: Standard atmospheric shooting/scene reliability completed with manual browser acceptance still pending**. Next: verify Standard against browser screenshots, then physical polygon interiors, refraction-correct surface horizon, and performance/Globe-versus-Flat validation. Update this file after about 5–10 patches or significant architectural decisions. Recommended effort: High for numerical physics, and potentially Extra High for 103 shooting solver.

## Patch 110 — Physical ground guides and horizon

Physical optics now projects ground guide lines through a radial optical field and supplies a ray-derived finite visible-ground horizon (Globe or engineered Flat atmosphere) to the **existing** shared `CurvatureFrameRenderer`. The previous geometric horizon is no longer copied in the Physical scene. Numerically, observer 15 m / radius 6,371 km gives Globe vacuum ~13.825 km, Globe standard ~16.004 km, and inverse-spherical Flat ~13.825 km. Flat standard/vacuum report no resolved finite horizon in this implementation. The Latin-1 page's UTF-8 middle dot has been replaced with `&middot;`; runtime status uses ASCII separators. See `docs/migration-physical-ground-horizon.md`. Surface guides are approximate sampled curves, not physically filled ground, and tower polygon fills and boundary uncertainty remain future work.

## Patch 111 — Flat ground-guide drawing extent

Before patch 111, Flat + Standard performed ~29,745 ground guide point shoots from world-radius grid segments up to 20,015 km, far beyond a 100 km radial lookup. Ground reference strokes now clip to a finite **rendering** disk before projection; this disk is not a new physical horizon and does not change tower visibility or the physical ground horizon result. It correctly keeps chords crossing the disk. Flat guide subdivision is bounded by retained segment length, and UI diagnostics include skipped/clipped guide edge counts. Tests: `PhysicalGroundGuideExtent111.test.js`. See `docs/migration-flat-ground-guide-extent.md`. Future: viewport-specific culling and screen-error based guide tessellation, plus the shared-prism field.

## Patch 112 — lazy adaptive tower-prism optical field

The physically projected tower scene now refines `OpticalSharedRayField` cells
**on demand** rather than rejecting the entire 13 × 4 root prism grid and
shooting every vertex/edge sample individually. New opt-in API controls are
`adaptiveDepth` (public default 0, scene default 3) and `maxAdaptiveCells`
(scene default 4096). Only checked all-visible cells are interpolated; mixed,
uncertain, out-of-prism, depth-limited and budget-limited samples still use the
exact numerical solver. Independent off-grid tests and real scene comparisons
cover Flat/Globe with Standard and Flat engineered horizons. Measured full
85+2 Flat Standard case reduced 5659 to 1628 exact shooting solves with 3333
unchanged visible strokes, and the same ground-guide calculations. This is a
sampled, **not globally guaranteed**, interpolation error qualification.
Current UI reports adaptive interpolations/fallbacks, qualified cells and the
prism distance/height bounds. Benchmark: `tools/benchmark-adaptive-prism-112.js`.
Full details and acceptance checks: `docs/migration-adaptive-tower-prism.md`.
Next priority: instrument shared optical-field reuse across ground guides and
other geometry, assess boundary completeness, then polygon fills. No new
Canvas renderer, legacy mask or atmospheric model was introduced.

## Patch 113 — shared scene optics cache and performance

The physical ground-guide radial table now uses the tower prism's shared
`OpticalSharedRayField.exact(d,0)` RK4 memoization, with standalone ground-guide
callers retaining their original oracle. Ground and tower exact solve counts
are displayed separately while preserving their combined total. The scene
cache key now incorporates exact physically contributing authored geometry,
styles and metadata, excluding discarded camera-dependent legacy tangent and
horizon guides, preventing stale frames when input geometry changes without model
controls changing. For camera-only redraws, the complete optical composition
is reused without rebuilding thousands of painter-ready strokes; the shared
renderer continues to project and validate the camera frame independently.
An independent real-mesh benchmark covers 2/10/85/200 towers and Globe/Flat
profiles. Flat Standard with 202 towers measured ~0.24 s cold and ~12 ms
cached optics adapter on one Node run; Globe Standard with 202 towers remained
~4.7 s cold, with 276 explicitly unresolved near-horizon leaves. No new
Canvas renderer, atmospheric model or clipping approximation was introduced.
See `docs/migration-shared-scene-cache.md` and
`tests/SharedSceneCache113.test.js`.

## Patch 114 — physical foundation polygon fills in the shared painter

The independent geometry's actual authored fill polygons (`mode & 2`) now pass
through `CurvaturePhysicalPolygonFills` to the same shared `CurvatureFrameRenderer`
used since patch 108, preserving source fill styles and both tower banks.
Source-plane ear clipping handles concave foundation rings; each emitted fill
triangle is checked at corners, edge midpoints and centroid with the same
adaptive `F(d,h)` optic oracle as tower outlines. Near the physical ground
boundary, intersections are bracketed along original world edges and retained
on the **confirmed visible** side. Mixed/uncertain pieces are never filled
blindly; fill-specific triangle/uncertainty counters are shown separately from
outline uncertainty. All previously stroke-only lattice features remain
stroke-only; the patch does not create bogus solid plates. Mutual 3D object
occlusion, formal global/pixel error guarantees and physical ground **surface**
fills are still out of scope. See
`docs/migration-physical-foundation-fills.md` and
`tests/PhysicalPolygonFills114.test.js`. Next: independent optical/visual
validation and remaining horizon boundary cases (115).

## Compatpatch 114.1 — individual tower painter depth ordering

The previous all-fills-then-all-strokes arrangement per bank was replaced by
placed-object batches. `CurvatureGeometryEngine.createObjectSequenceScene`
retains `placedObjectIndex`/`objectBank` metadata on authored primitives;
`CurvaturePhysicalSceneOptics` orders the two banks' objects together far to
near by observer-relative radial distance, emitting each object's clipped
foundation fills and then its outlines. The common painter stays unchanged.
`stats.perGroup` remains a bank aggregate, while `stats.perObject` exposes the
individual object order. Camera-only Pan/Nick/Roll changes do not invalidate
optical rays. No arbitrary intersecting-mesh Z buffer was added. See
`docs/migration-tower-painter-depth-order.md` and
`tests/PhysicalTowerPainterOrder1141.test.js`.

## Compatpatch 115 — physical and shared-painter validation harness

`tools/validate-physical-scene-115.js` adds reproducible numerical and
painter-contract checks, including a `--full --json` suite for 202 authored
objects. It validates independent Globe-vacuum and engineered Flat grazing
limits at two radii and multiple heights; Standard RK4 2000 m versus 200 m
shooting; off-cell adaptive prism errors versus direct fine-step shooting;
vacuum world/camera angle consistency; and per-object far-to-near fill/stroke
batches through the existing shared painter. It also verifies that rebuilding
the source after Pan/Nick camera changes retains the optical composition and
that fully occluded authored towers need not emit Canvas commands. No physics
or renderer code has been replaced. A sampled 1920px/60-degree angular metric
found ~0.015 px maximum in selected cases (not a global pixel guarantee).
Globe Standard at 87 and 202 towers still reports respectively ~130 and ~276
**boundary** leaves. Full browser raster correctness and arbitrary intersecting
mesh occlusion remain unverified. See `docs/migration-physical-validation.md`
and `tests/PhysicalValidation115.test.js`. Next: review any real-browser issues
and focus on horizon boundary closure before claiming full image completeness.

## Compatpatch 116 — bounded near-horizon outline closure and valid fill-painter camera checks

`OpticalTowerSilhouette` now closes sampled single-transition visible/blocked
horizon leaves by bracketing the transition with the existing physical point
oracle. It emits **only confirmed-visible strokes** and leaves the remaining
spatial bracket unpainted; `boundaryClipped`, `maxBoundaryGapMetres`,
`boundaryGapMetres` and `boundaryGrazingStops` explicitly quantify this
conservative approximation. The ordinary 85+2 Globe Standard scene's former
130 `visibility-boundary` unresolved leaves are now 130 bounded clips with
zero unresolved, the maximum measured world gap being ~0.0062 m. The 200+2
scene's former 276 leaves are bounded to ~0.0102 m maximum, with two grazing
samples retained as unpainted intervals. Real `solver_failed`, unbounded,
nonmonotone and sample-budget leaves are **not** claimed as bounded closures.
The numerical integrator, shared ray field and Canvas renderer are unchanged.

The original #115 synthetic painter camera aimed away from all Globe fill
facets: its zero `fill()` count was a viewport-test false negative, not a
missing fill feature. Its validation now checks a third camera pose aimed at
a nondegenerate emitted foundation triangle and independently requires an
actual `fill()` operation. Original camera counts are separately available
in JSON. On Globe/Flat scenes a targeted camera yields nonzero fill calls.
The UI distinguishes genuine solver failures from grazing samples and shows
measured conservative boundary-gap sizes. See
`docs/migration-boundary-closure.md` and
`tests/PhysicalBoundaryClosure116.test.js`. No general pixel-exact guarantee,
multiray completeness, or arbitrary 3D mesh z-buffer was introduced.

## Patch 117 — Physical interactive redraw / Canvas painter profiling

`CurvatureCanvasFrameScheduler` coalesces Physical-only redraw requests on
`requestAnimationFrame`; Legacy/Independent remain synchronous. Adjacent
stroke-only commands of identical Canvas style now share a **bounded** Canvas
stroke batch, keeping fills as painter-order barriers. Slider changes get a
camera-independent, *presentation-only* reduction of dense auxiliary ground
curves; 180 ms after the last model update the full guides are redrawn. Towers,
physical horizon, fills, visibility and the underlying cached RK4 field are
unchanged. Per-stage frame/Canvas metrics are now visible in Physical status.
Stress tool: `tools/benchmark-physical-redraw-117.js` (synthetic 78k line
primitives; no browser FPS claim). Details: `docs/migration-interactive-canvas.md`.


## #118 — Opt-in Physical performance profile in existing geometry ZIP
The existing Export geometry diagnostics ZIP now runs Physical cold/warm/grid-off/preview/Pan profiling with per-stage raw measurements, median and p95. The normal geometry audit is retained; the profiler does not modify the live model. Details: `docs/migration-performance-profile.md`. No optics, occlusion or painting rules changed.

## Patch 119 — camera-aware screen-space ground guide LOD

The browser ZIP profile from #118 isolated ground guides as the primary
redraw cost (~434 ms cached full scene versus ~31 ms without guides; user
hardware). `CurvatureScreenSpaceGuides` now indexes continuous, already
optically projected ground curves and reduces them under 0.5 **backing-store**
pixel sampled-polyline error *before* frame snapshot cloning/validation and
Canvas projection. Whole viewport-outside/near-plane-behind portions are
safely culled, but near-plane crossings and physical horizon remain exact;
missing visibility spans are never connected. Every tower outline/fill and
physical optics cache is unchanged. Original full physical composition is
retained for camera changes. The existing #117 slider preview stays in force;
settled frames use the new LOD path. Timing diagnostics separate LOD and
snapshot; #118 ZIP profiling carries raw `screenLodMs` and selection counters.
A reproducible synthetic 77,600-line benchmark and regression tests accompany
the change. **Browser performance must be measured on real user hardware**;
0.5 px is a bound on sampled vertices relative to the prior polyline, not a
proof against the original continuous optical curve. See
`docs/migration-screen-guide-lod.md`.

## Compatpatch 120 — height-change RK4 efficiency, exact final scheduling, and profiling

The user confirmed that Height changes, unlike cached Pan, remain slow in
Physical/Globe/Standard. An 85+2 tower cold scene requires ~6,258 independent
exact target solves and ~216k RK4 step calls in shooting. #120 reduces
per-step allocation/callback overhead using the algebraically identical RK4
recurrence and prepares the unchanging optical setup/profile once per solve/
shared field. The Physical Height slider now debounces repeated intermediate
updates by 150 ms while displaying an explicit stale-frame warning, then
rebuilds the **last height precisely**; no fake cross-height ray reuse occurs.
The existing ZIP profiler adds a detached height sweep and solver/stage
counters. Full numerical scene hashes and 54 baseline projection points are
regression-checked against #119 at two heights. A Node-only benchmark showed
~29% median cold-build improvement across three warmed height samples,
**not** a browser FPS/latency guarantee. Details:
`docs/migration-physical-height-change.md`,
`tools/benchmark-height-change-120.js`,
`tests/PhysicalHeightChange120.test.js`.

## Compatpatch 121 — guarded Standard shooting and ground-event reduction

On the #120 85+2 Globe Standard cold scene, 6,258 exact target points required
23,611 trial shooting integrations. #121 adds a local, residual-verified
shooting predictor (three attempts max, original bracketed fallback) for
built-in Standard only. Standard ground verification now avoids most costly
substep event probes when an explicit upper bound on ray curvature proves a
step's chord safely above the physical surface, keeping full old ground-event
search for near-contact, grazing and uncertain spans. The RK4 recurrence,
shooting tolerance, atmosphere, physical horizon, tower fills and renderer
are unchanged. A test-only `settings.shootingOptimization:false` retains the
original #120 exact pixel-source scene hashes. Paired Node cold-builds on
85+2 towers reduced 23,611 -> 16,779 shooting evaluations and 36,833 ->
2,878 full ground-event step searches at Height 15 m; wall time varied from
~792 -> ~461 ms in one Node comparison (not a browser latency guarantee).
For standard rays numerical arrival angles may differ by <1e-8 rad; exact
bitwise equality is not claimed on the accelerated path. The ZIP profiler
reports predictor and ground step statistics. See
`docs/migration-shooting-reduction.md`,
`tests/OpticalShootingReduction121.test.js` and
`tools/benchmark-shooting-reduction-121.js`.

## Compatpatch 122 — owned physical assembly and exact-work attribution

Browser diagnostics #121 isolated ~97 ms `assemblyMs` per cold scene with
~82k ground+object primitives; the scene contract's deep defensive clone
accounted for most of it. Physical-only newly projected ground guides,
strokes and fills now transfer exclusive ownership through the new validated
`CurvatureSceneContract.adoptScene` API instead of cloning. External callers'
`createScene` preserves its deep-copy semantics. Reference hashes of all
physical output primitives/ranges match #121 **byte for byte** on four
Globe/Flat and Standard/vacuum scenes; physical equations are unchanged.
The ZIP profiler now also records per-ground/outline/fill increments of exact
target solves, cache hits, shooting trials and RK4 steps. A Node benchmark
observed assembly decrease from ~107–160 to ~13–19 ms on repeated warm
runs; browser timing needs confirmation. See
`docs/migration-physical-scene-assembly.md`,
`tests/PhysicalAssemblyAndSolverAudit122.test.js` and
`tools/benchmark-scene-assembly-122.js`.

## Compatpatch 123 — verified warm starts across nearby target heights

`geometry-diagnostics (45).zip` after #122 measured ~327.3 ms median for a
cold Height change in the user's browser. #123 examined **where** the 6,258
Standard target solves spend their 16,779 shooting angle evaluations. For
faraway targets with almost equal surface distance and different heights, the
field now keeps two previous **validated** target angles and tries their
height/angle secant as the next initial angle. Every candidate runs the same
RK4 and target-residual check, then the same ground-event classification;
failed guesses continue through the unchanged #121 solver. Custom/nonstandard
profiles and near targets retain previous behavior. Test-only
`settings.shootingWarmStart:false` reproduces exact #122 scene hashes.
In the 85+2 Globe/Standard/15 m Node scene this changes 16,779 -> 13,066
shooting angle trials and 159,685 -> 112,076 RK4 shooting calls, while
keeping all 6,258 unique exact target solves. Fully projected scene statuses,
primitive ordering and horizon stay equal across the tested 15 m/15.3 m
scenes; tiny (<1.3e-7 m on the 1,000 m presentation sphere) residual-bounded
coordinate differences mean accelerated scene hashes are not identical.
Wall-clock Node runs have noticeable scheduling/JIT/GC variance; the browser
ZIP is required to confirm end-to-end latency improvement. See
`docs/migration-optical-warm-start.md`,
`tests/OpticalWarmStarts123.test.js` and
`tools/benchmark-optical-warm-start-123.js`.

## Compatpatch 124 — standalone continuous-curvature surface geometry

A new independent module `src/geometry/CurvatureSurfaceGeometry.js` defines
stable local surface coordinates, altitude, unit normal, and *geometric*
horizon for a non-negative curvature `k=1/R`, including an **exact** planar
case `k=0`. Both 2D ray-plane and 3D geodesic-placement APIs are supplied,
with no giant-number radius substitution. Sagitta and altitude evaluations
avoid catastrophic `R*cos(d/R)-R` and `hypot(x,z+R)-R` cancellation in the
observer-facing domain; an analytic tangent horizon avoids large-radius
`acos` cancellation. Tests cover spherical analytic references, 3D round
trips, exact plane, flat-limit convergence, altitude normals, centre
singularity, extreme radii and UMD export. **This patch deliberately does
not change any existing renderer, model, Optical Solver, ground grid, or UI.**
Physical integration is reserved for #125–128. See
`docs/migration-continuous-surface-geometry.md` and
`tests/CurvatureSurfaceGeometry124.test.js`.

## Compatpatch 125 — continuous-curvature optical solver integration

The #124 stable surface kernel is now connected to the physical RK4 tracer,
point-to-point shooting solver and shared-field target coordinate generation.
`curvature: k>=0` is an authoritative optional input; `k=0` is an exact
plane, and legacy `geometry/radius` calls remain compatible. The radial
height/normal metric is evaluated together in each RK4 derivative stage;
contact, grazing and fast-clear-ground checks use the same surface.
Near-flat ground endpoint classification avoids infinite-radius tolerance
overflow. Existing predictor, shooting residual, event verification and
field-local cache semantics are retained. The surface kernel is now loaded
before the tracer in the browser HTML.

A diagnostic-only `surfaceArithmetic:'legacy'` comparison option retains
byte-exact #119/#121/#122 reference hashes; the default stable path
intentionally need not reproduce old floating-point rounding. Two full
85+2 tower scenes retain topology and shooting work with measured, finite
near-grazing coordinate/horizon differences (see migration document).
Atmospheric `occlusionRadius` is not linked to the physical surface
curvature. The UI/model, common source grid and camera will be unified in
#126–128, not in this patch.

See `docs/migration-continuous-optical-solver.md` and
`tests/OpticalContinuousCurvature125.test.js`.

## Compatpatch 126 — shared physical surface world and metric grid

Main Physical Canvas now opts into `CurvaturePhysicalWorldGeometry`, which
uses the shared #124 continuous-curvature surface for placed object anchors,
local tangent/normal bases and bounded metric reference guides. The grid's
ring radii (100 m to 100 km) do not depend on `aDip`, `nLines`, height,
planet radius or a finite horizon. Its spokes share the same metre
landmarks. Surface-arc distances are projected through exact, memoized
radial ground oracles, not the old sparse near-eye angle interpolation.
Contours/fills use stable physical inverse altitude and arc-distance
coordinates; a stable vacuum analytic path is provided for the physical
adapter. Ground-guide culling at 100 km is presentation-only and does not
set the physical optical horizon. Legacy geometry, diagnostics fixtures,
existing model controls and old compatibility hashes stay intact, with
`LineSpacing` clarified as **Legacy LineSpacing**.

The UI still selects `Globe`/`Flat`; continuous curvature slider, infinity
boundary and camera decoupling are reserved for #127. See
`docs/migration-physical-metric-world.md` and
`tests/PhysicalMetricWorld126.test.js`. Real browser grid appearance and
end-to-end profiling require a fresh user Diagnostics ZIP after application.

## Patch 127 — Physical observer-fixed camera and curvature slider (2026-10-28)

`src/app/CurvaturePhysicalCamera.js` supplies a finite observer-fixed
camera for the **Physical** main Canvas: fixed 1000 m view reference, direct
FOV, pan/nick/roll and aspect ratio, stable geometric dip in Horizon mode.
`Eye-Lvl` is independent of the surface curvature. The legacy and Independent
camera are unchanged. The Physical toolbar now contains a logarithmic radius
slider (100 km to 10^13 km), exact flat endpoint (`showModel=2`, k=0), and
`Earth R` reset. The existing `rEarth`/`showModel` state retains Save/Restore
compatibility; only the radius slider adds a visual control. Drag changes
coalesce before a new optical solve; no per-pointer heavy RK4 work.

The huge-radius model reference dip is stabilized above 1e12 m; legacy
ordinary-radius computations and diagnostics remain unchanged. See
`docs/migration-physical-camera-curvature.md` and
`tests/PhysicalCurvatureCamera127.test.js`. Full regression and browser smoke
verification cover Earth, 6000370000 m, 1e16 m and exact Flat with Standard
atmosphere and 85+2 towers. Next: #128 end-to-end convergence, numerical,
visual and performance verification.

## Patch 130 — Modern UI bootstrap and long-term UI split

The new **Modern visualization UI** is developed in parallel with the existing **Legacy engineering interface**; no Legacy controls are removed. The canonical request `CurvatureApp.html?ui=modern` routes to an isolated Modern document using the same `CurveAppClass`, physical scene, ray tracer and painter, while the default and `?ui=legacy` retain the original application. The Modern shell provides Scene (initial Transmission Line Physical view and basic camera/surface/atmosphere/display controls) plus an explicitly unimplemented Compare tab. Detailed RK4, shooting, audits, Physical sanity check and ZIP exports remain Legacy-only. The complete agreed architecture, risks, compatibility contract and patch 130–134 roadmap are preserved in **`docs/modern-ui-plan.md`**. Before the next patch, obtain a manual browser check of both routes; do not treat URL parsing tests alone as a browser acceptance test.

### Compatibility patch 131 — Modern Scene controls

Modern-only Scene control expansion was added without altering Legacy startup,
optical geometry, solver, or painting. The isolated Modern document loads
`src/ui/modern/ModernSceneState.js` (validated shared-model adapter) before
its Modern bootstrap. The Scene sidebar adds camera roll/FOV, direct radius and
exact-flat controls, two editable physical object groups, preset selection,
and automatic debounced rendering. Lake Pontchartrain is the primary preset;
single-tower and two-row samples are explicitly illustrative. Modern edits do
not overwrite Legacy saved state; full experiment persistence stays in patch
134. The architecture/delivery plan is updated in `docs/modern-ui-plan.md`.

### Compatibility patch 131.1 — Modern settings ergonomics

Modern Scene groups were reorganized into five tab panels (Camera / Surface /
Atmosphere / Objects / Display), with the existing presets moved above the
viewport and field help available by hover or keyboard focus. The model, optics,
Legacy interface and 131 field IDs/handlers were not changed. FOV is formatted
for display with four decimals only. See `docs/modern-ui-plan.md` for acceptance
and the continued 132–134 roadmap.

### Compatibility patch 132 — twin Physical Compare viewports

Modern Compare now paints two **independent real Physical Canvas scenes**
side by side with one shared observer, object configuration, FOV and Eye-level
camera. A retains the Scene curvature; B is exact flat (κ=0) using the same
atmospheric model. Their model snapshots are independent and do not mutate
Scene. Both invoke the existing `CurvatureMainCanvasRenderer.renderPhysical`,
not legacy `Globe+FE` or copied raster output. Each comparison graph has its
own equal-sized Canvas and clipping, created at HTML parse time; at mode
changes, dimensions and redraws are synchronized. The reduced half-panel
width changes pixel density relative to single Scene, but A and B retain
identical angular scale within Compare. User-selectable independent A/B
surface and atmosphere parameters are postponed to #133.

Patch 132 also removes redundant native browser tooltips from custom Modern
help buttons, clarifies physical-object help, and drops an unused Modern-only
`SceneFrame` script that previously raised a missing legacy-adapter exception.
`docs/modern-ui-plan.md` is the canonical roadmap; Legacy/physics remain
unchanged. The JS/Physical test suite and inlined Chromium browser smoke
(including 85+2 towers in Standard atmosphere) exercise both panels.

### Compatibility patch 133 — independent physical Compare models

Modern Compare now offers validated independent A/B surface curvatures,
exact-flat endpoints, atmospheres and engineered profile comparison radii,
including four explicit physics-pair presets. The authored Scene camera,
observer, physical objects and grid remain common and are not overwritten by
Compare edits. The 132 `CurveAppClass` cloning and Physical renderer are reused.
The original single-scene optics cache is retained; A and B now receive their
own instances of the existing keyed optical transform cache, preventing
alternating viewports from invalidating each other. The selected Compare pair
persists while switching Scene/Compare in the same page session. No experiments
are saved across reloads: versioned shareable experiments remain planned for
#134. See `docs/modern-ui-plan.md` and
`tests/ModernIndependentCompare.test.js`.


### Compatibility patch 133.2 — forward-traced horizon diagnostic

A separate `OpticalRayHorizon` module scans launch angles through the
existing RK4 ray tracer and accepts a finite first-contact tangent boundary
only after a hit/confirmed interior-clear-minimum angular bracket converges.
Its result is shown numerically under each Compare viewport and optionally
as an orange dashed angle guide alongside the independent green Eye-level
reference. Diagnostic results are cached per model and do not change
renderer/Scene/Legacy physics. If not resolved within finite range, the
readout explicitly says so; no horizon is inferred from clipping, failed
shooting or exhausted integration distance. Camera Roll currently suppresses
the horizontal horizon overlay. See `docs/modern-ui-plan.md` and
`tests/OpticalRayHorizon.test.js`.


### Compatibility patch 133.2.1 — angular guide projection corrected

Corrected the signed-angle-to-Canvas-y mapping in Modern Compare. Negative
optical horizon elevation is now drawn below the 0° Eye-level line, and the
marker matches the actual Physical perspective projection across camera
Nick values (and shared off-axis Pan). No optical or numerical horizon
algorithm was changed. Regression tests include
`tests/ModernAngularGuide.test.js`; the limitations stated for
patch 133.2 remain in effect.

### Source naming convention (compatpatch 133.3)

Source filenames, module exports, browser globals, classes, and functions are named for their responsibilities, not the patch that introduced them. Patch identifiers remain in Git history, patch artifacts, and historical documentation. Historical test case labels and numbered fixtures may retain their identifiers where they describe a specific regression or oracle version. This cleanup does not change physical calculations or rendering behavior.

### Patch 134 — Modern experiment URL/state

Versioned `ModernExperimentState.js` serializes validated *inputs* from the
shared Scene and independent Compare A/B into a reproducible, UTF-8 base64url
`experiment` query parameter. URL configuration supersedes Modern localStorage
and default presets. Debounced autosave and URL copy/reset controls have been
added without modifying Legacy `state`/DataX behavior, physical optics, or
render caches. Explicit incoming share links are not auto-rewritten after
user edits; Copy experiment URL serializes current state. Named experiment
library and JSON import/export remain next in 134.1. Source module names must
continue to follow their purpose, never the compatibility patch number.

### Patch 134.1 — Named Modern experiment library and JSON exchange

Modern `ModernExperimentLibrary.js` stores up to 50 named, validated experiments
under a dedicated localStorage key. Names are unique case-insensitively and
replacements and deletions require confirmation in the browser UI. A separate
library panel supports save/load/delete and import/export of JSON. The JSON
format is exactly the versioned input-only `ModernExperimentState` schema used
by Modern URLs; imports are validated before applying and do not silently
overwrite named entries. Library persistence is separate from the automatic
last-session state. Legacy URL/state and the physical optical engine remain
unchanged. Source names continue to be responsibility-based.

### Patch 134.2 — shared settings tabs in Compare

Scene and Compare now use one five-tab settings sidebar. Camera, Objects and
Display are the same actual input nodes bound to the shared `CurveAppClass`;
Compare-specific Surface and Atmosphere tabs edit only the selected A/B physics
descriptor. Model selection and pair presets remain above the tab list. Compare
Camera aim is explicitly fixed to eye level while retaining Scene's saved aim.
Compare guide toggles were moved to Display. Changing tabs updates ARIA and
panel visibility without recomputing optics; model or shared parameter changes
continue to redraw through the existing Physical renderer and use unchanged
version-1 experiment URL/localStorage/JSON serialization. Legacy is untouched.
Node regression: 558/558 tests, including three new shared-controls checks.

### Patch 134.3 — Atmospheric model help and legacy option cleanup

Modern Scene and Compare Atmosphere panels show a concise description and the
actual refractive-index law from `OpticalRayTracer.atmosphere`: vacuum `n=1`,
standard `n=1+0.000293 exp(-h/7350 m)`, and the hypothetical engineered
exponential `n=n0 exp(h/R)`. The UI calls the latter **Exponential refractive
profile** rather than occlusion, while keeping the stable internal key
`exponential-occlusion` for saved links and tests. The inverse-spherical law
is described when loading a historical experiment; it and the two inverse
pair presets are hidden from the default picker but retained, restorable and
editable when selected by URL, JSON, or named library. No physics formulas,
experiment schema version, Legacy behavior, or cache keys were changed.

### Patch 135 — Refraction scale radius in Modern UI

The existing `occlusionRadius` (metres) is exposed as **Refraction scale radius
(km)** for engineered atmospheric profiles in both Scene and independent A/B
Compare settings. UI values are converted to metres before reaching the optical
solver. The experiment URL/JSON/localStorage schema and cache key remain
unchanged, as does the separate geometry/reference radius.

### Patch 135.1 — Safe radius editing and reference-radius guidance

Radius fields in Scene and Compare now treat `input` as an uncommitted draft.
Only Enter or the native `change` event (including loss of focus) validates
and redraws physical optics; the previous 420 ms typing timer no longer
triggers expensive renders at intermediate values such as `1` or `10` km.
Committed values are idempotent across Enter + change and retain the independent
Compare A/B physics and unchanged metre-based optical state. A visible draft
hint explains how to apply values. For exact flat geometry, the Compare Surface
tab explicitly notes that the reference radius does not bend rays; the
separate atmospheric Refraction scale radius controls engineered refraction.
The optical cache already keys `occlusionRadius`, so no cache or physics changes
were necessary. No numerical time-to-completion guarantee is made for a
purposefully committed extreme profile. Node regression: 566/566 passed.

### 135.2 — Surface radius controls for flat geometry

- Modern Scene hides curvature slider, surface-radius input and Earth-radius reset when Exact flat is enabled; the flat selector remains available.
- Modern Compare hides the surface-radius field for the selected flat model and labels it `Surface radius (km)` on spherical models.
- Underlying surface radii remain stored, including when switching between flat and spherical surfaces, with no changes to experiment serialization or optical physics.
- Tests include switching both modes and preserving a manually entered sphere radius.

### 135.3 — Legacy-style surface curvature slider

- Compare Surface now uses the existing `CurvaturePhysicalCurvature` logarithmic
  step-to-radius mapping (0–999, from 100 km to 1e13 km), with step 1000
  representing exact flat geometry. The former geometry dropdown is removed.
- `Flat` and `Earth R` actions are provided; a precise radius field is available
  for spherical geometry. Slider input changes only the selected A/B configuration,
  and the expensive optical redraw is deferred until slider change/release.
- The Scene curvature slider stays visible at exact flat so that the user can
  leave the exact-zero endpoint without first using a separate geometry toggle.
- The existing compare schema (`surface`, `radiusKm`) and the physical solver are
  unchanged. Flat models retain their previous finite reference radius.
- Node regression: 568/568 passed.

### 135.4 — Compare curvature commit and redraw synchronization

- Compare curvature input updates the selected A/B descriptor and explicitly
  marks the existing viewport as **Pending curvature change**, rather than
  displaying an old `Cached` status beneath a new surface radius.
- Expensive optics are rendered once on range `change`, `pointerup`,
  `pointercancel`, or keyboard completion; a 700 ms idle fallback covers
  controls that emit only `input`. Duplicate release/change events do not
  retrace. Switching the selected A/B model commits pending slider edits.
- The viewport reports `Rendering current model` before the new frame;
  completed cache hits are labelled `Repainted (cached rays)` to distinguish
  painter refresh from recalculating optical ray fields.
- Physical cache and renderer code are intentionally untouched: the cache
  already includes `showModel` and `rEarth`. A new integration regression
  exercises real metric ground and tower optics and verifies that changing
  Model B from flat to Earth-radius sphere invalidates the B cache and
  changes visibility and horizon, while Model A reuses its cache.
- The internal `surface` + `radiusKm` experiment schema and Legacy UI are
  unchanged. A nearly flat radius can still render nearly identically to
  an exact flat surface, for legitimate geometric reasons.
- Node regression: 572/572 passed; Chromium was available but local/file
  navigation was blocked by administrator policy, so no browser acceptance
  result is claimed.

### 135.5 — Unified Scene and Compare Display controls

- Display now exposes the same ground grid, eye-level angle guide, and forward
  traced horizon switches in both Scene and Compare. All three controls remain
  mounted once and apply to the active viewport(s).
- The Scene painter now draws the same optional screen-space angle overlays
  used in Compare, with a separate cached horizon diagnostic keyed by physical
  parameters. Existing physical ray tracing and independent A/B atmosphere
  configuration are unchanged.
- Display options use the existing version-1 experiment fields, so URL and
  JSON interchange remain backward-compatible; switching modes does not
  reset the selections. Canvas-free test shims safely skip painter annotations.
- Node regression: 573/573 passed. Browser acceptance remains unverified.

## Patch 136 — atmospheric inverse physical requirements (research note)

The future atmospheric inverse problem has been documented in
`docs/atmospheric-inverse-physical-requirements.md`. The note separates
hydrostatic mathematical existence, convective stability, and nonlinear
mixing times; derives the dry-air inverse temperature relation for the
engineered exponential `n(h)`; records the **illustrative local** ~188 K/km
lapse-rate and ~13 s linear instability e-folding estimates with their
assumptions; and scopes a later temperature/gradient visualization. This
patch changes **documentation only**; no atmospheric solver or UI has been
implemented. For Vacuum, thermodynamic diagnostics are not applicable.

### Camera drag cursor portability — patch 137.2.2

PNG-backed open/closed hand cursors now replace browser-native `grab` and
`grabbing` glyphs in the Modern Scene and Compare viewports, with native
cursor keywords retained as fallbacks. See
`docs/modern-camera-portable-cursors.md`. Camera interaction, physics and
preview transforms are unchanged; Opera appearance requires manual verification.

### 138.4 — Atmospheric shimmer stability and frame budgeting

- A nonmoving shimmer (`Intensity = 0` or `Drift = 0`) now stops its continuous RAF/GPU cycle after an immediate single-frame update. Scene GPU presentation is capped at 60 Hz and the two Compare views at 30 Hz each; physical ray tracing and turbulence displacement math are unchanged.
- Camera-drag resumption resets the shimmer phase clock; background-tab time is not accumulated into the next frame.
- Recoverable WebGL context loss exposes the original physical Canvas and leaves undistorted annotations visible. The restored GPU program uploads the **cached physical Canvas** and resumes without rerunning the optical solver.
- Browser script URLs were version-bumped for deterministic cache invalidation. Test procedures and caveats: `docs/atmospheric-turbulence-performance.md`.

## #140.0 GPU Capability Diagnostics

- Opt-in **Display → GPU capabilities → Check GPU** probe, implemented in
  `src/ui/modern/ModernGpuCapabilities.js` with a thin UI bridge in ModernApp.
- Reports WebGL/WebGL2/WebGPU availability, optional renderer information,
  float-texture extension status, and conservative software-renderer hints.
  Hardware acceleration is not claimed as confirmed by context creation.
- Uses temporary canvases only and does not alter Canvas 2D physical rendering,
  atmospheric shimmer, Scene/Compare state, or saved experiments.
- See `docs/gpu-capability-diagnostics.md` for browser verification and
  interpretation. Automatic backend selection is intentionally not included.

## #140.2 — Experimental WebGL2 projected-geometry renderer

- Display now selects **Canvas 2D (reference)** or **WebGL2 (experimental)**
  manually for Scene and Compare A/B. Default remains Canvas 2D. Selection is
  in-memory only; URLs, saved experiments and physical math are unchanged.
- A separate WebGL2 painter consumes **the same** CPU-projected triangles and
  stroke segments as the existing ordered painter. Lines are approximated by
  screen-space rectangular quads; minor antialiasing/join differences are
  expected, and there is no new optical or Z-buffer solver.
- WebGL draws into a dedicated offscreen canvas, composited with `drawImage`
  to the existing GraphX3DX Canvas. A true zero-copy presentation is deferred.
  GPU errors, lost contexts and unsupported color styles fall back atomically
  to the original Canvas painter; the UI reports the actual backend and reason.
- Profiling now records the backend of each physical redraw and labels painting
  as **CPU wall-clock raster/presentation time** rather than GPU execution.
  GPU timer queries in #140.1 continue to time shimmer only.
- Details and Opera acceptance checklist: `docs/modern-gpu-geometry.md`.

## #140.8.1 browser benchmark compatibility

- Corrected WGSL direction normalization to avoid invalid multi-component
  swizzle assignment rejected by Opera's WebGPU compiler.
- Corrected HTML numeric step validation and used `valueAsNumber` for numeric
  controls in the standalone benchmark. Added regression tests for both.
- Production optical solver and renderer remain unchanged. Actual GPU shader
  compilation and performance still require a WebGPU-enabled browser run.


## #140.10 — bounded real-scene GPU-assisted shooting spike

- #140.9.1 analytical accounting now distinguishes obsolete naive Vacuum failures from compensated analytic failures (18/18 compensated gates passed in the user-provided measurement).
- Added 64 actual production-composed mesh targets each for 12-tower Flat and Globe scenes; deterministic generator and committed fixture.
- Added opt-in WebGPU compensated shooting-angle candidate kernel; unchanged production CPU `OpticalTargetProjection.solve` performs all target and ground-event certification via the existing warm-start API.
- Added standalone browser spike and JSON report: cold GPU setup, upload/readback, CPU certification, statuses and angle comparison, explicit stage-only 2x stop gate.
- **No live production switch**; stage evidence excludes full scene assembly, outlines, fills, guides and painter. See `docs/webgpu-real-scene-shooting-spike.md`.

## #140.10.1 — Canonical WebGPU diagnostics UI and validation rule

- **Persistent project rule:** Do not create a new version-numbered HTML page in `tools/` for each WebGPU experiment or compatpatch. Maintain the single canonical `tools/webgpu-optics.html`, with an experiment selector when historical workflows remain useful. Retire redundant HTML pages and update references/tests. New JavaScript modules are justified only by distinct implementation responsibilities, not patch numbers alone.
- WebGPU WGSL must be validated by an actual shader compiler when available, and tested in the target browser before claiming runtime success. JavaScript mocks and regex checks do not establish shader compilation or GPU correctness; disclose unavailable runtime verification.
- #140.10.1 fixes the WGSL reserved identifier `target` to `targetData`; the real browser run of #140.10 is still pending. No production backend change.

## #140.10.2 — Unified WebGPU diagnostics Run-button regression

- Fixed the consolidated `tools/webgpu-optics.html` event wiring: panel-local
  `querySelector` calls must use **CSS ID selectors** (`#start`, `#save`, etc.),
  not bare tag names (`start`, `save`). The latter return null and abort all
  subsequent inline script execution, making Run buttons appear inert.
- Regression tests must **execute the real inline browser handler script**
  against a DOM stand-in, verify listener registration for every experiment,
  and invoke the scene Run handler. Text/regex-only HTML tests are insufficient.
- Preserve the canonical HTML file; do not create numbered `tools/` pages.
  No production backend or WGSL numerical changes were made in this fix.

## #140.10.3 — WebGPU scene-shooting experiment closed (reopenable)

- User-run #140.10 browser report (`curvature-webgpu-optics-140.10-scene-spike.json`, 2026-10-30): Flat and Globe, 64 real 12-tower mesh targets each; **0/128 GPU warm starts accepted**; no status/angle mismatches and no unresolved targets.
- CPU-only shooting **27.3 ms**; GPU setup **26.7 ms**, upload/readback **13.6 ms**, CPU certification **27.6 ms**; cold hybrid **67.9 ms** (**0.402x**, ~2.49x slower). CPU shooting RK4 calls increased from **47,371** to **63,822**. Single cold run; Intel Gen-12LP, hardware acceleration unverified.
- **Decision: `SCENE_PERFORMANCE_STOP` — CLOSED / PARKED.** Predeclared warm-start and 2x cold-stage gates were not met. Do not integrate this hybrid GPU shooting path into production or extend synthetic GPU tuning by default. Keep the CPU optical solver/ground events/renderer as the reference.
- May be reopened later only for a materially different approach or new workload evidence, with a new explicit hypothesis, bounded scope and predeclared numerical/end-to-end speed gates. No claim that all GPU optical computation is intrinsically unhelpful.
- Detailed measurement, limitations and reopening policy: `docs/webgpu-real-scene-shooting-spike.md`. Preserve the **single** `tools/webgpu-optics.html` rule from #140.10.1. No production changes in this closure patch.

## #140.12 — independent GPU shooting solver, diagnostic prototype

- Implemented `src/diagnostics/CurvatureWebGPUBatchShooting1412.js`, a
  **separate** GPU-side sweep (33 parallel launch rays per target), bracketed
  refinement (up to 28 iterations), and bounded first-ground-contact sampling.
  The output implements the #140.11 batch response contract. CPU runs only as
  a **separate comparison baseline**, never inside the timed GPU solver.
- Added the #140.12 mode to existing `tools/webgpu-optics.html` (no numbered
  HTML), using the same committed Flat/Globe production 12-tower target fixture
  as #140.10. The mode exports an evidence JSON report; Node tests verify
  bounded inputs, fail-closed results, GPU dispatch orchestration and UI
  button wiring, **not** real shader compilation or physical GPU correctness.
- **Research only; NOT production authorized.** Real browser WGSL compilation,
  numerical parity (status, angle, target residual and first-ground evidence)
  and 2x cold-stage speedup were measured in the user-run 2026-10-30 browser
  report and FAILED (details in #140.12.1 below). A finite scan does not
  guarantee all roots or tangent contacts, and f32 may fail strict precision.
  Never assume success from mocked tests. CPU optical solver, synchronous
  scene field, Scene/Compare renderer and their backend selectors are unchanged.
- Next: isolate the observed #140.12 numerical failures using the #140.12.1
  per-target / warm-pipeline diagnostics; do not silently relax tolerance or
  switch production based solely on WebGPU capability. Full async preparation
  and fallback only become relevant after independent stage qualification.
- Detailed algorithm, limitations, gates and browser workflow:
  `docs/webgpu-independent-batch-shooting.md`. The earlier
  `SCENE_PERFORMANCE_STOP / CLOSED / PARKED` verdict for the different
  #140.10 warm-start approach remains valid.

## #140.12.1 — independent GPU shooting parity and warmed-pipeline diagnostic

- A user-run **real browser** #140.12 report (`curvature-webgpu-optics-140.12-independent-shooting.json`, 2026-10-30, Intel Gen-12LP) showed **`BATCH_NUMERICAL_STOP`**, 64 targets each for Flat/Globe. CPU times 34.7/56.8 ms; GPU cold 867.5/71.3 ms; 54/53 angular mismatches (107/128), 4/3 status mismatches and 4/6 ground-event mismatches; 3 unresolved targets in each scene. Flat setup alone 826.5 ms. **No production approval; this replaces the earlier "not yet measured" status of #140.12.**
- New read-only diagnostic module `src/diagnostics/CurvatureWebGPUBatchDiagnostics14121.js` reports every target's CPU/GPU status, angle, residual, ground evidence and numerical discrepancy flags, reusing the #140.11 strict comparison gates. #140.12 WGSL now outputs selected sweep-bracket index/count, refinement-iteration count and final bracket bounds in previously unused buffer slots. **The root search, refinement math, event decisions, precision and tolerances are unchanged.**
- Optional `solveBatch(..., ..., {warmRepeats:3})` reuses the same device, two pipelines and buffers for three further full workload runs, reporting first cold run, warm sample times, warm median and raw-output bitwise stability. CPU reference is measured separately. Warm timings include upload+dispatch+readback; these are diagnostic wall-clock numbers, **not full scene/FPS, kernel-only timings, or authorization to switch solvers**.
- Sixth selector mode in the **existing** `tools/webgpu-optics.html` exports `curvature-webgpu-optics-140.12.1-diagnostics.json`. Historical #140.12 and older modes remain available. No new numbered HTML pages, no production changes.
- Next: run #140.12.1 in a real WebGPU browser, inspect per-target differences before changing one algorithmic assumption (sampling density, f32 precision, event detector, etc.). WGSL runtime verification and performance require browser execution; mocked Node tests are not proof. Details: `docs/webgpu-shooting-diagnostics.md`.

## #140.12.2 — root-refinement numerical A/B and analytical vacuum gate

- User-run #140.12.1 real-browser evidence (2026-10-30, Intel Gen-12LP): 54/53 angular discrepancies for 64 Flat/64 Globe targets; 4/3 status and 4/6 ground-event mismatches; GPU warm median 37.9/50.1 ms vs CPU 28.2/44.7 ms. GPU found one sweep bracket for every target but reported zero final width on all of them.
- Root-cause inspection identified a **premature WGSL stopping rule**: stop at target-height residual ≤ **0.005 m** and force `a=b`, even though the independent angular parity gate is **1e-7 rad**. The 107 angular mismatches are not yet fully attributed to that cause; other f32 trajectory or event issues may remain.
- Added **opt-in `angle-bracket` GPU refinement**: continue bisecting until retained width ≤ **2e-8 rad**, f32 midpoint stall or 28-iteration cap; never shortcut on the 5 mm residual. Preserve the unchanged original `residual-stop` shader as default for historical experiments. Invalid intermediate arrival fails closed; final residual and existing ground classification remain mandatory. Sweep density, compensated integration and ground sampling are unchanged.
- New research-only `CurvatureWebGPURootRefinement14122` compares original/refined GPU results against the **same** independent CPU oracle for all 128 real scene targets, with per-target bracket telemetry, independent warm/cold timings, and seven separate **Flat/vacuum analytic angle** checks (`atan2(Δh,x)`). Separate GPU sessions per variant; all times are browser wall-clock; no full scene/frame claim.
- Seventh mode in the **existing** `tools/webgpu-optics.html`, exports `curvature-webgpu-optics-140.12.2-refinement.json`; no numbered HTML files. Tests cover numerical-model regression, output evidence, policy selection, fail-closed behavior and real inline UI wiring. **No production CPU solver, painter, Scene/Compare or backend selector changes.**
- **Not yet verified in a real GPU browser after this change**; previous `BATCH_NUMERICAL_STOP` is retained. No production authorization is possible in this experiment. Next: obtain the browser JSON and distinguish fixed angle discrepancies from residual f32 and ground-event mismatch. See `docs/webgpu-shooting-root-refinement.md`.

## #140.12.3 — intentional 5 mm target tolerance and physical GPU qualification

- **Correction of experimental interpretation:** `targetTolerance: 0.005` m is the user's **intended physical shooting accuracy**, not a bug in the original GPU `residual-stop` algorithm. The separate `1e-7` rad angle-parity gate was overly restrictive for that purpose. The #140.12.2 `angle-bracket` refinement remains an independent research A/B option, but is **not required** for acceptable 5 mm shooting and may cost performance.
- New diagnostic-only `src/diagnostics/CurvatureWebGPUPhysicalTolerance14123.js` uses the **unchanged** original GPU `residual-stop` shader. It tests **individual** CPU and GPU target-height residuals <= 5 mm; their *difference* and angular parity remain diagnostics. Crucially, it also independently replays the **GPU angle** through the f64 CPU integrator at fixed target x (no new shooting search, **outside timed GPU work**) and demands <= 5 mm there. No self-certified f32 GPU hit is trusted as cross-model physical accuracy.
- Keep visibility/ground correctness mandatory: matching statuses, matching first-event existence/type, <= 1 mm event path-length difference, no `indeterminate`/`solver_failed`, stable GPU repeats. GPU ground-level target classifications do not yet reproduce CPU's specially tightened endpoint tolerance. Only after these checks consider the **unchanged 2x cold GPU stage speed gate**, with production authorization always false. Warm runs reuse device/pipelines/buffers and remain separate from full-frame costs.
- Reassessed *user-run* #140.12.1 report (2026-10-30): all 128 **GPU self-reported** residuals lie within 5 mm (max Flat 3.900 mm, Globe 3.633 mm), even though the strict diagnostic recorded 107 angular discrepancies. Independent CPU replay of the **recorded** GPU angles shows one >5 mm residual, Flat target #54 (~5.172 mm); none in Globe. Ground/status disagreements remain (Flat 4/4, Globe 3/6). The newer report's warm CPU/GPU ratios were 1.20x and 1.44x, cold 0.486x and 0.915x: not the required 2x cold gate. Historical `BATCH_NUMERICAL_STOP` applies to the older strict experiment; no retroactive stage pass is implied.
- Eighth option in **single** `tools/webgpu-optics.html`: `#140.12.3 — physical 5 mm qualification`; exports `curvature-webgpu-optics-140.12.3-physical-tolerance.json`. Production shooting/renderer and all WGSL are unchanged. Node tests are not real-browser GPU verification. See `docs/webgpu-physical-tolerance.md`.

## #140.12.4 — visual-impact triage instead of strict millimetre parity

- Interpret the user's 5 mm vertical target tolerance and the old 1 mm
  first-ground event comparison as **diagnostic conventions**, not hard
  perceptual limits. A status flip close to the surface may or may not affect
  the actual image; neither a passing 5 mm replay nor a subpixel angle shift
  alone certifies image equivalence.
- Extend the **existing** `CurvatureWebGPUPhysicalTolerance14123.js` with an
  optional illustrative screen-space angle projection and independent `f64`
  CPU first-ground event replay at GPU launch angles. Parameters are explicit:
  vertical FOV, camera pitch, viewport height, pixel budget, near-surface and
  near-endpoint path windows. Boundary cases are **flagged for review**, never
  automatically accepted. Older physical checks and their report remain intact.
- The ninth mode lives in the **same** `tools/webgpu-optics.html`; no new JS,
  HTML, docs, or test files were added. Existing tests cover perspective
  projection, clipped/offscreen rays, near-target vs early ground contacts,
  unresolved outcomes, warm-policy preservation and real inline UI wiring.
- Earlier #140.12.1 data replayed offline through the new illustrative proxy:
  all 128 launch-angle differences <0.067 proxy px (1080 px viewport, 45°
  vertical FOV), but Flat 4/64 and Globe 6/64 still require actual-frame
  investigation due to status/ground disagreements. Three near-endpoint
  candidates per geometry are not passes; Flat #51 remains a distinct earlier
  ground contact (~2.45 m before target).
- `VISUAL_PROXY_ONLY` can **never** authorize GPU production use. No live
  camera projection, image rasterization, frame diff, full-frame performance,
  automatic opt-in, CPU solver, or GPU WGSL change. The original cold ≥2x
  stage speed requirement remains unevaluated by visual comparison itself;
  all available real browser evidence so far remains below it.

## #140.12.5 — performance-first GPU batch-shooting scaling (research only)

- Motivation: do not optimize extra millimetres if the difference is visually
  negligible. An illustrative **1 pixel** launch-angle projection budget is
  used for triage, **not** as automatic acceptance of visibility/occlusion
  changes. Silhouettes and actual frame images are still untested.
- The existing `CurvatureWebGPUBatchShooting1412.js` now exposes a reusable
  `createSession(capacity, ...)`: one adapter/device, **two unchanged shooting
  WGSL shaders**, two compute pipelines, and five preallocated buffers for
  multiple successive size-controlled batches. The old one-shot `solveBatch`
  delegates to this session and still closes resources. Experimental batch
  capacity rises from **256 to 1024 targets** (bounded, not production).
- The existing `CurvatureWebGPUPhysicalTolerance14123.js` provides
  `runPerformance`: identical **64** tower targets are deterministically
  replicated into **128/256/512/1024** rays (selectable max). CPU f64 shooting
  is timed once per size; GPU times include host upload, command encoding,
  submit, wait/readback, with warm samples reusing all GPU resources. The
  reported phase breakdown is **host wall-clock**, not GPU timestamps or an
  isolated kernel measurement. The 64-target baseline only gets the expensive
  independent CPU/GPU-angle physical + ground verification and visual proxy.
  Prefix output consistency and repeat bitwise stability are tracked across
  sizes; GPU statuses are counted for every size. No 2× cold gate or numerical
  angle-parity veto is imposed for this profiling stage.
- The tenth mode is in the **same** `tools/webgpu-optics.html`. Report export:
  `curvature-webgpu-optics-140.12.5-performance.json`. No new JS, HTML,
  documentation, or test files, and no production renderer/solver switch.
- **Measurement pending** in an actual WebGPU browser; Node/mock tests cannot
  establish throughput. Larger replicated batches may not model full-scene
  material diversity, caching, horizon, or rasterization. The result only
  selects promising sizes/optimization paths. `PERFORMANCE_PROFILE_ONLY` is
  never a production authorization; full-frame tests still needed.

## #140.12.6 — distinct physical-edge shooting and 1D projected sample comparison

- Extended the **existing** deterministic scene-fixture generator and existing
  reference JSON: each geometry now contains 1024 different points selected
  from >1000 real 12-tower physical polygon-edge samples (subdivided in the
  source mesh before coordinate conversion). The original 64 vertices and
  previous experiments are preserved unchanged. No new repository files.
- `runDensePerformance` in the existing tolerance diagnostics runs nested
  64/128/256/512/1024 target subsets using a bit-reversal order that spans
  the scene and preserves earlier prefixes for stability checks. CPU and GPU
  are measured separately; GPU reuses its pipelines/buffers/device.
- The largest batch reports illustrative subpixel launch-angle shifts, status
  disagreements, unresolved rays, ground contact-class disagreements and
  sampled projected visible-target row occupancy; a dedicated red diagnostic
  strip shows unmatched rows outside the 1 px budget. Replayed GPU-angle
  ground events for at most 24 disputed targets are **not timed as GPU work**.
- Added the eleventh mode to canonical `tools/webgpu-optics.html` and reused
  existing unit tests/docs. Does not compare full rendered scenes or actual
  tower silhouettes, does not measure FPS, and never authorizes production.
- Actual browser GPU performance/visual results for this dense case remain
  **pending** until an exported #140.12.6 JSON is obtained.

## #140.12.7 — opt-in CPU/WebGPU optical probe in Modern Compare (research only)

- Existing Modern Compare now offers **Physical models A/B** (unchanged default)
  and **CPU / WebGPU optical samples** (explicitly selected). The research
  mode clones the chosen A physical model onto B (including atmosphere and
  radius), without altering saved A/B settings, the Scene model, or production
  solver/renderer defaults.
- The existing `ModernCompareModel` draws deterministic, distributed samples
  from *the current* authored physical model's object vertices **and real
  edges** (up to 1024 unique samples). No archived 12-tower fixture or
  replicated rays are inserted. A request uses the existing bounded
  `CurvatureOpticalBatchContract1411` and independent
  `CurvatureWebGPUBatchShooting1412.createSession` interfaces.
- Only an explicit **Run sampled comparison** launches CPU f64 and WebGPU f32
  batch shooting. Timings distinguish CPU reference, GPU setup, first batch,
  and warm GPU readback-inclusive wall clock. A/B angular maps use the same
  sample targets and mark status disagreements in red. Unresolved rays and
  >1 px *illustrative* launch-angle shifts are reported separately, never
  silently accepted as equivalent. A JSON export includes the sample report
  and a `productionAuthorized:false`/`actualRenderedImageCompared:false` flag.
- Both full rendered viewports deliberately remain **CPU physical frames**.
  The angular maps are *not* production camera pixels, filled polygon
  silhouettes, 2D frame difference images, or proof of visually equivalent
  GPU rendering. Compare's experiment is limited to **standard atmosphere**;
  unsupported models and WebGPU absence fail visibly without a backend switch.
  Changing the physical scene invalidates old probe displays; out-of-date
  asynchronous runs cannot publish results. Resources are closed after each
  run. The GPU scene backend is **NOT** integrated or authorized.
- Only existing files were touched (Modern HTML/CSS/App, CompareModel, existing
  tests and this PROJECT_STATE). The next stage for true CPU/GPU full-frame
  Compare requires an async, cacheable ray-field interface (including adaptive
  fill/outline/ground consumers), then actual painter-frame comparisons.
- Node tests and Node-side current-scene sampling smoke checks cannot execute
  WebGPU shader code or certify browser performance. A browser export is
  required before any claim about runtime performance/visual parity.

## #140.12.8 — independent ground-event triage of Compare CPU/GPU disagreements

- The optional Compare CPU/WebGPU optical sample probe now independently replays **only status-disputed GPU launch angles** through the existing CPU f64 ground-event tracer, after GPU timings are complete.
- Exported `groundReview` preserves each disputed target index, CPU/GPU status, GPU launch angle and path length, CPU replay ground contact and remaining path distance, or an explicit unavailable/error reason. At most 64 disputed targets are replayed; truncation is explicit.
- This answers whether the *GPU-angle CPU trajectory* crosses the ground, **not** whether a real pixel is occluded. A path-distance remainder is not a vertical screen-space displacement.
- The probe remains research-only. Both rendered Compare frames still use the CPU renderer; no GPU frame, silhouette comparison, asynchronous full-frame ray field, or production authorization is claimed.
- `curvature-compare-140.12.8-cpu-gpu-ground-review.json` is the new export name. This patch does not claim that the exported result has been measured in a browser.


## #140.12.10 — asynchronous GPU-seeded ray field in Compare (experimental)

- The **Build GPU-assisted frame B** action in CPU/WebGPU Compare cold-renders the real CPU model A with an opt-in collector for the adaptive field's exact shooting requests (including outline/fill/ground demand). No archived fixture or synthetic repeated target list is used.
- A bounded selection of up to 1024 uniquely qualified requests is converted from physical surface coordinates into metric `[x,z]` GPU targets and asynchronously computed using a single WebGPU research session. Only successful GPU outputs are seeded into model B's real `CurvaturePhysicalSceneOptics` field; unseeded targets, CPU interpolation and non-resolved GPU rays fall back to original CPU f64 solving. GPU status disagreement remains visible; there is no hidden CPU correction for `blocked` or `indeterminate`.
- Model B is repainted by **the same physical frame/painter** with those GPU-sourced samples; the CPU reference remains model A. The status and JSON report give GPU lookup counts, CPU fallback counts, setup/dispatch/readback and complete CPU discovery/assisted B frame timings. When Canvas readback is available, the report compares actual rendered pixels using a clearly labelled >8/255 channel difference threshold; this is not a one-pixel silhouette parity proof.
- The GPU B result is invalidated on scene/camera/atmosphere/target-count changes and does not persist as GPU calculations in the experiment URL; the URL saves only configuration. Unsupported atmosphere/WebGPU falls back to CPU. All operations are opt-in; Scene, Legacy and production paths remain CPU and previous Compare pairs remain intact.
- **Limits:** This is a **mixed GPU-seeded / CPU fallback optical field**, NOT an all-GPU ray field or GPU rasterizer. GPU discovery begins with a CPU reference frame, so end-to-end performance is not claimed to be faster than CPU rendering. GPU work remains bounded by the existing 1024-ray first-forward-x experimental solver.


## #140.12.11 — CPU f64 replay control for GPU-assisted Compare

- The experimental Compare action now captures **actual CPU f64 exact-solver outputs** while discovering the adaptive requests, not just target coordinates. It seeds the same bounded target selection through the same `OpticalSharedRayField.exact()` interception used by GPU, first rendering a **CPU replay B control frame**.
- The replay control is compared to CPU reference A via actual Canvas pixel readback (>8/255 per channel), and its render time, lookup/fallback counts, selected seed coverage and renderer counters are exported as `gpuAssistedFrame.cpuReplayControl`. After that, the original WebGPU solve is injected into a final GPU-assisted B frame; both pixel comparisons are against the same A reference.
- **Interpretation:** If CPU replay already changes pixels, the injection/cache/adaptive behavior is implicated independently of GPU f32. If replay matches A but GPU differs, inspect GPU status/ground boundaries. This is a controlled diagnostic, not a proof of full-frame parity or GPU-only speedup.
- The existing experiment URL, Scene, standard Compare, CPU production solver and all non-opt-in rendering paths are unchanged. Browser GPU/Canvas results are still required to establish actual parity.

- The control explicitly verifies **strict identical pixels** and matching outline/fill/unresolved counters in addition to >8/255 significant pixels. `identical` can be `true`, `false`, or `null` (unavailable readback). Missing CPU seeds invalidate a full replay-control equivalence claim. The report also includes both replay and GPU frame adaptive counts, with an unambiguous #140.12.11 top-level version even if an older standalone sample probe is included.

## #140.12.12 — GPU-first scene grid and end-to-end Compare performance gate

- **Separate experimental action** `Benchmark GPU-first full frame` in the existing Compare CPU/WebGPU mode. Existing sample, CPU replay control, Scene, Legacy and normal Compare paths are unchanged. The benchmark uses the A physical model (Globe or Flat, standard atmosphere) for both frames.
- A bounded **distance × height** grid is built directly from the independently authored current physical tower geometry (quantiles of tower distances plus ground-guide distance coverage; height axis from scene geometry). This step neither shoots any CPU rays nor discovers ray requests from a CPU reference image. The existing #140.12 WebGPU shader solves 128/256/512/1024 grid nodes in **one asynchronous GPU batch**, with the same explicit 1024-node maximum.
- The result is a deliberately **approximate optical lookup field**: interpolate the difference between GPU launch angle and analytic straight-line angle across neighboring grid points, and select the nearest available GPU visibility status for mixed-status cells. Failed GPU nodes are not secretly replaced with CPU shooting. The field serves both adaptive tower outlines/fills and ground-guide requests directly, bypassing the normal CPU-shooting prism field **only when the experimental `fullCoverageGrid` flag is present**. Mixed-status, extrapolated and indeterminate lookups, failed grid nodes, optical requests and CPU fallback count (zero for this path) are measured. This is not a certified interpolation scheme and is not production-authorized.
- **Actual end-to-end GPU time** starts before scene/grid preparation and ends after complete B frame paint: it includes geometry preparation, WebGPU device/pipelines, upload, dispatch, synchronization/readback, grid lookup and CPU painter. **Only after the GPU frame is complete** is a cold CPU reference A frame painted and independently timed. The CPU reference is NOT required as an input to the GPU pass. Both frames use the same existing physical scene renderer and per-frame overlays; WebGPU still computes the optical grid, not the 2D rasterization.
- JSON `curvature-compare-140.12.12-gpu-first-frame.json` reports `gpuFirstEndToEndMs`, `cpuColdReferenceMs`, `speedupCpuOverGpu`, `beatCpuColdReference`, `verdict`, grid geometry, failed GPU nodes, interpolation/coverage diagnostics, actual Canvas pixel differences and outline/fill/unresolved counts. `NO_END_TO_END_GPU_SPEEDUP` is explicit when the experiment loses the speed race. Faster without validated visuals is labelled `GPU_FIRST_FASTER_BUT_VISUAL_UNQUALIFIED`; **neither authorizes production**. There is no claim of 1px silhouette equivalence or measured browser performance before a real export.
- Node regression and real-scene smoke tests check grid construction, bounded GPU request acceptance, absence of CPU shooting in the new full-grid field path and controller sequencing. **Node cannot exercise browser WebGPU f32 compilation/execution**, so the user must run the new action and export JSON to decide whether the approach is actually faster and visually usable on their GPU.

## #140.12.13 — GPU predictor fast-path A/B at 50 m and 500 m

- **Opt-in research-only** `algorithm:'predictor'` added to the existing
  independent `CurvatureWebGPUBatchShooting1412.createSession`; all callers
  without this option retain the original two-pass 33-angle sweep/bracket
  implementation. The predictor is a distinct WebGPU compute pass, not a CPU
  estimate injected into the GPU workload. It tests a straight-ray starting
  angle and up to three guarded local secant corrections, independently
  re-integrates accepted target arrivals **with GPU ground-event sampling**,
  and stores results in the original response buffer. Failed/unverified
  candidates automatically pass to the **unchanged** two sweep/bracket stages.
  Sweep and refine shaders skip the targets accepted by the predictor.
- The twelfth mode of **existing** `tools/webgpu-optics.html` is
  `#140.12.13 — GPU predictor vs sweep (50/500 m)`, with Globe/Flat selection.
  It uses exactly **1024 distinct real polygon-edge targets** from the existing
  **12-tower fixture**, not replicated rays or invented raster pixels. For
  each of 50 m and 500 m, old GPU sweep and new GPU predictor run on exactly
  the same ordered targets. A separate CPU f64 reference with the CPU predictor
  enabled runs outside GPU timings; full GPU-angle CPU f64 replay and status,
  residual and ground-event comparisons are also outside GPU timings.
- `curvature-webgpu-optics-140.12.13-predictor-ab.json` includes CPU oracle
  wall time/solver counts; per-GPU mode session setup, first upload-to-readback
  and pipeline-reused warm times; direct predictor/sweep speedup; predictor
  accepted/fallback targets, GPU statuses, refinement iterations, physical
  parity failures and representative failing target indices. Readback-inclusive
  GPU times are not pure GPU timestamps or end-to-end rendering times.
- The only modified GPU pipeline is **explicitly requested** by the new
  diagnostic; original production CPU rendering and the #140.12.12 GPU-first
  Compare path are not silently changed. No automatic GPU production enablement,
  and no claim of actual WebGPU speedup or shader validation in a browser until
  a real export is provided. A faster batch with inaccurate f32 contact
  classification is not a qualifying result.

## #140.12.14 — fail-closed GPU predictor event guard with per-target f64 triage

- Adds a separate, explicit `algorithm:'predictor-guarded'` **research-only** mode.
  An arrival whose GPU ground-event classifier returns `indeterminate`
  (`contact=2`/status 3) is **not accepted** by the predictor, even when the
  shooting residual is within tolerance. It proceeds through the existing
  GPU sweep and bracket-refinement fallback. The original `sweep` and
  `predictor` shader variants, output contract and production CPU renderer
  remain untouched. A fallback result may itself remain `indeterminate`;
  there is no invented visibility or silent CPU correction.
- A thirteenth mode on the canonical `tools/webgpu-optics.html` page benchmarks
  **sweep / original predictor / guarded predictor** on the exact same 1024
  distinct 12-tower polygon-edge targets at RK4 steps 50 and 500 m, including
  independent CPU f64 predictor reference. The new JSON export is
  `curvature-webgpu-optics-140.12.14-event-guard.json`. Timings distinguish
  setup, first execution and pipeline-reused warm upload-to-readback times.
  Predictor success is counted only by the GPU telemetry sentinel (-2); all
  nonaccepted results count toward fallback, including failed fallback.
- The experiment records **all** status-disputed/unresolved targets, with
  target surface altitude, GPU/CPU ground evidence and independent CPU f64
  replay **at the GPU angle**, plus all event disagreement cases. It groups
  near-surface cases and replay ground detections to distinguish predictor
  acceptance problems from remaining f32 first-contact disagreement. These
  f64 checks are explicitly outside all GPU timings and do not serve as a
  hidden input to the GPU algorithm or timed batch.
- #140.12.13 reported 30 predictor-vs-CPU status mismatches at 500 m versus
  10 for the original sweep, even though 1024/1024 predictor paths were
  counted as accepted. The strict guard addresses **that acceptance bug**, not
  the remaining parity failures of the f32 sweep/event detector. Do not
  assume these mismatches are fixed until a browser WebGPU export confirms it.
- No production authorization, full-frame speedup or 1-pixel silhouette
  equivalence is implied by this change. Browser shader compilation/execution
  and speed/parity must be measured on actual WebGPU hardware.

## #140.12.15 — fast GPU predictor optical frame, cold/warm end-to-end gate

- Adds an **explicit opt-in Compare** button `Benchmark fast GPU predictor frame`,
  plus a separate grid-density selector (1024 / 2048 / 4096 default / 8192).
  The original GPU-first sweep control and 1024-target probe are retained.
- Builds the physical distance-height field directly from authored objects,
  **without CPU oracle-discovery frame or CPU shooting fallback**; denser scene
  grids are partitioned into deterministic <=1024 target batches using the
  original WebGPU session capacity. The `algorithm:'predictor'` WGSL path from
  #140.12.13 and RK4 step **500 m** are used only by the new action. No
  guarded ground-event fallback is enabled; uncertain near-ground visibility
  is intentionally retained for visual qualification at actual raster level.
- Two complete independent timings: **cold** = grid + GPU setup + all batches
  including readback + CPU Canvas B raster; **pipeline-warm** = new grid +
  repeated GPU batch inputs/readbacks on the SAME live session + cache-cleared
  full Canvas B raster. A separately forced-cold CPU A frame is measured
  afterwards, so GPU preparation never uses CPU frame discovery. Full-frame
  pixels, contour/fill/unresolved counts, mixed-status/extrapolated lookups,
  batch times, accepted/fallback counts and both speedups are exported in
  `curvature-compare-140.12.15-fast-predictor-frame.json`.
- The regular **synchronous** adaptive field cannot directly await GPU
  batches, so this is still an approximate scene-derived grid and **not a true
  CPU-guided adaptive GPU renderer**, GPU rasterizer, or production promotion.
  Larger grids may decrease visual error but are not guaranteed to do so.
  Browser GPU shader/actual frame speed/visible-image parity require a user
  export; Node and mocked grid samples cannot establish them.
- Existing CPU rendering and all older experiment algorithms are unchanged.

## #140.12.16 — equal-budget near-ground GPU field A/B in actual Compare frames

- Adds **Benchmark near-ground GPU A/B** next to #140.12.15, keeping
  the original fast predictor action untouched. Both variants have the
  same user-selected number (1024/2048/4096/8192) of GPU nodes, the same
  authored scene geometry, predictor shader, 500 m RK4 step and shared
  WebGPU pipeline. No CPU shooting or CPU reference drives field selection.
- The control is the original **uniform** 16-row vertical axis. The tested
  variant uses **distance-local near-ground** vertical coordinates: near
  observer columns place more nodes below the first few metres, smoothly
  reverting to the original axis by 6 km. Its field interpolates each
  distance column at its own height nodes before blending across distances;
  assuming one global height interval would be mathematically incorrect.
  The baseline field is not changed; the local variant is opt-in only.
- One click executes **uniform / local / uniform / local** complete GPU
  predictor fields and Canvas B frames, preserving both rendered bitmaps;
  separately forces cold CPU A **after all four GPU frames**. JSON records
  first and pipeline-reused full-frame timings by variant, GPU batches,
  acceptance/fallback, rendered contours/fills/unresolved, and actual pixel
  differences against CPU A across both the whole frame and a **fixed
  lower-left region** (left 55%, bottom 45%). The region is an approximate
  diagnostic that was subsequently identified as the **wrong side** of the
  user-observed near-tower base defect (the issue is lower-right), not
  segmentation of geometric surfaces and not an approval criterion.
- The report `curvature-compare-140.12.16-near-ground-ab.json` describes
  whether the selected region had fewer significant-pixel differences;
  it does not claim silhouette equivalence, a kernel-only benchmark,
  production approval, or a known speed win. Mock geometry/interpolation,
  batch ordering, cropped pixel comparison and UI integration are covered
  by tests; **actual WebGPU and frame pixels require a browser run**.

## #140.12.17 — lower-right equal-budget near-ground / vertical / near-distance GPU grid A/B/C

- Added a separate **Benchmark GPU grid A/B/C · lower-right** Compare action.
  It explicitly fixes all three variants at **4096 predictor rays** and the
  same 500 m RK4 step, independent of the older density selector. The old
  #140.12.16 A/B remains available unmodified; its historical lower-left ROI
  export is not retroactively relabeled as lower-right evidence.
- The baseline retains **256 distance × 16 near-ground height** nodes; the
  vertical candidate trades distance resolution for **128 × 32** nodes; the
  distance candidate retains **256 × 16** but redistributes distance columns
  to put roughly 45% at or below 6 km, following the original authored-scene
  distance distribution within both near and far segments. Near-ground height
  redistribution remains active in both new candidates; no CPU oracle pixels,
  ray solves or outside scene geometry guide the grids. The existing response
  order checks, per-column height interpolation and <=1024-ray batch capacity
  are unchanged.
- Performs **A/B/C/C/B/A** full WebGPU+Canvas B frames with a shared GPU
  predictor pipeline, capturing each full bitmap and actual renderer counts.
  The independent, forced-cold CPU f64 frame A is rendered only afterwards.
  Exports full-frame and **lower-right 45% × 45%** significant pixel counts,
  both run wall-clock timings and GPU lookup/uncertainty statistics per layout
  (including how many distance columns are <=6 km), and a machine-readable
  comparison versus the near-ground baseline. Restores the near-distance B
  image after measurement as an **untimed** UI redraw, not as an oracle-selected
  winner. The ROI is user-observed approximate coordinates, not a segmented
  ground silhouette. One warm frame per candidate is not statistical proof of
  timing superiority; visual comparison is not automatically approved.
- Export: `curvature-compare-140.12.17-grid-abc-lower-right.json`. The
  browser scripts have a new cache-busting query so stale Compare UI/code
  does not hide the action. The production CPU solver, nonexperimental Scene,
  earlier GPU experiments and visibility acceptance rules are unchanged.
  Browser WebGPU timings and actual pixel results are still **unmeasured**
  until the user runs the new button on GPU hardware.

## #140.12.18 — GPU query-selected sparse refinement versus a 4608-ray dense control

- Added **Benchmark adaptive GPU vs dense · 4608 rays** to Compare's optional
  CPU/WebGPU controls. The baseline is the #140.12.17 near-distance 256×16
  grid (4096 scene-derived predictor targets, RK4 step 500 m). Its actual
  physical **GPU B renderer** is painted first, with opt-in collection of
  problematic distance/height requests: mixed GPU status, indeterminate GPU
  status, out-of-grid extrapolation, or abrupt angle-correction variation.
  The risk ranking uses only the B renderer's GPU-field lookup context; CPU
  reference rays, pixels and CPU shooting do **not** select refinement rays.
  Candidates are de-duplicated and spread across grid cells; at most 512 are
  submitted in a second asynchronous WebGPU predictor request. Valid answers
  replace only the exact same (distance, height) lookup on a second B paint,
  never the neighboring interpolation; failed GPU nodes retain the base grid.
- A separately constructed **4608-node near-distance** 288×16 grid uses the
  same scene, GPU predictor and RK4 step, but distributes its additional 512
  rays uniformly according to the distance-focused scene quantile algorithm.
  Both variants share a single created WebGPU pipeline. If fewer than 512
  risky, distinct candidates are available, the exported report explicitly
  marks `sameRayBudget:false` and gives actual counts: no phantom rays.
- **Adaptive timing explicitly includes** first 4096-ray GPU discovery,
  its full Canvas B paint, the sparse GPU batch, and the final Canvas B paint.
  The 4608-ray dense candidate's whole field and frame are timed separately.
  GPU setup cost is separate. This design is conservative about adaptive
  overhead and is NOT a claim of algorithmic or end-to-end speedup.
- A forced-cold independent CPU f64 frame A is painted **after** GPU variants.
  The report includes whole-frame and correct lower-right 45%×45% significant
  pixel differences, status/fill/contour counts, per-variant frame timings,
  and 16×12 per-tile spatial heatmaps using the same >8/255 channel difference
  criterion. Two visible heatmaps (adaptive/dense) share a color intensity
  scale, with the lower-right ROI outlined. The maps visualize evidence and
  are **never used** to select extra GPU targets. All GPU experiments remain
  opt-in, CPU production renderer and earlier Compare controls unchanged.
- Export: `curvature-compare-140.12.18-adaptive-vs-dense.json`. The result
  is a measured experiment requiring browser WebGPU to assess improvements;
  no visual parity, performance win or production authorization is presumed.


## #140.12.19 — controlled near-tower analytic geometric projection versus GPU refraction

- Adds a **Compare near-tower geometry vs GPU · 1.5/3/6 km** button to the
  optional Compare CPU/WebGPU diagnostics. The scene's authored objects,
  model, camera, ground guides, fills and outlines are all rendered by the
  same physical scene adapter and Canvas painter. The 4096-ray near-distance
  GPU predictor baseline (500 m RK4 step) is computed **once**; the three
  other physical B frames reuse this same GPU field rather than changing ray
  count or cold/warm GPU pipelines.
- Geometric variants replace only distance/height target requests at or
  inside **1500 m**, **3000 m** or **6000 m** with the **existing production
  analytic vacuumSample**. It uses the real spherical-surface point and
  geometric Earth horizon / visibility (or exact flat branch), not a local
  planar or always-visible shortcut. Far targets keep the unchanged refracted
  GPU field. The distance split is deliberately hard to reveal if a boundary
  itself introduces artifacts; no smooth blending or production promotion is
  implied. Nearby *ground-guide queries* are included in the geometric branch
  as a documented limitation of this full-frame control.
- A paired audit records unique near-field renderer requests, numbers of
  ground/above-ground requests, status disagreements, invalid GPU angles,
  mean/max absolute GPU-versus-geometric angle difference in arcseconds;
  `nearGeometricField` serves analytic values while sampling the original GPU
  field for the comparison. No CPU tracer/shooting is called in the GPU branch.
- Takes the four B canvas snapshots first and then renders forced-cold
  independent CPU f64 A **afterwards**. Reports full-frame and correct lower-
  right ROI (>8/255 significant-pixel) differences from CPU, differences versus
  GPU-only baseline, current renderer contour/fill/unresolved counts, and
  separate shared GPU grid time and each Canvas paint time. No artificial
  per-variant GPU compute time is claimed: all variants reuse the GPU grid.
  Displays the predetermined 3 km geometric variant after the experiment,
  without selecting the best variant based on CPU data.
- Export: `curvature-compare-140.12.19-near-geometric-projection.json`.
  This tests the hypothesis that near-field discrepancies originate mostly
  from optical approximation rather than physical geometry projection. It
  cannot yet isolate shape topology or certify visual equivalence; actual
  WebGPU/Canvas measurements must be run in the browser.

## #140.12.20 — CPU f64 versus GPU field and direct GPU visibility at actual renderer targets

- Adds an **Audit lower-tower visibility · CPU vs GPU** button to the opt-in
  Compare CPU/WebGPU diagnostics. It renders the existing 4096-ray
  distance-focused GPU predictor frame (RK4 500 m) through the *unchanged*
  physical scene adapter and Canvas renderer. The only instrumentation is a
  transparent field wrapper that records the renderer's actual `(distance,
  height)` `sample`/`exact` calls, their returned interpolated status and
  angle. The wrapper never changes an optical answer.
- Captures unique targets in the **0–6 km, 0–20 m** envelope and selects up to
  **128** targets in distance-stratified bins. At most one eighth of the batch
  can be zero-height requests, because those may be ground-guide samples.
  Above-ground requests are *low-height queries*, not certified vertex or
  tower-primitive identities; no source-primitive attribution is claimed.
  Target selection is based exclusively on the actual B renderer queries;
  neither CPU f64 samples nor CPU image pixels guide selection.
- Sends the exact same selected spherical-surface coordinates to one direct
  WebGPU predictor batch and the existing `CurvatureOpticalBatchContract1411`
  CPU f64 batch solver. CPU uses the physical frame's automatically selected
  standard-atmosphere RK4 step (typically 2000 m) and a tighter 1e-6 m
  target tolerance; direct GPU uses RK4 500 m and 0.005 m tolerance. These
  unequal numerical controls are **explicitly reported**. CPU is an oracle
  only for this bounded diagnostic, never a GPU fallback or repaint source.
- Reports three-way status confusion and angle differences, counts of
  CPU-visible targets rejected by the interpolated/direct GPU paths,
  recovered-versus-new direct-GPU mismatches, per-distance-band counts,
  status categories, and first-ground-contact evidence for each target.
  Ground contact on diagnostic samples does not by itself prove which
  geometry primitive was omitted from the painted frame. Also includes the
  original GPU B physical-frame contours/fills/unresolved counts, full-frame
  and **lower-right** pixel difference vs cold independent CPU A, plus
  separately measured GPU grid, direct GPU target, CPU target and CPU frame
  timings. The B frame is not modified by the audit.
- Export:
  `curvature-compare-140.12.20-renderer-visibility.json`.
  The result distinguishes a likely interpolation/status decision problem
  from disagreement in direct GPU ray shooting. It does **not** certify
  silhouette equivalence, production performance, or a GPU-first release.

## #140.12.21 — GPU-only visibility status and fine-step contact-qualification controls

- Adds a Compare-only **Compare GPU status qualification · lower towers**
  diagnostic with two independent checkboxes: **Direct GPU status-only** and
  **50 m GPU contact qualification**. CPU f64 remains the unchanged reference
  frame and is calculated *after* all GPU variants.
- The initial GPU B frame uses the existing near-distance **4096-ray** grid,
  predictor RK4 **500 m**; it transparently captures actual renderer optical
  queries in the **0–6 km, 0–20 m** envelope. A deterministic, distance-
  stratified selector chooses up to **128 queries actually classified
  `indeterminate` by the grid**, never CPU-discovered pixels or CPU ray
  statuses. Original 4096-ray scene and B renderer are otherwise untouched.
- Direct GPU shooting at **500 m** can replace a grid query's *status only*
  when its own answer is `visible` or `blocked`. Already `visible` or `blocked`
  grid decisions are never changed; the grid **angle is never overwritten**.
  Unresolved direct results never imply visibility. The second independent
  control re-shoots **only still-indeterminate direct targets** with a **50 m**
  GPU RK4 step and optionally uses a certified `visible`/`blocked` result.
  A `solver_failed` or `indeterminate` fine result leaves the target
  unchanged. No heuristic contact override, assumed endpoint visibility,
  or CPU fallback is allowed.
- When both controls are enabled, the diagnostic paints base / direct-only /
  fine-only / combined frames. Each variant reports renderer counts, actual
  unique status upgrades, full-frame and **lower-right** significant pixels
  against a cold CPU f64 reference, and changed pixels versus the original
  GPU frame. The JSON also includes direct versus fine-step statuses,
  crossing/grazing contact counts, extra GPU target counts, and separate
  timings for initial grid, first discovery paint, 500 m direct batch,
  optional 50 m contact batch, subsequent paint(s), and CPU reference.
  An independent CPU f64 target audit runs only after every GPU B variant
  is finished and records per-target status and pre-endpoint contact distance
  for both 500 m and 50 m GPU calculations. No CPU result feeds back into B.
  This is deliberately **not** an optimized single-pass implementation:
  discovering the renderer's queries still requires the initial paint.
- Export: `curvature-compare-140.12.21-gpu-status-qualification.json`.
  The experiment determines whether GPU status-only correction or sensitivity
  of first-contact detection to RK4 step changes the missing tower-base
  geometry. Pixel equivalence, production approval and speedup are not claimed.


## #140.12.27 · Bouguer spherical-invariant contact audit (diagnostic only)

- The Globe/standard profile is radially stratified: `n(h)=1+0.000293*exp(-h/7350)` by default. For a straight surface-normal coordinate `r=R+h`, `b=n(r) r cos(alpha)` is conserved in exact geometrical optics. This does not hold for Flat geometry with its own vertical stratification or arbitrary horizontally varying profiles.
- The new **Audit Bouguer invariant · analytic ground angle** Compare button runs GPU-first 48-target shooting, a **separate 256-node f32 invariant quadrature**, and independent GPU fixed-angle RK4 ground evidence. Only *after* all GPU work it computes the CPU f64 shooting oracle, 2048-node radial invariant quadrature, and CPU f64 same-angle RK4 replay.
- With `F(r)=n(r)r` strictly increasing over the observer-to-ground altitude interval and an inward launch angle, `log(b/F(R)) > 0` implies an above-ground turning radius. Otherwise the first-ground polar angle is an integral over altitude; `h=h0*u^2` regularizes near-tangent integrability. The ground-event decision compares this angle against the **geometric target polar angle**, not an RK4 endpoint path length. An initially outward ray cannot strike the surface on this monotone radial branch. The module rejects unsupported profiles, Flat geometry, and nonmonotone `F`.
- f32 uses dimensionless `h/R` and stabilized `log1p`/`expm1` polynomials to avoid subtracting kilometre-scale radii; f64 uses native `Math.log1p`/`Math.expm1`. The two quadrature resolutions and margins are exposed in exported JSON to assess numerical truncation. Neither is certified/interval arithmetic, especially near tangency.
- No CPU angle is fed to GPU, no CPU fallback, no production authorization, and **no change to scene painting or ray classifications**. A near-endpoint ground crossing for a ray *not exactly aimed at the target* is not a proof that the target is occluded.
- Export: `curvature-compare-140.12.27-bouguer-invariant.json`. Runtime shader compilation still requires a browser WebGPU pass.


## #140.12.28 · Isolated GPU arithmetic precision foundation (diagnostic only)

- The new **Audit GPU arithmetic · f32 / double-single / integer residuals** Compare button compiles three **separate WebGPU compute pipelines** on the actual adapter. It requires no optical scene assumptions and works while the UI is in the CPU/GPU Compare experiment. Its fixed vector set includes global Earth radii, 1 cm and 1 µm local deltas, 1-ULP and half-ULP cases, negative cancellation, refractivity-scale differences, ratios, multiplication, division, and square root.
- Input JS `Number` values are split into `f32` hi/lo on the CPU and transported without throwing the low limb away. The GPU evaluates **native f32**, **classic double-single**, and **integer-residual double-single** separately; JS f64 references are calculated only for the exported report and are never used to substitute GPU results.
- Classic DS uses floating-point `TwoSum` and Dekker `TwoProd` and **cannot be considered portable** under WGSL reassociation/fusion. The integer-residual path reconstructs the high-high addition/product rounding residues with two-word `u32` arithmetic, including 24-bit significand multiplication, then applies DS cross terms/correction. It is **not a complete integer-controlled IEEE binary64 implementation**: low-limb/cross-term expressions still use native f32, and the bounded transform only targets finite normal f32 intermediates; subnormals, overflow, extraordinary exponents, and full binary64 rounding are unsupported. This version is a comparative experiment, not a certified arithmetic library.
- Correctness uses a one-operation dispatch and readback. Performance performs one untimed warm pass followed by five timed **128-iteration** passes for each separate pipeline. Measurements are wall-clock dispatch+map readback (not GPU timestamp-query kernel time), not production rendering throughput; no optics are integrated.
- Report: `curvature-compare-140.12.28-gpu-arithmetic.json`, with per-vector input, f64 oracle, split result, absolute/relative errors and per-mode warm median timings. GPU adapter compilation must still be tested in a real WebGPU browser; Node mocks alone do not establish shader validity or numerical fidelity.
- No changes to CPU shooting, GPU shooting, Bouguer integrals, Flat/Globe physics, visibility classifications, or renderer painting. This experimental tool does not authorize production use.


## #140.12.31.3 · WGSL compilation cost isolation / fast audit (diagnostic only)

- On the user's 48-ray #140.12.31 report, the combined two-shader setup took **55,393.4 ms** out of **57,903.3 ms** end to end. It had not separated `getCompilationInfo` from `createComputePipelineAsync` or measured the two shaders individually. It is not evidence of which shader/compiler phase caused the delay.
- The two arithmetic variants produced identical 48-ray contact classifications and measured numerical errors on that device. Integer-residual dispatch/readback was substantially more expensive in the measured run. **Default** #140.12.31 now compiles/runs **classic DS only** (128/256/512 nodes), and the **Include slow integer-residual DS** checkbox explicitly enables the original full six-variant comparison. Reports list only modes actually executed and include `integerResidualEvaluated`. No skipped mode is implicitly certified.
- Each DS WGSL program now imports unchanged, required arithmetic functions from the single #140.12.28 helper source and renames the selected `TwoSum`/`TwoProd` implementation to the shared interface. Unused integer/float-only/benchmark helpers and the constant `MODE` dispatch are omitted from the generated source; the actual invariant/atmosphere/integrand/quadrature formulas and input/low-limb layout are unchanged. This source-level specialization is **not** proof of improved real browser compilation, WGSL conformance, or numerical identity across every GPU/optimizer.
- In quick mode `createComputePipelineAsync` validates WGSL directly, skipping a potentially redundant eager `getCompilationInfo`; if the pipeline fails, compilation diagnostics are fetched to obtain the WGSL error. Full mode retains eager diagnostics for both shaders so validation and pipeline costs can be compared. Individual shader timings capture `createShaderModule`, optional `getCompilationInfo`, and `createComputePipelineAsync` in `compilationTimings` along with the original `phaseTimings` and `totalElapsedMs`. The UI shows elapsed waiting time during asynchronous pipeline preparation and exports failed-stage timing with error JSON. These are host wall-clock durations, not pure GPU kernel measurements.
- Same 48 independently predicted GPU angles, same f32 quadrature control and same CPU f64/reference ordering. No change to production rendering, shooting, contact classification or scene painting. Repeat both quick and full audits on the user's real WebGPU device before claiming compiler speedup or portable DS equivalence.

## #140.12.32 · GPU-owned high-precision radial shooting audit (diagnostic only)

- **Audit GPU DS shooting · Bouguer 256 / 512 nodes** in the existing `CurvatureModern.html` Compare CPU/WebGPU panel. One 48-ray f32 GPU predictor batch supplies seed angles only; the *new* GPU shader runs its own classic double-single secant iterations, independent at 256 and 512 quadrature nodes. The target-polar residual is evaluated with radial Bouguer integration from observer height to the exact target height, using **two-limb angle, target height, distance and radius**. The same final GPU angle limbs are used to compute a separate DS ground-contact margin; high/low parts survive readback. No CPU-picked angles, scalar root corrections, or CPU fallback feed the GPU shader. One specialized WGSL pipeline is compiled and reused with node count in the configuration buffer.
- **Limited branch**: Globe + vacuum/standard monotone radial atmosphere, observer height <=200 m, target 0..min(200 m, 0.02×scale height), target height different from observer, *single monotone radial leg to target*. The default 15 m / 48-ray precision ladder is supported. Turning paths, non-monotone ducts, large angles, and all geometry outside the polynomial domain fail closed; this audit does not establish a general ray solver or certified visibility.
- CPU **f64 2048-node radial shooting roots**, f64 same-angle polar residuals, CPU f64 Bouguer ground margins and independent CPU f64 RK4 shooting are computed **after both GPU passes**. The report includes convergence/unresolved counts, GPU-to-CPU root angle deltas, initial predictor corrections, same-angle CPU residuals, ground discrepancies beyond 1 cm, and explicit 1 cm **uncertain** contact margins. A tiny signed ground margin (particularly at surface targets) is **not** proof of crossing or visibility. Compare for scientific diagnostics only, never production classification.
- Performance: one specialized classic DS WGSL pipeline, 256+512 dispatch/readbacks, per-phase timings with elapsed state in UI, automatic success/error JSON (`curvature-compare-140.12.32-gpu-ds-shooting.json`), manual Export JSON retry. The GPU execution and shader validity require running in a working WebGPU browser; Node tests with mocks and f64 references are not substitutes for an actual GPU result. Previous audits, canonical `tools/webgpu-optics.html`, production optics, scene rendering and shooting remain untouched.


### #140.12.34 — Real full-frame CPU/GPU predictor pixel parity (research only)

- The Compare-only button **Audit full-frame CPU/GPU pixel parity · 4 camera views** computes an independent 4096-sample scene-derived WebGPU **f32 RK4 predictor** grid (step 500 m); it does **not** use the 48-ray classic DS shooting module from #140.12.32/33. The existing experimental grid-to-physical-painter bridge paints B on the real Canvas, without CPU shooting fallback. The CPU f64 scene A is rendered separately. No production optics/backend is changed.
- Run four true camera redraws (upward tilt, downward tilt, 1.5× focal length, actual current camera); B is cloned from A for the same Globe/standard atmosphere, optical geometry, objects and framing. Reuse a single independent GPU field across cameras, never use A pixels or CPU shoots for GPU sample discovery. Temporarily suppress horizon/eye-level guides; require both turbulence overlays off and Canvas 2D; reset every temporary state even on errors. CPU A is cold-redrawn twice per case and any repeat differences >8 channels abort the audit.
- Pixel measures are actual two-Canvas backing-store RGBA comparisons: changed pixels, >8/255 white-composited significant pixels, MAE, maximum channel delta, painted-vs-white coverage mismatches, lower-right 45% ROI, per-row/per-column/tiled breakdowns and a ±15% height *zero-elevation* band with matched strong vertical-luminance transitions. This band is **not** an identified physical horizon, and painted-vs-background is **not** a semantic sky/ground mask. Static significant-pixel difference heatmap and JSON `curvature-compare-140.12.34-full-frame-pixel-parity.json` are exported.
- The JSON explicitly sets `gpuDoubleSingleShootingUsed: false`, `dsFullFrameParityEstablished: false`, `productionAuthorized: false`. This frame comparison qualifies the existing GPU predictor interpolated path only, separating visual rendering errors from #140.12.33's isolated 48 DS rays; DS integration into the actual full-frame renderer requires a later change.
- All GPU samples use WebGPU; Canvas 2D still rasterizes. Actual browser GPU execution and real viewport equality require user-side browser run; Node tests are not substitutes for WGSL compilation or visual qualification.
- Project rule unchanged: reuse the sole canonical `tools/webgpu-optics.html` experiment page. Never create a version-numbered tools/ HTML file.

### #140.12.37.2 — Geometry audit script-cache and error propagation fix

- Fixed a mixed-version browser load: #140.12.37 and .37.1 changed optical geometry collectors, unresolved-leaf hooks and Canvas capture code without updating the Modern HTML asset URLs for all four providers. The browser could load a new `ModernApp.js` with old optics/renderer scripts, causing `Optical geometry/camera was not captured` at the first `tilt-up / baseline` paint.
- All hook-bearing modules (`OpticalTowerSilhouette`, `CurvaturePhysicalPolygonFills`, `CurvaturePhysicalSceneOptics`, `CurvatureMainCanvasRenderer`) now have `?v=140.12.37.2` cache keys, matching the Modern diagnostic/app revision. The audit checks exported hook revisions before GPU computation to fail early on mixed caches. Actual paint errors are rethrown during explicit attribution and no longer disguised as a missing-geometry error; the collector reports which camera/scene inputs are missing.
- No shader, ray solver, triangulation or production draw behavior changed. Re-run the real WebGPU browser audit with a hard refresh to verify end-to-end export.

## #140.12.38 — Camera-first CPU f64 ground-contact oracle (diagnostic only)

- Added `src/diagnostics/CurvatureCameraFirstOracle141238.js`: an independent **forward** first-Earth-contact query for 64×64 actual Compare A camera directions, spherical-symmetry meridian reduction, vacuum independent analytic sphere intersections, standard-atmosphere RK4 with bounded 30 km range, and 41 same-angle horizon convergence rays (250 m/100 m). Uses shared physical ray ODE/RK4 but **not** target shooting, GPU grid, interpolated statuses, physical-scene polygons, or z-buffer.
- Added opt-in `ModernCameraFirstOracleRun` alongside existing Modern Compare diagnostics; exports `curvature-compare-140.12.38-camera-first-cpu-oracle.zip` with complete sample JSON, 5 PNG visual diagnostics and README. No WebGPU requirement. Never modifies Compare A/B models or production rendering.
- Added `tests/CameraFirstOracle141238.test.js` and `docs/camera-first-cpu-oracle.md`. Vacuum f64 output is checked against analytic line/sphere hit classification and near-side contact distance; the atmosphere is sampled at the exact same launch directions with different RK4 steps.
- This is **not** a full 3D image (objects/towers are not intersected) or a proof of infinite-sky visibility. `range` means no first ground contact **within 30 km**. Do not interpret the result as pixel-perfect equivalence with the existing CPU scene renderer. Original GPU/WebGPU and canonical `tools/webgpu-optics.html` remain unchanged; never create per-experiment HTML pages.

## #140.12.39 — Camera-first CPU world-object intersection audit (diagnostic only)

- Added independent forward CPU f64 *rendering architecture* diagnostic against authored metric 3D object faces: actual Compare A physical camera rays; real-world triangles; first intersected opaque object or Earth by ray path distance; 64×64 full frame plus focused 64×64 around a projected scene object. Atmospheric integrator and tracer remain shared with #140.12.38, so this does **not** independently validate RK4 itself.
- Important scene fact: most existing towers are **outline-only**; first-hit against physically authored opaque fills cannot reproduce their Canvas strokes. Export separate **nonphysical outline-as-opaque proxy** maps and never treat those as certified visibility. Report triangulation failures and real object provenance (`sourceIndex`).
- Fixed 100 m ray chord sampling, 30 km limit; bounded 50 m convergence replay on up to 128 object/proxy-hit pixels and neighbours. No claim of certified grazing or subpixel intersections, geometric thickness for lines, or full 3D coloured image equivalence.
- Modern Compare adds opt-in `ModernCameraFirstObjectsRun`, exports `curvature-compare-140.12.39-camera-first-objects.zip` with full JSON, first-hit masks, focused ROI and a separately labelled direct sample of the **existing** Compare A CPU Canvas. No WebGPU / WGSL, no production painter or existing solver changes; original #140.12.38 audit remains available. Canonical `tools/webgpu-optics.html` unchanged.
- Details: `docs/camera-first-object-intersections.md` and `tests/CameraFirstObjects141239.test.js`.

## #140.12.42 — CPU f64 Flat/Globe quadrature shooting feasibility (diagnostic only)

- Added `src/diagnostics/CurvatureCpuQuadratureFeasibility141242.js`, using **native JS f64** and conserved momentum `p=n(h)cos(alpha)` for Flat or `b=n(h)(R+h)cos(alpha)` for Globe with vertical/radial vacuum and exponential-standard atmosphere. On single **monotone-height** paths, compute horizontal distance (Flat) or polar angle (Globe) with cached Gauss–Legendre nodes and a square-endpoint substitution, then solve the one-dimensional angle bracket. The numerical quadrature/root is not a certified visibility solver. Equal-height, returning, turning, ducting, unsupported profile or unbracketed paths explicitly return `unsupported`.
- New opt-in Modern Compare button **Benchmark CPU f64 · RK4 vs Flat/Globe quadrature + hybrid · ZIP**. Sample the same 48 authored metric object edges as #140.12.40; for Flat convert the same object-point horizontal distance and physical altitude into the Flat geometry. It compares four CPU modes separately: unchanged RK4 reference, existing predictor-only RK4, quadrature-only angle, and quadrature-seeded original RK4. The hybrid passes the candidate as `shootingWarmStartAngle`; the **unchanged RK4** still performs residual testing, full forward shooting fallback and ground-contact verification. Numerical angle comparison and status/ground parity refer to this RK4-verified hybrid, not to quadrature-only independent ground verification.
- Five timed rounds after one warm-up; reports contain per-target counts, candidate support, RK4 warm-start acceptance/fallback, status and ground mismatch, warmed median timings (including quadrature overhead), `flat-targets.csv`, `globe-targets.csv`, separately audited ground/equal-height stress CSVs, `performance.svg`, README and `results.json` in an automatically downloaded ZIP. Predictor-only RK4 is a critical control to avoid crediting existing predictor improvements to the new integral.
- **No WebGPU, no shader changes, no painter or production optical changes.** Results cannot certify branch completeness, tangencies, multipath or frame parity. Do not promote the candidate to production based on this experiment alone. Reuse canonical `tools/webgpu-optics.html`; no versioned tools HTML pages.

## #140.12.43 — Globe conformal and effective-radius CPU f64 experiment (diagnostic only)

- Added `src/diagnostics/CurvatureCpuConformalGlobe141243.js` and the opt-in Modern Compare button **Benchmark Globe CPU f64 · effective radius vs conformal predictor · ZIP**. Reuse the same 48 authored physical Globe targets from #140.12.42 and compare **existing RK4+predictor**, **surface-matched inverse-exponential angle + unchanged strict RK4**, and **exact-conformal-medium 2-step RK4/2-Newton angle + unchanged strict RK4**. Report full predictor+RK4 time, acceptance, fallback and status/ground parity, with 5 warmed rounds.
- Conformal variables `x=Rφ`, `u=R ln(r/R)` give an exact flat optical medium `m(u)=(r/R)n_s(r)` for a spherically stratified atmosphere, but the two-step numerical predictor and the single inverse-exponential replacement are approximations. Match near-surface `d ln(m)/du` to obtain `1/R_eff=1/R-N/(H(1+N))`, report analytical angle errors against original RK4 and classical `4R/3` separately. **Neither predictor decides visibility, ground contact or multipath; original RK4 remains sole authority.**
- The downloaded `curvature-compare-140.12.43-cpu-f64-conformal-globe.zip` includes `results.json`, authored/stress/extended-distance CSVs, median-time SVG and README. Eight ground/equal-height stress cases and 40 long-range/altitude envelope cases are **not** mixed into the primary performance sample. The test does not represent a full frame.
- No changes to production shooting, painter, WebGPU/WGSL, or canonical `tools/webgpu-optics.html`. See `docs/cpu-f64-conformal-globe.md` and `tests/CpuConformalGlobe141243.test.js`.

## #140.12.44 — Adaptive conformal Globe CPU f64 shooting (diagnostic only)

- Added `src/diagnostics/CurvatureCpuAdaptiveConformal141244.js`. Reuses the existing exact-conformal, standard-atmosphere coarse shooting from #140.12.43; compares baseline RK4+predictor, fixed 2-step conformal, adaptive RK4 2/4/8/16-step shooting, and adaptive with **local Richardson angular extrapolation**. Adaptation uses observed step-doubling angular differences scaled to projected height, not a claim of physical contact or branch completeness. Short paths retain the two-step fast path; near-surface paths use a stricter numerical estimator.
- Every candidate is fed only into **unchanged** `OpticalTargetProjection.solve` as a warm-start angle. That solver still decides whether a candidate meets the original endpoint/ground tolerance and executes its usual RK4 fallback and first-contact verification. No approximate predictor is permitted to decide visibility or ground contact.
- The new Modern Compare button `ModernCpuAdaptiveConformalRun` exports `curvature-compare-140.12.44-cpu-f64-adaptive-conformal.zip`: five warmed rounds on **48 real physical Compare A object-edge targets**, plus eight independently reported surface/equal-height stress cases and two 20-target altitude/distance envelopes (eyes at 15 and 100 m, three rounds each). ZIP includes JSON, CSVs, SVG median-time plot and README; raw per-target acceptance, fallback, number of RK4 calls, prediction effort and parity are exposed.
- This is diagnostic only. No new versioned HTML under `tools/`, no GPU/WGSL changes, no production renderer/shooting changes. No claim of full frame/pixel parity or correctness for all multipath branches. See `tests/CpuAdaptiveConformal141244.test.js` and `docs/cpu-f64-adaptive-conformal.md`.


## #140.12.46 · Conformal Globe CPU f64 performance profiling (experimental)

- `src/optics/OpticalConformalPredictor.js` now keeps the original array-based
  RK4 predictor as the `reference` numerical oracle and exposes two independent
  opt-in variants: `gradient` uses a single stable `expm1` result to recover
  both transformed height and radial scale, while `fast` also removes array
  mapping and temporary RK4 state allocations. Both still use the same fourth-
  order RK4 equations, Newton corrections, adaptation and Richardson angle
  refinement. They supply **untrusted candidate angles only** to the original
  `OpticalTargetProjection.solve()`; all first-ground-contact and visibility
  classifications remain solely with the strict physical RK4 solver.
- Explicit `shootingOptimization` values in `OpticalSharedRayField`: `conformal-reference`
  (former implementation), `conformal-gradient`, and `conformal-experimental`
  (optimized scalar variant). All are disabled by default and are limited to
  spherical geometry with standard exponential atmosphere. All previous
  production/Compare paths stay unchanged when the toggle is off.
- Modern Compare button **Profile conformal RK4** performs one JIT warm-up
  and eight order-rotated timed *cold optical field* physical Canvas renders
  each for the ordinary predictor, reference conformal, gradient-only, and
  optimized scalar. It exports actual PNGs, strict pixel comparisons, contour/
  fill counters, per-round timings and RK4 work in a ZIP. A separate per-stage
  profiler samples up to 256 actual baseline exact-ray requests and times
  gradient evaluations, two-step coarse RK4 and full adaptive candidates. No
  repeated ray-field cache is included in the measured full frame.
- This is a diagnostic experiment, NOT authorization to enable conformal
  shooting by default. Microprofile speedups are not end-to-end gains. Strict
  last-frame parity is scene-specific, not proof of all ground/multipath cases.
- Do not create version-numbered HTML pages for further experiments; reuse
  canonical `tools/webgpu-optics.html` and the existing Modern Compare page.
  Validate WGSL compilation (not just JavaScript syntax) for any shader edits,
  or explicitly state when actual GPU shader compilation was not performed.

### #140.12.48 — production RK4 trace optimisation experiment (2026-11-03)

Three explicit **standard-atmosphere-only** experiments (`traceOptimization: 'fused-gradient'` and `'fused-preflight'`) was added to `OpticalRayTracer` / `OpticalTargetProjection` / `OpticalSharedRayField` without changing the default shooting/ground detector. The first reuses one standard exponential while preserving arithmetic; the second additionally proves some above-ground RK4 segments clear using a conservative curvature and altitude-slope bound before falling back to the existing chord/event check; the third runs scalar RK4 staging to reduce temporary array allocation. Per-frame `preflightGroundSteps` instrumentation and an order-rotating 8-frame Modern Compare PNG+JSON ZIP audit were added. Details and limitations: `docs/cpu-trace-optimization.md`. The experiment is not production-promoted; review strict browser pixel parity and median full-frame duration first.

### #140.12.49 — Fused-gradient standard RK4 production gate (diagnostic only)

- Built-in standard-atmosphere `fused-gradient` is a candidate from #140.12.48, **not** yet enabled by default. Preserve original RK4 and all custom/engineered atmosphere paths.
- Modern Compare includes **Gate fused gradient · 4 Globe scenes × baseline/fused · 4 hot frames · PNG + JSON ZIP**. Four independent Canvas scene configurations cover authored view, low eye/near foundations, horizon-distance foundations, and long-distance high-eye foundations. Each uses separate optical sessions, AB/BA order, full-image strict RGBA parity, structural counters, and actual PNGs.
- Tests: `node --test tests/OpticalFusedProductionGate141249.test.js`; local CPU benchmark: `node tools/benchmark-fused-multiscene-140-12-49.js --rounds=4`. See `docs/fused-gradient-production-gate.md` for scope, acceptance criteria, and untested multipath/viewport limits. No new HTML page or automatic production promotion.

### #140.12.50 — Built-in standard fused-gradient promotion with explicit legacy rollback (2026-11-03)

- The physical shared-ray field and prepared point-to-point shooting now select the previously audited `fused-gradient` RK4 derivative **by default for the built-in `standard` exponential atmosphere**. `traceOptimization: 'legacy'` explicitly restores the old two-evaluation `n(h)`/`dn(h)` derivative and original RK4 step; the previous `fused-preflight` and `scalar-rk4` remain opt-in experiments. The original raw ray tracer's `atmosphere('standard')` function pair remains available unchanged as a diagnostic oracle.
- Any externally provided `profile`, including `custom`, and all other atmospheres remain on their former paths; no implicit optimizations are injected there. Internal experimental flags are overridden by an explicit `legacy` request. Unknown standard trace modes fail clearly.
- The #140.12.48 and #140.12.49 Modern Compare baselines are now **explicitly `legacy`** to avoid accidentally benchmarking fused vs fused after the promotion. Each frame still uses isolated optical sessions, rotated A/B timing and strict RGBA comparisons.
- No shader, GPU, conformance/ground-event, painting or conformal shooting changes. See `docs/fused-gradient-production-promotion.md` and `tests/OpticalFusedProductionPromotion141250.test.js`. The four browser gate scenes were pixel-identical and 10–19% faster in the user-supplied #140.12.49 report, but other profiles, viewports and multipath branches have not been certified by those scenes.

### #140.12.94 — Temperature gradient in Modern Physical

Added independent dry-hydrostatic `temperature-lapse` atmosphere, with surface temperature, pressure and local gradient parameters in Scene and Compare A/B. The existing Legacy coefficient model and fixed Modern Standard exponential are unchanged. The Physical RK4 tower, ground guide and horizon solvers use the same temperature profile; cache keys include profile inputs. Optional 0–2 km temperature column is a **DOM overlay**, not ray or pixel modification. Temperature settings and column visibility round-trip in Modern experiment links and JSON, old links migrate by safe defaults. Model is an *idealized exponentially relaxing boundary-layer lapse*, not constant `dT/dh` at all heights, not measured meteorology or humidity. See `docs/temperature-gradient-modern.md` and `tests/ModernTemperatureGradient.test.js`.


## Modern camera navigation and reusable poses

- The shared physical Scene/Compare camera supports focused-viewport keyboard navigation (W/A/S/D, Q/E, arrow-key Pan/Nick), adjustable movement and turn rates, and optional fixed Alt-wheel steps. Keyboard movement updates the pose while held and calculates the full optical scene on release; it is not live continuous physical rendering.
- East/North can be edited numerically. Named camera positions (including coordinates, orientation, focal length, aim and aspect) are stored as optional `cameraPositions` in Modern experiments, without extending Legacy state or changing physical A/B configurations. Up to 20 poses support save, restore, update, rename and delete; camera reset returns to the loaded workspace starting pose. Navigation speed is separately stored in local browser preferences.
- Future offline camera animation and video export remain deferred. See `docs/modern-camera-navigation.md` for the control contract and limitations.

### Experimental fast optical preview (standalone mathematical field)

- `src/optics/OpticalFastRayField.js` provides a low-cost, independently selectable
  2D field candidate using constant *conformal* log-gradient, with analytic
  forward-branch solutions for vacuum and flat engineered exponential endpoints.
  Built-in Standard is approximate, with explicit near-contact uncertainty and
  no automatic RK4 fallback; unsupported profiles never turn into visible rays.
- This module is **not connected** to Modern Scene/Compare rendering, navigation,
  or Legacy. The Accurate path remains unchanged. See
  `docs/fast-optical-preview.md`, `tests/OpticalFastRayField.test.js` and
  `tools/compare-fast-ray-field.js`. Production integration and camera Auto
  preview must follow separate pixel-accuracy and scheduling reviews.

### Manual Fast Preview in Modern (next integration stage)

- `CurvaturePhysicalSceneOptics` can now consume `OpticalFastRayField.sample()` for
  object silhouettes, fills and physical ground guides with no hidden RK4
  fallback. The ordinary Accurate field remains unchanged; the quality is
  explicitly keyed and independent Scene/Compare A/B preview sessions are used.
- Modern → Display offers manual `Accurate / Fast Preview` control. Accurate is
  the default; this display choice does not enter experiment URLs/JSON. Exact
  horizon overlays are disabled in Fast mode. Unsupported profiles are refused
  and the corresponding viewport is cleared instead of retaining stale pixels.
- Preview-specific contact margin is 0.1 m (versus 3 m in standalone Standard
  diagnostics): this is a visual approximation, **not** a verified confidence
  bound or a replacement for exact ground-contact detection. Browser pixel
  parity, mixed-profile and end-to-end FPS audits remain for the next stage.
- `tests/ModernFastPreview.test.js` covers the shared Modern geometry path,
  scene/Compare UI selection, zero RK4 calls, failure isolation and cache
  restoration. See `docs/fast-optical-preview.md`.

### Adaptive Fast Preview object LOD

- A separate `OpticalPreviewLod` utility selects full tower batches from the
  existing far-to-near painter order. It keeps the four nearest and farthest
  tower of each bank, thinning other towers only in Fast Preview; no authored
  scene or experiment field is changed. Non-towers remain fully intact.
- Modern Display offers Auto / full / manual stride 2, 4, 8, 16, 32; the
  session-only Auto feedback uses measured redraw time with separate Scene
  and joint Compare budgets and hysteresis. Compare A/B always share a stride.
- LOD is included in the Fast optical composition cache key and is entirely
  ignored by Accurate, including when a Preview LOD option is supplied.
- `tools/benchmark-preview-lod.js` measures cold optical composition only.
  Browser painter performance and pixel discrepancies are not yet certified.


### Automatic Fast Preview during camera navigation

- The Modern optical-quality selector now supports opt-in `Auto`: qualified
  camera motion temporarily uses throttled Fast Ray Field (at most one queued
  frame, nominal 120 ms between scheduling), while release/idle restores
  complete Accurate RK4 rendering with full tower detail.
- Keyboard W/A/S/D/Q/E, camera pointer drag and Alt/Shift-wheel support this
  policy, including shared Compare A/B camera and stride. Camera pointer
  cancellation restores its starting pose. Auto LOD starts at stride 8 and
  adapts to measured full frame cost. Unsupported profiles skip intermediate
  Fast renders and finish with Accurate; manual Fast still fails explicitly.
- Both the quality mode and Preview LOD remain transient UI preferences; no
  experiment/Legacy state is altered. Tests cover transitions and coalescing.

### Camera Animation (Modern)

- A single **Camera Animation** panel replaces the separate Camera Transition
  and Camera Sequence UI. The default workflow captures the live observer
  pose through **Add current view** and assigns automatic `Frame N` labels.
  A two-frame sequence is the former standalone transition. Named Saved views
  remain available under an optional collapsible library, with a separate
  **Add selected saved view** action for reusing them.
- Selecting a frame allows **Go to frame** and **Use current view** to replace
  its pose, reordering, removal and clearing. Incoming travel times (default
  5 seconds), holds, easing and optional names save on change; the first
  frame always has zero incoming travel.
- Persistence remains the previous optional `cameraSequence.keyframes` format.
  Legacy experiments, named sequences and JSON/URL links need no migration;
  frames own their pose snapshots. Only the redundant two-position UI and
  its redundant playback handlers were removed.
- The pure `ModernCameraInterpolator` and `ModernCameraSequence` still sample
  absolute time; browser playback uses the shared Fast Preview/LOD and idle
  Accurate restoration. Stop/Cancel/manual interruption and Compare A/B remain
  unchanged. Browser visual validation remains a separate step.

### Application preferences (after Camera Animation UI)

Modern keeps optical-quality policy, Fast Preview LOD policy, geometry backend
selection and navigation rates in a versioned browser-local preferences record.
Changes persist immediately; historical navigation-only preferences are migrated
when no consolidated record is present. Display provides a reset that clears
both preference generations, never experiment data. Preferences remain separate
from camera poses, keyframes, physical parameters and experiment URLs/JSON.
Malformed or inaccessible localStorage reverts to the reference defaults.


### Modern workspace persistence and Camera UI consistency

- Application Preferences now include a validated `workspace` value with
  remembered Scene / Compare / Demos mode, independent Scene and Compare
  Camera/Surface/Atmosphere/Objects/Display tabs, Compare editor A/B choice,
  and native `details` fold states keyed by stable `scene.*` / `compare.*` IDs.
  The original Display fold preferences are read for backward compatibility.
- Camera splits its controls into Position & orientation, Navigation and
  Camera Animation folds (plus optional Saved views and frame name); long
  explanations use the existing keyboard-accessible `?` help. Animation
  retains a frame count and total duration in its fold summary.
- Explicit experiment URLs retain their authored display mode/model; validated
  direct `mode`, `tab` and `model` query parameters override local layout for
  the opened page. The app marks its own history.replaceState-generated URL
  so a normal reload honors browser preferences without mistaking the URL
  for a newly opened shared link. Local experiments also take their workspace
  from browser prefs when these choices were explicitly saved. An old v1 preferences record
  lacking `workspace` keeps its previous experiment-selected mode/model.
- Reset workspace layout changes only tabs and fold state. Reset application
  preferences also clears workspace choices. Neither changes optical algorithms,
  Camera Animation keyframes, Legacy controls or the experiment JSON schema.

### Modern Experiment History Core

- Header **History** opens a separate, minimal text list backed by IndexedDB.
  Full snapshots are validated by `ModernExperimentState`; immutable stored
  A/B metadata are derived by `ModernExperimentFingerprint`. No changes were
  made to the v1 experiment serializer or optical calculations.
- Physical-input changes after a completed redraw schedule a debounced auto
  snapshot; camera-only motions, animation playback and workspace changes are
  excluded. Manual snapshots preserve all camera and Compare information.
  Consecutive duplicates are suppressed; recovery checkpoints additionally
  reuse matching snapshots anywhere in history, and no-op Restore avoids a
  checkpoint. Manual Save upgrades duplicate auto
  snapshots to protected entries.
- Restore validates the target and commits the current experiment as a
  protected recovery record before applying the requested saved state. A failed
  checkpoint blocks restore. Only unpinned automatic records are subject to
  200-entry retention and automatic clearing. Visual History now captures
  bounded, aspect-preserving real-Canvas Scene or labelled A/B thumbnails
  without artificial dark letterboxing, only after valid accurate rendering, with per-side stale-frame guards, optional atmospheric layers,
  read-only preview, newest/oldest ordering, pin/unpin, in-memory multi-selection,
  batch deletion and confirmed clear-all. Existing null-thumbnail records are
  supported. The gallery now defaults to a compact S layout, with optional M/L
  sizing persisted in Application Preferences. Double-clicking a card restores
  via the same serialized protected recovery path as the toolbar button; single
  click selects. Compact View/Pin/Delete actions are collapsed into a per-card
  details menu, while multi-select and accessibility remain available. UI layout
  changes neither stored history records nor physical or experiment schemas.
  Snapshot Inspector appears after a 350 ms hover or by keyboard focus on
  the thumbnail. The per-card **Info** action pins a viewport-clamped floating
  detail card for touch/keyboard use; **Esc** or Close dismisses it. The
  read-only view shows the active surface, atmosphere/refraction values,
  Compare A/B relationships and shared camera/objects. It uses only the
  already-loaded full experiment and metadata; no IndexedDB reads, optics
  recompute, experiment JSON/schema changes or restore gestures. The overlay
  is removed/recreated on list refresh and hidden on History close.
  Semantic A/B filters and Storyboard remain deferred. See
  `docs/modern-experiment-history.md` for usage and future design constraints.

### Animation Studio Camera HUD appearance (after Studio video composition)

- Animation Studio exposes a compact appearance editor in its Playback panel
  (background opacity 0–100%, four corners, size 75/100/125%). Scene/Compare
  retain their separate global appearance panel. An old Animation project
  inherits current browser preferences until appearance is explicitly set;
  modified and newly created projects persist appearance as an optional
  owned `cameraHudAppearance` field in the v1 Animation project schema.
- The editable Studio draft and v1 draft checkpoint retain this optional
  appearance without invalidating older saved projects or recovery data.
  The editor updates its last painted HUD without re-running optical rays.
- Optional PNG and MP4/WebM HUD overlays share a strict appearance validator,
  with placement inside each source view before Compare side-by-side assembly.
  Render and encoder Worker initialization carries the effective, fixed value;
  manifests record it only when overlay burn-in was requested. Disabled HUD
  never changes exported pixels or the underlying project physics.

### Animation Studio HUD integration hotfix

- The Modern HTML entrypoint must load `ModernAnimationCanvasHud.js` after
  telemetry/`ModernCameraHud.js` and **before** `ModernAnimationFrameExport.js`.
  Otherwise browser PNG/MP4/WebM planning can fail on missing
  `normalizeAppearance`, even though CommonJS unit tests pass.
- The upgraded Studio editor and render/encoder/archive Worker dependencies
  use refreshed script URLs to avoid mixing cached pre-HUD code with the
  current UI (`Invalid editor property` when editing `cameraHudAppearance`).
- Browser-script integration tests assert the real HTML dependency order,
  HUD draft editing, and video-plan creation; Legacy entrypoint is unchanged.

### Camera HUD export validation

- Verified that the optional appearance field on saved Animation projects is
  backward compatible and is consistently captured for PNG and MP4/WebM plans.
- The retained single-worker PNG `start` protocol now carries `cameraHud` and
  `cameraHudAppearance` into its second export plan, matching the parallel
  render protocol. Previously it silently omitted HUD burn-in.
- Regression tests compare disabled-HUD PNG bytes and Compare A/B video source
  Canvas operations across appearance settings, and execute the compatibility
  Worker `onmessage` path with a mocked optical painter.
- The Scene/Compare DOM HUD and Animation Studio preview share telemetry and
  placement model, but raster text rendering is not byte-for-byte equivalent
  to CSS. A browser-side visual comparison remains a manual acceptance check.

### Adaptive HUD text contrast

- Scene/Compare and Animation Studio preview use the same opacity-derived
  text/outline palette as PNG and MP4/WebM Canvas HUD burn-in. At 0% panel
  opacity the lettering is dark with a light halo; at 100% it is light with
  a dark halo; intermediate values interpolate text colors deterministically.
- The panel opacity still applies only to the panel background; the letters
  and their outlines remain opaque. The same palette is shared by the DOM
  HUD and Canvas export, including Compare A/B per-view overlays.
- Updated browser/Worker script URL cache keys for both changed HUD modules.
  Old Animation project appearance records require no migration.

### Animation Studio Compare video layout choice

- Export video now exposes `side-by-side` (one encoded video, default) and
  `separate` (two synchronized A/B MP4 or WebM streams in a ZIP) when the
  current Studio draft is a Compare project. Scene projects have no layout
  selector and still export a single stream. The pre-existing two-stream
  Worker/encoder protocol is reused; there are no optical solver changes.
- A shared lightweight output layout calculation powers both video plans and
  the live UI description, including output resolution, output stream count
  and RGBA payload per timestamp. The UI displays the actual credit-window
  bound, explicitly excluding renderer Canvas and codec memory. The layout
  is snapshotted at export start, carried to all Workers, and recorded in
  manifests. The separate-output ZIP retains its two video entries and JSON.
